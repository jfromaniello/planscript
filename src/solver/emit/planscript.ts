/**
 * PlanScript emitter - converts PlanState to PlanScript source code.
 */

import type { LayoutIntent } from '../intent/types.js';
import type { PlanState, PlacedRoom, PlacedOpening, Point } from '../types.js';

export interface EmitOptions {
  /** Plan name (defaults to "Generated Plan") */
  planName?: string;
  /** Include comments with zone/placement info */
  includeComments?: boolean;
  /** Include assertions */
  includeAssertions?: boolean;
}

/**
 * Emit PlanScript source code from a solved plan state.
 */
export function emitPlanScript(
  state: PlanState,
  intent: LayoutIntent,
  options: EmitOptions = {}
): string {
  const {
    planName = 'Generated Plan',
    includeComments = true,
    includeAssertions = true,
  } = options;

  const lines: string[] = [];

  // Header
  lines.push('units m');
  lines.push('');

  // Defaults
  lines.push('defaults {');
  lines.push(`  door_width ${formatNum(intent.defaults.doorWidth)}`);
  lines.push(`  window_width ${formatNum(intent.defaults.windowWidth)}`);
  lines.push('}');
  lines.push('');

  // Plan block
  lines.push(`plan "${planName}" {`);

  // Footprint
  lines.push('  ' + emitFootprint(state));
  lines.push('');

  // Rooms grouped by zone (band/depth)
  const rooms = Array.from(state.placed.values());
  
  // Separate corridor from regular rooms
  const corridorRoom = rooms.find(r => r.id === 'corridor');
  const regularRooms = rooms.filter(r => r.id !== 'corridor');
  
  const roomsByZone = groupRoomsByZone(regularRooms);

  for (const [zone, zoneRooms] of roomsByZone) {
    if (includeComments && zone !== 'ungrouped') {
      lines.push(`  # ${zone}`);
    }

    for (const room of zoneRooms) {
      const roomLines = emitRoom(room, includeComments);
      for (const line of roomLines) {
        lines.push('  ' + line);
      }
    }
    lines.push('');
  }

  // Emit corridor (as polygon if L-shaped, rect otherwise)
  if (corridorRoom) {
    if (includeComments) {
      lines.push('  # Circulation');
    }
    
    if (state.corridorPolygon && state.corridorPolygon.length > 4) {
      // L-shaped corridor - emit as polygon
      const corridorLines = emitCorridorPolygon('corridor', state.corridorPolygon, corridorRoom.label);
      for (const line of corridorLines) {
        lines.push('  ' + line);
      }
    } else {
      // Simple corridor - emit as rect
      const roomLines = emitRoom(corridorRoom, includeComments);
      for (const line of roomLines) {
        lines.push('  ' + line);
      }
    }
    lines.push('');
  }

  // Openings
  if (state.openings.length > 0) {
    if (includeComments) {
      lines.push('  # Openings');
    }
    for (const opening of state.openings) {
      const openingLines = emitOpening(opening);
      for (const line of openingLines) {
        lines.push('  ' + line);
      }
    }
    lines.push('');
  }

  // Assertions
  if (includeAssertions) {
    lines.push('  # Validation');
    if (intent.hard.noOverlap) {
      lines.push('  assert no_overlap rooms');
    }
    if (intent.hard.insideFootprint) {
      lines.push('  assert inside footprint all_rooms');
    }
    // Note: rooms_connected assertion checks adjacency, not door connectivity
    // The solver now validates reachability via doors separately
  }

  lines.push('}');

  return lines.join('\n');
}

function emitFootprint(state: PlanState): string {
  const fp = state.footprint;

  if (fp.kind === 'rect') {
    return `footprint rect (${formatNum(fp.min[0])}, ${formatNum(fp.min[1])}) (${formatNum(fp.max[0])}, ${formatNum(fp.max[1])})`;
  }

  // Polygon footprint
  const points = fp.points.map(p => `(${formatNum(p[0])}, ${formatNum(p[1])})`).join(', ');
  return `footprint polygon [\n    ${points}\n  ]`;
}

function emitRoom(room: PlacedRoom, includeComments: boolean): string[] {
  const lines: string[] = [];

  lines.push(`room ${room.id} {`);
  lines.push(`  rect (${formatNum(room.rect.x1)}, ${formatNum(room.rect.y1)}) (${formatNum(room.rect.x2)}, ${formatNum(room.rect.y2)})`);

  if (room.label && room.label !== room.id) {
    lines.push(`  label "${room.label}"`);
  }

  lines.push('}');

  return lines;
}

function emitOpening(opening: PlacedOpening): string[] {
  const lines: string[] = [];
  const id = generateOpeningId(opening);

  lines.push(`opening ${opening.type} ${id} {`);

  if (opening.connectsTo && !opening.isExterior) {
    // Interior door between rooms
    lines.push(`  between ${opening.roomId} and ${opening.connectsTo}`);
    lines.push('  on shared_edge');
  } else {
    // Exterior opening or single-room opening
    lines.push(`  on ${opening.roomId}.edge ${opening.edge}`);
  }

  // Position as percentage
  const posPercent = Math.round(opening.position * 100);
  lines.push(`  at ${posPercent}%`);

  // Width only if different from default
  lines.push(`  width ${formatNum(opening.width)}`);

  lines.push('}');

  return lines;
}

function groupRoomsByZone(rooms: PlacedRoom[]): Map<string, PlacedRoom[]> {
  const groups = new Map<string, PlacedRoom[]>();

  for (const room of rooms) {
    const zone = room.band && room.depth ? `${room.band}/${room.depth}` : 'ungrouped';

    if (!groups.has(zone)) {
      groups.set(zone, []);
    }
    groups.get(zone)!.push(room);
  }

  return groups;
}

let openingCounter = 0;

function generateOpeningId(opening: PlacedOpening): string {
  openingCounter++;
  const prefix = opening.type === 'door' ? 'd' : 'w';
  return `${prefix}${openingCounter}`;
}

function formatNum(n: number): string {
  // Round to 2 decimal places and remove trailing zeros
  const rounded = Math.round(n * 100) / 100;
  return rounded.toString();
}

/**
 * Reset the opening counter (useful for testing)
 */
export function resetOpeningCounter(): void {
  openingCounter = 0;
}

/**
 * Emit a compact single-line room definition.
 * Useful for simpler output.
 */
export function emitRoomCompact(room: PlacedRoom): string {
  const label = room.label && room.label !== room.id ? ` label "${room.label}"` : '';
  return `room ${room.id} { rect (${formatNum(room.rect.x1)}, ${formatNum(room.rect.y1)}) (${formatNum(room.rect.x2)}, ${formatNum(room.rect.y2)})${label} }`;
}

/**
 * Emit corridor as a polygon (for L-shaped or complex corridors).
 */
export function emitCorridorPolygon(id: string, points: Point[], label?: string): string[] {
  const lines: string[] = [];

  lines.push(`room ${id} {`);

  const pointStrs = points.map(p => `(${formatNum(p.x)}, ${formatNum(p.y)})`);
  lines.push(`  polygon [\n    ${pointStrs.join(',\n    ')}\n  ]`);

  if (label) {
    lines.push(`  label "${label}"`);
  }

  lines.push('}');

  return lines;
}

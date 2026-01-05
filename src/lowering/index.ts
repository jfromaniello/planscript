import type {
  Program,
  Point,
  RoomDefinition,
  RoomGeometry,
  RoomPolygon,
  RoomRectDiagonal,
  RoomRectAtSize,
  RoomRectCenterSize,
  RoomRectSizeOnly,
  RoomRectSpan,
  FootprintRect,
  FootprintPolygon,
  Footprint,
} from '../ast/types.js';

// ============================================================================
// Lowered Program (all geometry resolved to polygons)
// ============================================================================

export interface LoweredRoom {
  name: string;
  label?: string;
  polygon: Point[];
}

export interface Defaults {
  doorWidth?: number;
  windowWidth?: number;
}

export interface LoweredProgram {
  name: string;
  footprint: Point[];
  rooms: LoweredRoom[];
  openings: Program['plan']['openings'];
  wallOverrides: Program['plan']['wallOverrides'];
  assertions: Program['plan']['assertions'];
  defaults: Defaults;
}

// ============================================================================
// Lowering Error
// ============================================================================

export class LoweringError extends Error {
  constructor(
    message: string,
    public roomName?: string
  ) {
    super(message);
    this.name = 'LoweringError';
  }
}

// ============================================================================
// Lowering Functions
// ============================================================================

function lowerFootprint(footprint: Footprint): Point[] {
  if (footprint.type === 'FootprintPolygon') {
    return footprint.points;
  }
  // FootprintRect -> Polygon
  const { p1, p2 } = footprint;
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function rectDiagonalToPolygon(p1: Point, p2: Point): Point[] {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function rectAtSizeToPolygon(at: Point, size: Point): Point[] {
  return [
    { x: at.x, y: at.y },
    { x: at.x + size.x, y: at.y },
    { x: at.x + size.x, y: at.y + size.y },
    { x: at.x, y: at.y + size.y },
  ];
}

function rectCenterSizeToPolygon(center: Point, size: Point): Point[] {
  const halfW = size.x / 2;
  const halfH = size.y / 2;
  return [
    { x: center.x - halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y + halfH },
    { x: center.x - halfW, y: center.y + halfH },
  ];
}

function getRoomEdge(room: LoweredRoom, edge: 'left' | 'right' | 'top' | 'bottom'): number {
  const xs = room.polygon.map((p) => p.x);
  const ys = room.polygon.map((p) => p.y);

  switch (edge) {
    case 'left':
      return Math.min(...xs);
    case 'right':
      return Math.max(...xs);
    case 'top':
      return Math.max(...ys);
    case 'bottom':
      return Math.min(...ys);
  }
}

function getRoomBounds(room: LoweredRoom): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = room.polygon.map((p) => p.x);
  const ys = room.polygon.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function lowerRoomGeometry(
  room: RoomDefinition,
  resolvedRooms: Map<string, LoweredRoom>
): Point[] {
  const geometry = room.geometry;

  switch (geometry.type) {
    case 'RoomPolygon':
      return geometry.points;

    case 'RoomRectDiagonal':
      return rectDiagonalToPolygon(geometry.p1, geometry.p2);

    case 'RoomRectAtSize':
      return rectAtSizeToPolygon(geometry.at, geometry.size);

    case 'RoomRectCenterSize':
      return rectCenterSizeToPolygon(geometry.center, geometry.size);

    case 'RoomRectSizeOnly': {
      // Requires attach directive
      if (!room.attach) {
        throw new LoweringError(
          `Room "${room.name}" uses rect size() but has no attach directive`,
          room.name
        );
      }

      const targetRoom = resolvedRooms.get(room.attach.target);
      if (!targetRoom) {
        throw new LoweringError(
          `Room "${room.name}" attaches to unknown room "${room.attach.target}"`,
          room.name
        );
      }

      const targetBounds = getRoomBounds(targetRoom);
      const size = geometry.size;
      const gap = room.gap?.distance ?? 0;
      const alignment = room.align?.alignment ?? 'center';

      let x: number;
      let y: number;

      // Determine position based on direction
      switch (room.attach.direction) {
        case 'east_of':
          x = targetBounds.maxX + gap;
          break;
        case 'west_of':
          x = targetBounds.minX - size.x - gap;
          break;
        case 'north_of':
          y = targetBounds.maxY + gap;
          break;
        case 'south_of':
          y = targetBounds.minY - size.y - gap;
          break;
      }

      // Determine alignment
      if (room.attach.direction === 'east_of' || room.attach.direction === 'west_of') {
        switch (alignment) {
          case 'top':
            y = targetBounds.maxY - size.y;
            break;
          case 'bottom':
            y = targetBounds.minY;
            break;
          case 'center':
            y = (targetBounds.minY + targetBounds.maxY) / 2 - size.y / 2;
            break;
          default:
            y = targetBounds.minY;
        }
      } else {
        switch (alignment) {
          case 'left':
            x = targetBounds.minX;
            break;
          case 'right':
            x = targetBounds.maxX - size.x;
            break;
          case 'center':
            x = (targetBounds.minX + targetBounds.maxX) / 2 - size.x / 2;
            break;
          default:
            x = targetBounds.minX;
        }
      }

      return rectAtSizeToPolygon({ x: x!, y: y! }, size);
    }

    case 'RoomRectSpan': {
      const fromRoom = resolvedRooms.get(geometry.spanX.from.room);
      const toRoom = resolvedRooms.get(geometry.spanX.to.room);

      if (!fromRoom) {
        throw new LoweringError(
          `Room "${room.name}" references unknown room "${geometry.spanX.from.room}"`,
          room.name
        );
      }
      if (!toRoom) {
        throw new LoweringError(
          `Room "${room.name}" references unknown room "${geometry.spanX.to.room}"`,
          room.name
        );
      }

      const x1 = getRoomEdge(fromRoom, geometry.spanX.from.edge);
      const x2 = getRoomEdge(toRoom, geometry.spanX.to.edge);
      const y1 = geometry.spanY.from;
      const y2 = geometry.spanY.to;

      return rectDiagonalToPolygon({ x: x1, y: y1 }, { x: x2, y: y2 });
    }

    default:
      throw new LoweringError(`Unknown geometry type: ${(geometry as any).type}`, room.name);
  }
}

// ============================================================================
// Main Lowering Function
// ============================================================================

export function lower(program: Program): LoweredProgram {
  const plan = program.plan;
  const resolvedRooms = new Map<string, LoweredRoom>();

  // Lower footprint
  const footprint = lowerFootprint(plan.footprint);

  // Lower rooms in order (dependencies must come first)
  for (const room of plan.rooms) {
    const polygon = lowerRoomGeometry(room, resolvedRooms);
    const loweredRoom: LoweredRoom = {
      name: room.name,
      label: room.label,
      polygon,
    };
    resolvedRooms.set(room.name, loweredRoom);
  }

  // Extract defaults
  const defaults: Defaults = {};
  if (program.defaults) {
    if (program.defaults.doorWidth !== undefined) {
      defaults.doorWidth = program.defaults.doorWidth;
    }
    if (program.defaults.windowWidth !== undefined) {
      defaults.windowWidth = program.defaults.windowWidth;
    }
  }

  return {
    name: plan.name,
    footprint,
    rooms: Array.from(resolvedRooms.values()),
    openings: plan.openings,
    wallOverrides: plan.wallOverrides,
    assertions: plan.assertions,
    defaults,
  };
}

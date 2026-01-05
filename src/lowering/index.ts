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
  RoomFill,
  FootprintRect,
  FootprintPolygon,
  Footprint,
  AlignDirectiveSimple,
  AlignDirectiveExplicit,
  DimensionValue,
  SizeValue,
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

// Resolve 'auto' dimensions based on extend directive or target room
function resolveSize(
  sizeValue: SizeValue,
  room: RoomDefinition,
  targetBounds: { minX: number; maxX: number; minY: number; maxY: number },
  resolvedRooms: Map<string, LoweredRoom>
): Point {
  let x: number;
  let y: number;

  // Resolve X dimension
  if (sizeValue.x === 'auto') {
    if (room.extend && room.extend.axis === 'x') {
      // Use extend directive to calculate width
      const fromRoom = resolvedRooms.get(room.extend.from.room);
      const toRoom = resolvedRooms.get(room.extend.to.room);
      if (!fromRoom || !toRoom) {
        throw new LoweringError(
          `Room "${room.name}" extend references unknown room`,
          room.name
        );
      }
      const fromValue = getRoomEdge(fromRoom, room.extend.from.edge);
      const toValue = getRoomEdge(toRoom, room.extend.to.edge);
      x = Math.abs(toValue - fromValue);
    } else {
      // Default: use target room's width
      x = targetBounds.maxX - targetBounds.minX;
    }
  } else {
    x = sizeValue.x;
  }

  // Resolve Y dimension
  if (sizeValue.y === 'auto') {
    if (room.extend && room.extend.axis === 'y') {
      // Use extend directive to calculate height
      const fromRoom = resolvedRooms.get(room.extend.from.room);
      const toRoom = resolvedRooms.get(room.extend.to.room);
      if (!fromRoom || !toRoom) {
        throw new LoweringError(
          `Room "${room.name}" extend references unknown room`,
          room.name
        );
      }
      const fromValue = getRoomEdge(fromRoom, room.extend.from.edge);
      const toValue = getRoomEdge(toRoom, room.extend.to.edge);
      y = Math.abs(toValue - fromValue);
    } else {
      // Default: use target room's height
      y = targetBounds.maxY - targetBounds.minY;
    }
  } else {
    y = sizeValue.y;
  }

  return { x, y };
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
      const sizeValue = geometry.size;
      const gap = room.gap?.distance ?? 0;

      // Resolve auto dimensions based on extend directive or target room
      const resolvedSize = resolveSize(sizeValue, room, targetBounds, resolvedRooms);

      let x: number;
      let y: number;

      // Determine position based on direction
      switch (room.attach.direction) {
        case 'east_of':
          x = targetBounds.maxX + gap;
          break;
        case 'west_of':
          x = targetBounds.minX - resolvedSize.x - gap;
          break;
        case 'north_of':
          y = targetBounds.maxY + gap;
          break;
        case 'south_of':
          y = targetBounds.minY - resolvedSize.y - gap;
          break;
      }

      // Determine alignment - check for explicit or simple alignment
      const align = room.align;
      if (align && 'myEdge' in align) {
        // Explicit alignment: align my left with bedroom.left
        const explicitAlign = align as AlignDirectiveExplicit;
        const withRoom = resolvedRooms.get(explicitAlign.withRoom);
        if (!withRoom) {
          throw new LoweringError(
            `Room "${room.name}" aligns with unknown room "${explicitAlign.withRoom}"`,
            room.name
          );
        }
        const withValue = getRoomEdge(withRoom, explicitAlign.withEdge);
        
        // Calculate position based on which edge we're aligning
        switch (explicitAlign.myEdge) {
          case 'left':
            x = withValue;
            break;
          case 'right':
            x = withValue - resolvedSize.x;
            break;
          case 'top':
            y = withValue - resolvedSize.y;
            break;
          case 'bottom':
            y = withValue;
            break;
        }
      } else {
        // Simple alignment
        const simpleAlign = align as AlignDirectiveSimple | undefined;
        const alignment = simpleAlign?.alignment ?? 'center';
        
        if (room.attach.direction === 'east_of' || room.attach.direction === 'west_of') {
          switch (alignment) {
            case 'top':
              y = targetBounds.maxY - resolvedSize.y;
              break;
            case 'bottom':
              y = targetBounds.minY;
              break;
            case 'center':
              y = (targetBounds.minY + targetBounds.maxY) / 2 - resolvedSize.y / 2;
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
              x = targetBounds.maxX - resolvedSize.x;
              break;
            case 'center':
              x = (targetBounds.minX + targetBounds.maxX) / 2 - resolvedSize.x / 2;
              break;
            default:
              x = targetBounds.minX;
          }
        }
      }

      return rectAtSizeToPolygon({ x: x!, y: y! }, resolvedSize);
    }

    case 'RoomFill': {
      // Fill between two rooms
      const [room1Name, room2Name] = geometry.between;
      const room1 = resolvedRooms.get(room1Name);
      const room2 = resolvedRooms.get(room2Name);

      if (!room1) {
        throw new LoweringError(
          `Room "${room.name}" references unknown room "${room1Name}"`,
          room.name
        );
      }
      if (!room2) {
        throw new LoweringError(
          `Room "${room.name}" references unknown room "${room2Name}"`,
          room.name
        );
      }

      const bounds1 = getRoomBounds(room1);
      const bounds2 = getRoomBounds(room2);

      // Determine fill direction based on room positions
      // If rooms are separated horizontally, fill horizontally
      // If rooms are separated vertically, fill vertically
      const horizontalGap = Math.max(bounds1.minX, bounds2.minX) - Math.min(bounds1.maxX, bounds2.maxX);
      const verticalGap = Math.max(bounds1.minY, bounds2.minY) - Math.min(bounds1.maxY, bounds2.maxY);

      let minX: number, maxX: number, minY: number, maxY: number;

      if (horizontalGap > 0) {
        // Rooms are separated horizontally - fill the gap
        minX = Math.min(bounds1.maxX, bounds2.maxX);
        maxX = Math.max(bounds1.minX, bounds2.minX);
        
        // Use explicit width if provided, or calculate from gap
        if (geometry.width !== undefined) {
          const centerX = (minX + maxX) / 2;
          minX = centerX - geometry.width / 2;
          maxX = centerX + geometry.width / 2;
        }
        
        // Y spans from the max of the bottom edges to the min of the top edges
        minY = Math.max(bounds1.minY, bounds2.minY);
        maxY = Math.min(bounds1.maxY, bounds2.maxY);
        
        // Use explicit height if provided
        if (geometry.height !== undefined) {
          const centerY = (minY + maxY) / 2;
          minY = centerY - geometry.height / 2;
          maxY = centerY + geometry.height / 2;
        }
      } else if (verticalGap > 0) {
        // Rooms are separated vertically - fill the gap
        minY = Math.min(bounds1.maxY, bounds2.maxY);
        maxY = Math.max(bounds1.minY, bounds2.minY);
        
        // Use explicit height if provided
        if (geometry.height !== undefined) {
          const centerY = (minY + maxY) / 2;
          minY = centerY - geometry.height / 2;
          maxY = centerY + geometry.height / 2;
        }
        
        // X spans from the max of the left edges to the min of the right edges
        minX = Math.max(bounds1.minX, bounds2.minX);
        maxX = Math.min(bounds1.maxX, bounds2.maxX);
        
        // Use explicit width if provided
        if (geometry.width !== undefined) {
          const centerX = (minX + maxX) / 2;
          minX = centerX - geometry.width / 2;
          maxX = centerX + geometry.width / 2;
        }
      } else {
        // Rooms overlap or touch - use the bounding box of both
        minX = Math.min(bounds1.minX, bounds2.minX);
        maxX = Math.max(bounds1.maxX, bounds2.maxX);
        minY = Math.min(bounds1.minY, bounds2.minY);
        maxY = Math.max(bounds1.maxY, bounds2.maxY);
        
        if (geometry.width !== undefined) {
          const centerX = (minX + maxX) / 2;
          minX = centerX - geometry.width / 2;
          maxX = centerX + geometry.width / 2;
        }
        if (geometry.height !== undefined) {
          const centerY = (minY + maxY) / 2;
          minY = centerY - geometry.height / 2;
          maxY = centerY + geometry.height / 2;
        }
      }

      return rectDiagonalToPolygon({ x: minX, y: minY }, { x: maxX, y: maxY });
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

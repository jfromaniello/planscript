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
  ZoneDefinition,
  CourtyardDefinition,
  CardinalDirection,
  Hemisphere,
} from '../ast/types.js';

// ============================================================================
// Lowered Program (all geometry resolved to polygons)
// ============================================================================

export interface LoweredRoom {
  name: string;
  label?: string;
  polygon: Point[];
  zone?: string;  // Name of the zone this room belongs to (if any)
}

// Zone bounding box for positioning calculations
export interface ZoneBounds {
  name: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface LoweredCourtyard {
  name: string;
  label?: string;
  polygon: Point[];
}

export interface Defaults {
  doorWidth?: number;
  windowWidth?: number;
}

// Site configuration for orientation-based validations
export interface SiteInfo {
  street: CardinalDirection;      // Which direction the street/front faces
  hemisphere: Hemisphere;         // For solar calculations (default: north)
  // Derived directions
  back: CardinalDirection;        // Opposite of street
  morningSun: CardinalDirection;  // East (sun rises in the east in both hemispheres)
  afternoonSun: CardinalDirection; // West (sun sets in the west in both hemispheres)
  goodSun: CardinalDirection;     // South in northern hemisphere, north in southern (optimal for living spaces)
}

export interface LoweredProgram {
  name: string;
  footprint: Point[];
  rooms: LoweredRoom[];
  courtyards: LoweredCourtyard[];
  openings: Program['plan']['openings'];
  wallOverrides: Program['plan']['wallOverrides'];
  assertions: Program['plan']['assertions'];
  defaults: Defaults;
  site?: SiteInfo;
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
// Zone Lowering Functions
// ============================================================================

// Translate all points in a polygon by an offset
function translatePolygon(polygon: Point[], offset: Point): Point[] {
  return polygon.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }));
}

// Calculate bounding box from a set of rooms
function calculateZoneBounds(rooms: LoweredRoom[]): { minX: number; maxX: number; minY: number; maxY: number } {
  if (rooms.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  for (const room of rooms) {
    for (const p of room.polygon) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  
  return { minX, maxX, minY, maxY };
}

// Lower a zone: first lower its rooms in local coordinates, then calculate zone offset
function lowerZone(
  zone: ZoneDefinition,
  resolvedRooms: Map<string, LoweredRoom>,
  zoneBounds: Map<string, ZoneBounds>
): LoweredRoom[] {
  // First, lower all rooms within the zone using local coordinates
  const localRooms = new Map<string, LoweredRoom>();
  
  for (const room of zone.rooms) {
    const polygon = lowerRoomGeometry(room, localRooms);
    const loweredRoom: LoweredRoom = {
      name: room.name,
      label: room.label,
      polygon,
      zone: zone.name,
    };
    localRooms.set(room.name, loweredRoom);
  }
  
  // Calculate the zone's local bounding box (before translation)
  const localBounds = calculateZoneBounds(Array.from(localRooms.values()));
  const zoneWidth = localBounds.maxX - localBounds.minX;
  const zoneHeight = localBounds.maxY - localBounds.minY;
  
  // Calculate zone offset based on attach directive
  let offsetX = 0;
  let offsetY = 0;
  
  if (zone.attach) {
    // Check if target is a zone or a room
    const targetZone = zoneBounds.get(zone.attach.target);
    const targetRoom = resolvedRooms.get(zone.attach.target);
    
    let targetBounds: { minX: number; maxX: number; minY: number; maxY: number };
    
    if (targetZone) {
      targetBounds = targetZone;
    } else if (targetRoom) {
      targetBounds = getRoomBounds(targetRoom);
    } else {
      throw new LoweringError(
        `Zone "${zone.name}" attaches to unknown zone or room "${zone.attach.target}"`,
        zone.name
      );
    }
    
    const gap = zone.gap?.distance ?? 0;
    
    // Calculate base position based on direction
    switch (zone.attach.direction) {
      case 'east_of':
        offsetX = targetBounds.maxX + gap - localBounds.minX;
        break;
      case 'west_of':
        offsetX = targetBounds.minX - gap - zoneWidth - localBounds.minX;
        break;
      case 'north_of':
        offsetY = targetBounds.maxY + gap - localBounds.minY;
        break;
      case 'south_of':
        offsetY = targetBounds.minY - gap - zoneHeight - localBounds.minY;
        break;
    }
    
    // Apply alignment
    const align = zone.align;
    if (align && 'alignment' in align) {
      const alignment = (align as AlignDirectiveSimple).alignment;
      
      if (zone.attach.direction === 'east_of' || zone.attach.direction === 'west_of') {
        switch (alignment) {
          case 'top':
            offsetY = targetBounds.maxY - zoneHeight - localBounds.minY;
            break;
          case 'bottom':
            offsetY = targetBounds.minY - localBounds.minY;
            break;
          case 'center':
            offsetY = (targetBounds.minY + targetBounds.maxY) / 2 - zoneHeight / 2 - localBounds.minY;
            break;
        }
      } else {
        switch (alignment) {
          case 'left':
            offsetX = targetBounds.minX - localBounds.minX;
            break;
          case 'right':
            offsetX = targetBounds.maxX - zoneWidth - localBounds.minX;
            break;
          case 'center':
            offsetX = (targetBounds.minX + targetBounds.maxX) / 2 - zoneWidth / 2 - localBounds.minX;
            break;
        }
      }
    }
  }
  
  // Translate all rooms by the offset
  const translatedRooms: LoweredRoom[] = [];
  for (const room of localRooms.values()) {
    const translatedRoom: LoweredRoom = {
      name: room.name,
      label: room.label,
      polygon: translatePolygon(room.polygon, { x: offsetX, y: offsetY }),
      zone: zone.name,
    };
    translatedRooms.push(translatedRoom);
  }
  
  // Calculate and store the zone's global bounding box
  const globalBounds = calculateZoneBounds(translatedRooms);
  zoneBounds.set(zone.name, {
    name: zone.name,
    ...globalBounds,
  });
  
  return translatedRooms;
}

// ============================================================================
// Courtyard Lowering
// ============================================================================

function lowerCourtyard(courtyard: CourtyardDefinition): LoweredCourtyard {
  let polygon: Point[];
  
  if (courtyard.geometry.type === 'CourtyardRect') {
    const { p1, p2 } = courtyard.geometry;
    polygon = rectDiagonalToPolygon(p1, p2);
  } else {
    polygon = courtyard.geometry.points;
  }
  
  return {
    name: courtyard.name,
    label: courtyard.label,
    polygon,
  };
}

// ============================================================================
// Site Info Helpers
// ============================================================================

function getOppositeDirection(dir: CardinalDirection): CardinalDirection {
  switch (dir) {
    case 'north': return 'south';
    case 'south': return 'north';
    case 'east': return 'west';
    case 'west': return 'east';
  }
}

function deriveSiteInfo(street: CardinalDirection, hemisphere: Hemisphere = 'north'): SiteInfo {
  // Sun rises in the east and sets in the west in both hemispheres
  const morningSun: CardinalDirection = 'east';
  const afternoonSun: CardinalDirection = 'west';
  
  // In the northern hemisphere, the sun's path is through the southern sky,
  // so south-facing windows get the most daylight (optimal for living spaces).
  // In the southern hemisphere, the sun's path is through the northern sky,
  // so north-facing windows get the most daylight.
  const goodSun: CardinalDirection = hemisphere === 'north' ? 'south' : 'north';
  
  return {
    street,
    hemisphere,
    back: getOppositeDirection(street),
    morningSun,
    afternoonSun,
    goodSun,
  };
}

// ============================================================================
// Main Lowering Function
// ============================================================================

export function lower(program: Program): LoweredProgram {
  const plan = program.plan;
  const resolvedRooms = new Map<string, LoweredRoom>();
  const zoneBounds = new Map<string, ZoneBounds>();

  // Lower footprint
  const footprint = lowerFootprint(plan.footprint);

  // First, lower standalone rooms (not in zones) - they may be referenced by zones
  for (const room of plan.rooms) {
    const polygon = lowerRoomGeometry(room, resolvedRooms);
    const loweredRoom: LoweredRoom = {
      name: room.name,
      label: room.label,
      polygon,
    };
    resolvedRooms.set(room.name, loweredRoom);
  }

  // Then, lower zones in order (they can reference standalone rooms or previous zones)
  for (const zone of plan.zones) {
    const zoneRooms = lowerZone(zone, resolvedRooms, zoneBounds);
    
    // Add zone rooms to the resolved rooms map
    for (const room of zoneRooms) {
      resolvedRooms.set(room.name, room);
    }
  }

  // Lower courtyards
  const courtyards: LoweredCourtyard[] = [];
  for (const courtyard of plan.courtyards) {
    courtyards.push(lowerCourtyard(courtyard));
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

  // Derive site info if site declaration present
  let site: SiteInfo | undefined;
  if (program.site) {
    site = deriveSiteInfo(program.site.street, program.site.hemisphere ?? 'north');
  }

  return {
    name: plan.name,
    footprint,
    rooms: Array.from(resolvedRooms.values()),
    courtyards,
    openings: plan.openings,
    wallOverrides: plan.wallOverrides,
    assertions: plan.assertions,
    defaults,
    site,
  };
}

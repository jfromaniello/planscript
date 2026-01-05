import type { Point } from '../ast/types.js';
import type { LoweredProgram } from '../lowering/index.js';
import type { GeometryIR } from '../geometry/types.js';
import { calculatePolygonArea } from '../geometry/index.js';

// ============================================================================
// Validation Error
// ============================================================================

export interface ValidationError {
  code: string;
  message: string;
  room?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Error Codes
// ============================================================================

export const ErrorCodes = {
  POLYGON_NOT_CLOSED: 'E101',
  POLYGON_SELF_INTERSECTING: 'E102',
  POLYGON_TOO_FEW_POINTS: 'E103',
  ROOM_OUTSIDE_FOOTPRINT: 'E130',
  ROOMS_OVERLAP: 'E201',
  OPENING_NOT_ON_WALL: 'E310',
  OPENING_EXCEEDS_WALL: 'E311',
  ROOM_NO_ACCESS: 'E420',
  MIN_AREA_VIOLATION: 'E501',
  ZERO_AREA: 'E502',
} as const;

// ============================================================================
// Geometry Validation Helpers
// ============================================================================

function isPolygonClosed(points: Point[], epsilon = 1e-10): boolean {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  // Polygons don't need to repeat the first point - they are implicitly closed
  return true;
}

function polygonHasEnoughPoints(points: Point[]): boolean {
  return points.length >= 3;
}

function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if ((yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

function isPolygonInsidePolygon(inner: Point[], outer: Point[]): boolean {
  // Check if all points of inner polygon are inside outer polygon
  for (const point of inner) {
    if (!isPointInPolygon(point, outer)) {
      // Check if point is on the boundary
      if (!isPointOnPolygonBoundary(point, outer)) {
        return false;
      }
    }
  }
  return true;
}

function isPointOnPolygonBoundary(point: Point, polygon: Point[], epsilon = 1e-10): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = polygon[i];
    const p2 = polygon[j];

    // Check if point is on segment p1-p2
    const d1 = Math.sqrt((point.x - p1.x) ** 2 + (point.y - p1.y) ** 2);
    const d2 = Math.sqrt((point.x - p2.x) ** 2 + (point.y - p2.y) ** 2);
    const d12 = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

    if (Math.abs(d1 + d2 - d12) < epsilon) {
      return true;
    }
  }
  return false;
}

function doPolygonsOverlap(poly1: Point[], poly2: Point[]): boolean {
  // Simple check: if any vertex of one polygon is strictly inside the other
  for (const point of poly1) {
    if (isPointInPolygon(point, poly2) && !isPointOnPolygonBoundary(point, poly2)) {
      return true;
    }
  }
  for (const point of poly2) {
    if (isPointInPolygon(point, poly1) && !isPointOnPolygonBoundary(point, poly1)) {
      return true;
    }
  }

  // Check for edge intersections
  return doEdgesIntersect(poly1, poly2);
}

function doEdgesIntersect(poly1: Point[], poly2: Point[]): boolean {
  const n1 = poly1.length;
  const n2 = poly2.length;

  for (let i = 0; i < n1; i++) {
    const a1 = poly1[i];
    const a2 = poly1[(i + 1) % n1];

    for (let j = 0; j < n2; j++) {
      const b1 = poly2[j];
      const b2 = poly2[(j + 1) % n2];

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  return false;
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = direction(b1, b2, a1);
  const d2 = direction(b1, b2, a2);
  const d3 = direction(a1, a2, b1);
  const d4 = direction(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

function direction(p1: Point, p2: Point, p3: Point): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
}

// ============================================================================
// Validation Functions
// ============================================================================

function validatePolygons(lowered: LoweredProgram): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate footprint
  if (!polygonHasEnoughPoints(lowered.footprint)) {
    errors.push({
      code: ErrorCodes.POLYGON_TOO_FEW_POINTS,
      message: 'Footprint polygon must have at least 3 points',
    });
  }

  // Validate room polygons
  for (const room of lowered.rooms) {
    if (!polygonHasEnoughPoints(room.polygon)) {
      errors.push({
        code: ErrorCodes.POLYGON_TOO_FEW_POINTS,
        message: `Room "${room.name}" polygon must have at least 3 points`,
        room: room.name,
      });
    }

    const area = calculatePolygonArea(room.polygon);
    if (area === 0) {
      errors.push({
        code: ErrorCodes.ZERO_AREA,
        message: `Room "${room.name}" has zero area`,
        room: room.name,
      });
    }
  }

  return errors;
}

function validateInsideFootprint(lowered: LoweredProgram): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const room of lowered.rooms) {
    if (!isPolygonInsidePolygon(room.polygon, lowered.footprint)) {
      errors.push({
        code: ErrorCodes.ROOM_OUTSIDE_FOOTPRINT,
        message: `Room "${room.name}" is outside the footprint`,
        room: room.name,
      });
    }
  }

  return errors;
}

function validateNoOverlap(lowered: LoweredProgram): ValidationError[] {
  const errors: ValidationError[] = [];
  const rooms = lowered.rooms;

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (doPolygonsOverlap(rooms[i].polygon, rooms[j].polygon)) {
        errors.push({
          code: ErrorCodes.ROOMS_OVERLAP,
          message: `Rooms "${rooms[i].name}" and "${rooms[j].name}" overlap`,
          details: { room1: rooms[i].name, room2: rooms[j].name },
        });
      }
    }
  }

  return errors;
}

function validateOpeningsOnWalls(geometry: GeometryIR): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const opening of geometry.openings) {
    const wall = geometry.walls.find((w) => w.id === opening.wallId);
    if (!wall) {
      errors.push({
        code: ErrorCodes.OPENING_NOT_ON_WALL,
        message: `Opening "${opening.id}" is not placed on a valid wall`,
        details: { openingId: opening.id },
      });
    }
  }

  return errors;
}

function validateMinRoomArea(lowered: LoweredProgram): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const assertion of lowered.assertions) {
    if (assertion.type === 'AssertionMinRoomArea') {
      const room = lowered.rooms.find((r) => r.name === assertion.room);
      if (room) {
        const area = calculatePolygonArea(room.polygon);
        if (area < assertion.minArea) {
          errors.push({
            code: ErrorCodes.MIN_AREA_VIOLATION,
            message: `Room "${assertion.room}" area (${area.toFixed(2)}) is less than minimum (${assertion.minArea})`,
            room: assertion.room,
            details: { actual: area, minimum: assertion.minArea },
          });
        }
      }
    }
  }

  return errors;
}

// ============================================================================
// Main Validation Function
// ============================================================================

export function validate(lowered: LoweredProgram, geometry: GeometryIR): ValidationError[] {
  const errors: ValidationError[] = [];

  // Basic polygon validation
  errors.push(...validatePolygons(lowered));

  // Process assertions
  for (const assertion of lowered.assertions) {
    switch (assertion.type) {
      case 'AssertionInsideFootprint':
        errors.push(...validateInsideFootprint(lowered));
        break;
      case 'AssertionNoOverlap':
        errors.push(...validateNoOverlap(lowered));
        break;
      case 'AssertionOpeningsOnWalls':
        errors.push(...validateOpeningsOnWalls(geometry));
        break;
      case 'AssertionMinRoomArea':
        // Handled separately to process all min area assertions
        break;
      case 'AssertionRoomsConnected':
        // TODO: Implement connectivity check
        break;
    }
  }

  // Validate min room areas
  errors.push(...validateMinRoomArea(lowered));

  return errors;
}

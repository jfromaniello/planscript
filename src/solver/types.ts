/**
 * Internal geometry types for the solver.
 */

import type { RoomId, RoomType, ZoneId, EdgeDirection, Footprint } from './intent/types.js';

// Re-export types used by other modules
export type { EdgeDirection } from './intent/types.js';

/** Grid snapping precision in meters */
export const GRID_SNAP = 0.05;

/** Snap a value to the grid */
export function snap(value: number): number {
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
}

/** 2D point */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned rectangle */
export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Edge segment with orientation */
export interface Edge {
  a: Point;
  b: Point;
  orientation: 'h' | 'v';
}

/** A room that has been placed in the plan */
export interface PlacedRoom {
  id: RoomId;
  rect: Rect;
  label?: string;
  type: RoomType;
  band?: ZoneId;
  depth?: ZoneId;
}

/** Opening type */
export type OpeningType = 'door' | 'window';

/** A placed opening (door or window) */
export interface PlacedOpening {
  type: OpeningType;
  roomId: RoomId;
  edge: EdgeDirection;
  position: number; // 0-1 along the edge
  width: number;
  isExterior: boolean;
  connectsTo?: RoomId; // for doors between rooms
}

/** Current state of the layout being solved */
export interface PlanState {
  footprint: Footprint;
  placed: Map<RoomId, PlacedRoom>;
  unplaced: RoomId[];
  openings: PlacedOpening[];
  corridorPolygon?: Point[]; // if L-shaped or complex corridor
}

/** Result of solving */
export type SolveResult =
  | { success: true; state: PlanState; score: number }
  | { success: false; error: string; partialState?: PlanState };

// ============ Geometry utilities ============

export function rectWidth(r: Rect): number {
  return r.x2 - r.x1;
}

export function rectHeight(r: Rect): number {
  return r.y2 - r.y1;
}

export function rectArea(r: Rect): number {
  return rectWidth(r) * rectHeight(r);
}

export function rectCenter(r: Rect): Point {
  return {
    x: (r.x1 + r.x2) / 2,
    y: (r.y1 + r.y2) / 2,
  };
}

/** Check if two rects overlap (share interior area) */
export function rectsOverlap(a: Rect, b: Rect, epsilon = 0.001): boolean {
  // No overlap if one is entirely to the left, right, above, or below
  if (a.x2 <= b.x1 + epsilon) return false;
  if (b.x2 <= a.x1 + epsilon) return false;
  if (a.y2 <= b.y1 + epsilon) return false;
  if (b.y2 <= a.y1 + epsilon) return false;
  return true;
}

/** Check if rect a is entirely inside rect b */
export function rectInside(inner: Rect, outer: Rect, epsilon = 0.001): boolean {
  return (
    inner.x1 >= outer.x1 - epsilon &&
    inner.y1 >= outer.y1 - epsilon &&
    inner.x2 <= outer.x2 + epsilon &&
    inner.y2 <= outer.y2 + epsilon
  );
}

/** Check if two rects share an edge (are adjacent) */
export function rectsAdjacent(a: Rect, b: Rect, epsilon = 0.001): boolean {
  // Check if they share a vertical edge
  const shareVertical =
    (Math.abs(a.x2 - b.x1) < epsilon || Math.abs(a.x1 - b.x2) < epsilon) &&
    a.y1 < b.y2 - epsilon &&
    a.y2 > b.y1 + epsilon;

  // Check if they share a horizontal edge
  const shareHorizontal =
    (Math.abs(a.y2 - b.y1) < epsilon || Math.abs(a.y1 - b.y2) < epsilon) &&
    a.x1 < b.x2 - epsilon &&
    a.x2 > b.x1 + epsilon;

  return shareVertical || shareHorizontal;
}

/** Get the length of shared edge between two adjacent rects */
export function sharedEdgeLength(a: Rect, b: Rect, epsilon = 0.001): number {
  // Vertical shared edge
  if (Math.abs(a.x2 - b.x1) < epsilon || Math.abs(a.x1 - b.x2) < epsilon) {
    const overlapStart = Math.max(a.y1, b.y1);
    const overlapEnd = Math.min(a.y2, b.y2);
    return Math.max(0, overlapEnd - overlapStart);
  }

  // Horizontal shared edge
  if (Math.abs(a.y2 - b.y1) < epsilon || Math.abs(a.y1 - b.y2) < epsilon) {
    const overlapStart = Math.max(a.x1, b.x1);
    const overlapEnd = Math.min(a.x2, b.x2);
    return Math.max(0, overlapEnd - overlapStart);
  }

  return 0;
}

/** Get footprint as a Rect (bounding box for polygons) */
export function footprintToRect(fp: Footprint): Rect {
  if (fp.kind === 'rect') {
    return {
      x1: fp.min[0],
      y1: fp.min[1],
      x2: fp.max[0],
      y2: fp.max[1],
    };
  }
  // Bounding box of polygon
  const xs = fp.points.map(p => p[0]);
  const ys = fp.points.map(p => p[1]);
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  };
}

/** Check if a rect touches a specific edge of the footprint */
export function touchesEdge(rect: Rect, footprint: Rect, edge: EdgeDirection, epsilon = 0.001): boolean {
  switch (edge) {
    case 'south':
      return Math.abs(rect.y1 - footprint.y1) < epsilon;
    case 'north':
      return Math.abs(rect.y2 - footprint.y2) < epsilon;
    case 'west':
      return Math.abs(rect.x1 - footprint.x1) < epsilon;
    case 'east':
      return Math.abs(rect.x2 - footprint.x2) < epsilon;
  }
}

/** Check if a rect touches any exterior edge */
export function touchesExterior(rect: Rect, footprint: Rect, epsilon = 0.001): boolean {
  return (
    touchesEdge(rect, footprint, 'south', epsilon) ||
    touchesEdge(rect, footprint, 'north', epsilon) ||
    touchesEdge(rect, footprint, 'west', epsilon) ||
    touchesEdge(rect, footprint, 'east', epsilon)
  );
}

/** Create a rect from position and size */
export function makeRect(x: number, y: number, width: number, height: number): Rect {
  return {
    x1: snap(x),
    y1: snap(y),
    x2: snap(x + width),
    y2: snap(y + height),
  };
}

// ============ Polygon geometry utilities ============

/** Convert footprint to polygon points */
export function footprintToPolygon(fp: Footprint): Point[] {
  if (fp.kind === 'rect') {
    return [
      { x: fp.min[0], y: fp.min[1] },
      { x: fp.max[0], y: fp.min[1] },
      { x: fp.max[0], y: fp.max[1] },
      { x: fp.min[0], y: fp.max[1] },
    ];
  }
  return fp.points.map(([x, y]) => ({ x, y }));
}

/** Check if a point is inside a polygon using ray casting algorithm */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if ((yi > point.y) !== (yj > point.y) && 
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/** Check if a point is on the boundary of a polygon */
export function pointOnPolygonBoundary(point: Point, polygon: Point[], epsilon = 0.001): boolean {
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

/** Check if a point is inside or on the boundary of a polygon */
export function pointInOrOnPolygon(point: Point, polygon: Point[], epsilon = 0.001): boolean {
  return pointInPolygon(point, polygon) || pointOnPolygonBoundary(point, polygon, epsilon);
}

/** Check if a rectangle is entirely inside a polygon */
export function rectInsidePolygon(rect: Rect, polygon: Point[], epsilon = 0.001): boolean {
  // For concave polygons (like U-shape with courtyard), we need to check that
  // the rect's INTERIOR is inside the polygon, not just corners/edges.
  // Sample multiple interior points and ensure they're strictly inside.
  
  const width = rect.x2 - rect.x1;
  const height = rect.y2 - rect.y1;
  const inset = Math.min(width, height) * 0.1; // 10% inset from edges
  
  // Sample points slightly inside the rect (to avoid boundary ambiguity)
  const interiorPoints: Point[] = [
    // Center
    { x: (rect.x1 + rect.x2) / 2, y: (rect.y1 + rect.y2) / 2 },
    // Near corners (inset)
    { x: rect.x1 + inset, y: rect.y1 + inset },
    { x: rect.x2 - inset, y: rect.y1 + inset },
    { x: rect.x2 - inset, y: rect.y2 - inset },
    { x: rect.x1 + inset, y: rect.y2 - inset },
    // Near edge midpoints (inset)
    { x: (rect.x1 + rect.x2) / 2, y: rect.y1 + inset },
    { x: (rect.x1 + rect.x2) / 2, y: rect.y2 - inset },
    { x: rect.x1 + inset, y: (rect.y1 + rect.y2) / 2 },
    { x: rect.x2 - inset, y: (rect.y1 + rect.y2) / 2 },
  ];

  // All interior sample points must be strictly inside the polygon
  for (const point of interiorPoints) {
    if (!pointInPolygon(point, polygon)) {
      return false;
    }
  }

  // Also check corners are inside or on boundary (for rects that align with polygon edges)
  const corners: Point[] = [
    { x: rect.x1, y: rect.y1 },
    { x: rect.x2, y: rect.y1 },
    { x: rect.x2, y: rect.y2 },
    { x: rect.x1, y: rect.y2 },
  ];

  for (const corner of corners) {
    if (!pointInOrOnPolygon(corner, polygon, epsilon)) {
      return false;
    }
  }

  return true;
}

/** Check if a rectangle overlaps with a polygon (has any area inside) */
export function rectOverlapsPolygon(rect: Rect, polygon: Point[], epsilon = 0.001): boolean {
  // Check center first - most reliable
  const center: Point = { x: (rect.x1 + rect.x2) / 2, y: (rect.y1 + rect.y2) / 2 };
  if (pointInPolygon(center, polygon)) {
    return true;
  }

  // Check multiple sample points inside the rect (not just corners, which can be on boundary)
  // Use points slightly inside from corners to avoid boundary issues
  const inset = Math.min((rect.x2 - rect.x1), (rect.y2 - rect.y1)) * 0.1;
  const samplePoints: Point[] = [
    { x: rect.x1 + inset, y: rect.y1 + inset },
    { x: rect.x2 - inset, y: rect.y1 + inset },
    { x: rect.x2 - inset, y: rect.y2 - inset },
    { x: rect.x1 + inset, y: rect.y2 - inset },
    // Midpoints of edges
    { x: (rect.x1 + rect.x2) / 2, y: rect.y1 + inset },
    { x: (rect.x1 + rect.x2) / 2, y: rect.y2 - inset },
    { x: rect.x1 + inset, y: (rect.y1 + rect.y2) / 2 },
    { x: rect.x2 - inset, y: (rect.y1 + rect.y2) / 2 },
  ];

  for (const point of samplePoints) {
    if (pointInPolygon(point, polygon)) {
      return true;
    }
  }

  // Check if any polygon vertex is strictly inside the rect (not on boundary)
  for (const vertex of polygon) {
    if (vertex.x > rect.x1 + epsilon && vertex.x < rect.x2 - epsilon &&
        vertex.y > rect.y1 + epsilon && vertex.y < rect.y2 - epsilon) {
      return true;
    }
  }

  return false;
}

/** 
 * Check if a rect touches the exterior of a polygon footprint.
 * A rect touches the exterior if any of its edges lie on the polygon boundary.
 */
export function rectTouchesPolygonExterior(rect: Rect, polygon: Point[], epsilon = 0.001): boolean {
  // Check if any rect edge coincides with a polygon edge
  const rectEdges: [Point, Point][] = [
    [{ x: rect.x1, y: rect.y1 }, { x: rect.x2, y: rect.y1 }], // bottom
    [{ x: rect.x2, y: rect.y1 }, { x: rect.x2, y: rect.y2 }], // right
    [{ x: rect.x2, y: rect.y2 }, { x: rect.x1, y: rect.y2 }], // top
    [{ x: rect.x1, y: rect.y2 }, { x: rect.x1, y: rect.y1 }], // left
  ];

  const n = polygon.length;
  for (const [r1, r2] of rectEdges) {
    for (let i = 0; i < n; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % n];

      // Check if rect edge overlaps with polygon edge
      if (edgesOverlap(r1, r2, p1, p2, epsilon)) {
        return true;
      }
    }
  }

  return false;
}

/** Check if two line segments overlap (share a portion) */
function edgesOverlap(a1: Point, a2: Point, b1: Point, b2: Point, epsilon = 0.001): boolean {
  // Check if both edges are collinear and overlap
  const aHorizontal = Math.abs(a1.y - a2.y) < epsilon;
  const bHorizontal = Math.abs(b1.y - b2.y) < epsilon;
  const aVertical = Math.abs(a1.x - a2.x) < epsilon;
  const bVertical = Math.abs(b1.x - b2.x) < epsilon;

  if (aHorizontal && bHorizontal && Math.abs(a1.y - b1.y) < epsilon) {
    // Both horizontal at same Y
    const aMin = Math.min(a1.x, a2.x);
    const aMax = Math.max(a1.x, a2.x);
    const bMin = Math.min(b1.x, b2.x);
    const bMax = Math.max(b1.x, b2.x);
    return aMin < bMax - epsilon && aMax > bMin + epsilon;
  }

  if (aVertical && bVertical && Math.abs(a1.x - b1.x) < epsilon) {
    // Both vertical at same X
    const aMin = Math.min(a1.y, a2.y);
    const aMax = Math.max(a1.y, a2.y);
    const bMin = Math.min(b1.y, b2.y);
    const bMax = Math.max(b1.y, b2.y);
    return aMin < bMax - epsilon && aMax > bMin + epsilon;
  }

  return false;
}

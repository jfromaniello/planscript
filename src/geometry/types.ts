import type { Point } from '../ast/types.js';

// ============================================================================
// Geometry IR Types
// ============================================================================

export interface Polygon {
  points: Point[];
}

export interface WallSegment {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  isExterior: boolean;
  rooms: string[]; // room names this wall belongs to
}

export interface OpeningPlacement {
  id: string;
  type: 'door' | 'window';
  wallId: string;
  position: number; // distance along wall from start
  width: number;
  // Door-specific
  swing?: string;
  // Window-specific
  sill?: number;
}

export interface ResolvedRoom {
  name: string;
  label?: string;
  polygon: Polygon;
  area: number;
}

export interface ResolvedCourtyard {
  name: string;
  label?: string;
  polygon: Polygon;
  area: number;
}

export interface GeometryIR {
  footprint: Polygon;
  rooms: ResolvedRoom[];
  courtyards: ResolvedCourtyard[];
  walls: WallSegment[];
  openings: OpeningPlacement[];
}

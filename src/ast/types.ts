// ============================================================================
// Core Types
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export interface SourceSpan {
  start: SourceLocation;
  end: SourceLocation;
}

// ============================================================================
// AST Node Base
// ============================================================================

export interface ASTNode {
  type: string;
  span?: SourceSpan;
}

// ============================================================================
// Units and Configuration
// ============================================================================

export type UnitType = 'm' | 'meters' | 'cm' | 'mm' | 'ft' | 'in';

export interface UnitsDeclaration extends ASTNode {
  type: 'UnitsDeclaration';
  unit: UnitType;
}

export interface OriginDeclaration extends ASTNode {
  type: 'OriginDeclaration';
  point: Point;
}

export type AxisDirection = 'right' | 'left' | 'up' | 'down';

export interface AxisDeclaration extends ASTNode {
  type: 'AxisDeclaration';
  x: AxisDirection;
  y: AxisDirection;
}

export interface GridDeclaration extends ASTNode {
  type: 'GridDeclaration';
  size: number;
}

export interface DefaultsDeclaration extends ASTNode {
  type: 'DefaultsDeclaration';
  doorWidth?: number;
  windowWidth?: number;
}

// ============================================================================
// Footprint
// ============================================================================

export interface FootprintPolygon extends ASTNode {
  type: 'FootprintPolygon';
  points: Point[];
}

export interface FootprintRect extends ASTNode {
  type: 'FootprintRect';
  p1: Point;
  p2: Point;
}

export type Footprint = FootprintPolygon | FootprintRect;

// ============================================================================
// Room Geometry Definitions
// ============================================================================

export interface RoomPolygon extends ASTNode {
  type: 'RoomPolygon';
  points: Point[];
}

export interface RoomRectDiagonal extends ASTNode {
  type: 'RoomRectDiagonal';
  p1: Point;
  p2: Point;
}

export interface RoomRectAtSize extends ASTNode {
  type: 'RoomRectAtSize';
  at: Point;
  size: Point;
}

export interface RoomRectCenterSize extends ASTNode {
  type: 'RoomRectCenterSize';
  center: Point;
  size: Point;
}

export interface RoomRectSizeOnly extends ASTNode {
  type: 'RoomRectSizeOnly';
  size: SizeValue;
}

// Size can be a number or 'auto' for automatic calculation
export type DimensionValue = number | 'auto';

export interface SizeValue {
  x: DimensionValue;
  y: DimensionValue;
}

// Fill geometry: fill between room1 and room2
export interface RoomFill extends ASTNode {
  type: 'RoomFill';
  between: [string, string]; // room names
  width?: number;  // explicit width (for vertical fill)
  height?: number; // explicit height (for horizontal fill)
}

export type RoomGeometry =
  | RoomPolygon
  | RoomRectDiagonal
  | RoomRectAtSize
  | RoomRectCenterSize
  | RoomRectSizeOnly
  | RoomFill;

// ============================================================================
// Relative Placement
// ============================================================================

export type RelativeDirection = 'north_of' | 'south_of' | 'east_of' | 'west_of';
export type AlignmentType = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type AlignEdge = 'top' | 'bottom' | 'left' | 'right';

export interface AttachDirective extends ASTNode {
  type: 'AttachDirective';
  direction: RelativeDirection;
  target: string; // room name
}

// Simple alignment: align top/bottom/left/right/center
export interface AlignDirectiveSimple extends ASTNode {
  type: 'AlignDirective';
  alignment: AlignmentType;
}

// Explicit edge alignment: align my left with bedroom.left
export interface AlignDirectiveExplicit extends ASTNode {
  type: 'AlignDirective';
  myEdge: AlignEdge;
  withRoom: string;
  withEdge: AlignEdge;
}

export type AlignDirective = AlignDirectiveSimple | AlignDirectiveExplicit;

export interface GapDirective extends ASTNode {
  type: 'GapDirective';
  distance: number;
}

// Extend directive: extend from living.top to master.bottom
export interface ExtendDirective extends ASTNode {
  type: 'ExtendDirective';
  axis: 'x' | 'y';
  from: EdgeReference;
  to: EdgeReference;
}

// ============================================================================
// Span Syntax (for complex room definitions)
// ============================================================================

export interface SpanX extends ASTNode {
  type: 'SpanX';
  from: EdgeReference;
  to: EdgeReference;
}

export interface SpanY extends ASTNode {
  type: 'SpanY';
  from: number;
  to: number;
}

export interface EdgeReference {
  room: string;
  edge: 'left' | 'right' | 'top' | 'bottom';
}

export interface RoomRectSpan extends ASTNode {
  type: 'RoomRectSpan';
  spanX: SpanX;
  spanY: SpanY;
}

// ============================================================================
// Room Definition
// ============================================================================

export interface RoomDefinition extends ASTNode {
  type: 'RoomDefinition';
  name: string;
  label?: string;
  geometry: RoomGeometry | RoomRectSpan;
  attach?: AttachDirective;
  align?: AlignDirective;
  gap?: GapDirective;
  extend?: ExtendDirective;
}

// ============================================================================
// Openings (Doors and Windows)
// ============================================================================

export type OpeningType = 'door' | 'window';
export type SwingDirection = string; // room name

// Position can be absolute (meters) or percentage of wall length
export interface PositionAbsolute {
  type: 'absolute';
  value: number; // in meters
}

export interface PositionPercentage {
  type: 'percentage';
  value: number; // 0-100
}

export type Position = PositionAbsolute | PositionPercentage;

// Door between two rooms (on shared wall)
export interface DoorOpeningBetween extends ASTNode {
  type: 'DoorOpening';
  name: string;
  between: [string, string]; // room names
  on: 'shared_edge';
  at: Position;
  width: number;
  swing?: SwingDirection;
}

// Door on a single room's edge (exterior door, e.g., front door)
export interface DoorOpeningEdge extends ASTNode {
  type: 'DoorOpening';
  name: string;
  room: string;
  edge: EdgeSide;
  at: Position;
  width: number;
  swing?: SwingDirection;
}

export type DoorOpening = DoorOpeningBetween | DoorOpeningEdge;

export type EdgeSide = 'north' | 'south' | 'east' | 'west';

export interface WindowOpening extends ASTNode {
  type: 'WindowOpening';
  name: string;
  room: string;
  edge: EdgeSide;
  at: Position;
  width: number;
  sill?: number;
}

export type Opening = DoorOpening | WindowOpening;

// ============================================================================
// Wall Override
// ============================================================================

export interface WallThicknessOverride extends ASTNode {
  type: 'WallThicknessOverride';
  room: string;
  edge: EdgeSide;
  thickness: number;
}

// ============================================================================
// Assertions
// ============================================================================

export type AssertionType =
  | 'inside_footprint'
  | 'no_overlap'
  | 'openings_on_walls'
  | 'min_room_area'
  | 'rooms_connected';

export interface AssertionInsideFootprint extends ASTNode {
  type: 'AssertionInsideFootprint';
  target: 'all_rooms' | string;
}

export interface AssertionNoOverlap extends ASTNode {
  type: 'AssertionNoOverlap';
  target: 'rooms';
}

export interface AssertionOpeningsOnWalls extends ASTNode {
  type: 'AssertionOpeningsOnWalls';
}

export interface AssertionMinRoomArea extends ASTNode {
  type: 'AssertionMinRoomArea';
  room: string;
  minArea: number;
}

export interface AssertionRoomsConnected extends ASTNode {
  type: 'AssertionRoomsConnected';
}

export type Assertion =
  | AssertionInsideFootprint
  | AssertionNoOverlap
  | AssertionOpeningsOnWalls
  | AssertionMinRoomArea
  | AssertionRoomsConnected;

// ============================================================================
// Plan (Top-Level Container)
// ============================================================================

export interface PlanDefinition extends ASTNode {
  type: 'PlanDefinition';
  name: string;
  footprint: Footprint;
  rooms: RoomDefinition[];
  openings: Opening[];
  wallOverrides: WallThicknessOverride[];
  assertions: Assertion[];
}

// ============================================================================
// Program (Root AST Node)
// ============================================================================

export interface Program extends ASTNode {
  type: 'Program';
  units?: UnitsDeclaration;
  origin?: OriginDeclaration;
  axis?: AxisDeclaration;
  grid?: GridDeclaration;
  defaults?: DefaultsDeclaration;
  plan: PlanDefinition;
}

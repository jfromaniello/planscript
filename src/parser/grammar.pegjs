// ============================================================================
// PlanScript Grammar (Peggy + ts-pegjs)
// ============================================================================

// ============================================================================
// Program (Entry Point)
// ============================================================================

Program
  = _ units:UnitsDeclaration? _ origin:OriginDeclaration? _ axis:AxisDeclaration? _ grid:GridDeclaration? _ defaults:DefaultsDeclaration? _ plan:PlanDefinition _ {
      const loc = location();
      return {
        type: 'Program',
        units: units ?? undefined,
        origin: origin ?? undefined,
        axis: axis ?? undefined,
        grid: grid ?? undefined,
        defaults: defaults ?? undefined,
        plan,
        span: {
          start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset },
          end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset }
        }
      } as AST.Program;
    }

// ============================================================================
// Declarations
// ============================================================================

UnitsDeclaration
  = "units"i _ unit:UnitType {
      const loc = location();
      return { type: 'UnitsDeclaration', unit, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.UnitsDeclaration;
    }

UnitType
  = "meters"i { return 'meters' as AST.UnitType; }
  / "mm"i { return 'mm' as AST.UnitType; }
  / "cm"i { return 'cm' as AST.UnitType; }
  / "m"i { return 'm' as AST.UnitType; }
  / "ft"i { return 'ft' as AST.UnitType; }
  / "in"i { return 'in' as AST.UnitType; }

OriginDeclaration
  = "origin"i _ point:Point {
      const loc = location();
      return { type: 'OriginDeclaration', point, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.OriginDeclaration;
    }

AxisDeclaration
  = "axis"i _ "x"i _ ":" _ x:AxisDirection _ "y"i _ ":" _ y:AxisDirection {
      const loc = location();
      return { type: 'AxisDeclaration', x, y, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.AxisDeclaration;
    }

AxisDirection
  = "right"i { return 'right' as AST.AxisDirection; }
  / "left"i { return 'left' as AST.AxisDirection; }
  / "up"i { return 'up' as AST.AxisDirection; }
  / "down"i { return 'down' as AST.AxisDirection; }

GridDeclaration
  = "grid"i _ size:Number {
      const loc = location();
      return { type: 'GridDeclaration', size, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.GridDeclaration;
    }

DefaultsDeclaration
  = "defaults"i _ "{" _ content:(_ DefaultsContent)* _ "}" {
      const loc = location();
      const result: AST.DefaultsDeclaration = {
        type: 'DefaultsDeclaration',
        span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } }
      };
      
      for (const [, item] of content) {
        if (item.type === 'doorWidth') {
          result.doorWidth = item.value;
        } else if (item.type === 'windowWidth') {
          result.windowWidth = item.value;
        }
      }
      
      return result;
    }

DefaultsContent
  = DefaultsDoorWidth
  / DefaultsWindowWidth

DefaultsDoorWidth
  = "door_width"i _ value:Number {
      return { type: 'doorWidth', value };
    }

DefaultsWindowWidth
  = "window_width"i _ value:Number {
      return { type: 'windowWidth', value };
    }

// ============================================================================
// Plan Definition
// ============================================================================

PlanDefinition
  = "plan"i _ name:String? _ "{" _ content:(_ PlanContent)* _ "}" {
      const loc = location();
      const result: AST.PlanDefinition = {
        type: 'PlanDefinition',
        name: name ?? 'unnamed',
        footprint: undefined as unknown as AST.Footprint,
        zones: [],
        rooms: [],
        courtyards: [],
        openings: [],
        wallOverrides: [],
        assertions: [],
        span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } }
      };
      
      for (const [, item] of content) {
        if (item.type === 'FootprintPolygon' || item.type === 'FootprintRect') {
          result.footprint = item;
        } else if (item.type === 'ZoneDefinition') {
          result.zones.push(item);
        } else if (item.type === 'RoomDefinition') {
          result.rooms.push(item);
        } else if (item.type === 'CourtyardDefinition') {
          result.courtyards.push(item);
        } else if (item.type === 'DoorOpening' || item.type === 'WindowOpening') {
          result.openings.push(item);
        } else if (item.type === 'WallThicknessOverride') {
          result.wallOverrides.push(item);
        } else if (item.type.startsWith('Assertion')) {
          result.assertions.push(item as AST.Assertion);
        }
      }
      
      return result;
    }

PlanContent
  = Footprint
  / ZoneDefinition
  / CourtyardDefinition
  / RoomDefinition
  / Opening
  / WallThicknessOverride
  / Assertion

// ============================================================================
// Footprint
// ============================================================================

Footprint
  = FootprintPolygon
  / FootprintRect

FootprintPolygon
  = "footprint"i _ "polygon"i _ points:PointList {
      const loc = location();
      return { type: 'FootprintPolygon', points, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.FootprintPolygon;
    }

FootprintRect
  = "footprint"i _ "rect"i _ p1:Point _ p2:Point {
      const loc = location();
      return { type: 'FootprintRect', p1, p2, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.FootprintRect;
    }

// ============================================================================
// Zone Definition
// ============================================================================

ZoneDefinition
  = "zone"i _ name:Identifier _ "{" _ content:(_ ZoneContent)* _ "}" {
      const loc = location();
      const result: AST.ZoneDefinition = {
        type: 'ZoneDefinition',
        name,
        rooms: [],
        span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } }
      };
      
      for (const [, item] of content) {
        if (item.type === 'label') {
          result.label = item.value;
        } else if (item.type === 'AttachDirective') {
          result.attach = item;
        } else if (item.type === 'AlignDirective') {
          result.align = item;
        } else if (item.type === 'GapDirective') {
          result.gap = item;
        } else if (item.type === 'RoomDefinition') {
          result.rooms.push(item);
        }
      }
      
      return result;
    }

ZoneContent
  = RoomDefinition
  / ZoneLabel
  / AttachDirective
  / AlignDirective
  / GapDirective

ZoneLabel
  = "label"i _ value:String {
      return { type: 'label', value };
    }

// ============================================================================
// Courtyard Definition (Open Spaces / Voids)
// ============================================================================

CourtyardDefinition
  = "courtyard"i _ name:Identifier _ "{" _ content:(_ CourtyardContent)* _ "}" {
      const loc = location();
      const result: AST.CourtyardDefinition = {
        type: 'CourtyardDefinition',
        name,
        geometry: undefined as unknown as AST.CourtyardGeometry,
        span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } }
      };
      
      for (const [, item] of content) {
        if (item.type === 'label') {
          result.label = item.value;
        } else if (item.type === 'CourtyardRect' || item.type === 'CourtyardPolygon') {
          result.geometry = item;
        }
      }
      
      return result;
    }

CourtyardContent
  = CourtyardGeometry
  / CourtyardLabel

CourtyardGeometry
  = CourtyardPolygon
  / CourtyardRect

CourtyardRect
  = "rect"i _ p1:Point _ p2:Point {
      const loc = location();
      return { type: 'CourtyardRect', p1, p2, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.CourtyardRect;
    }

CourtyardPolygon
  = "polygon"i _ points:PointList {
      const loc = location();
      return { type: 'CourtyardPolygon', points, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.CourtyardPolygon;
    }

CourtyardLabel
  = "label"i _ value:String {
      return { type: 'label', value };
    }

// ============================================================================
// Room Definition
// ============================================================================

RoomDefinition
  = "room"i _ name:Identifier _ "{" _ content:(_ RoomContent)* _ "}" {
      const loc = location();
      const result: AST.RoomDefinition = {
        type: 'RoomDefinition',
        name,
        geometry: undefined as unknown as AST.RoomGeometry,
        span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } }
      };
      
      let width: number | undefined;
      let height: number | undefined;
      
      for (const [, item] of content) {
        if (item.type === 'label') {
          result.label = item.value;
        } else if (item.type === 'AttachDirective') {
          result.attach = item;
        } else if (item.type === 'AlignDirective') {
          result.align = item;
        } else if (item.type === 'GapDirective') {
          result.gap = item;
        } else if (item.type === 'ExtendDirective') {
          result.extend = item;
        } else if (item.type === 'WidthDirective') {
          width = item.value;
        } else if (item.type === 'HeightDirective') {
          height = item.value;
        } else {
          result.geometry = item;
        }
      }
      
      // Apply width/height to RoomFill geometry if present
      if (result.geometry && result.geometry.type === 'RoomFill') {
        if (width !== undefined) result.geometry.width = width;
        if (height !== undefined) result.geometry.height = height;
      }
      
      return result;
    }

RoomContent
  = RoomGeometry
  / RoomLabel
  / AttachDirective
  / AlignDirective
  / GapDirective
  / ExtendDirective
  / WidthDirective
  / HeightDirective

RoomLabel
  = "label"i _ value:String {
      return { type: 'label', value };
    }

// ============================================================================
// Room Geometry
// ============================================================================

RoomGeometry
  = RoomPolygon
  / RoomRectSpan
  / RoomRectAtSize
  / RoomRectCenterSize
  / RoomRectSizeOnly
  / RoomRectDiagonal
  / RoomFill

RoomPolygon
  = "polygon"i _ points:PointList {
      const loc = location();
      return { type: 'RoomPolygon', points, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.RoomPolygon;
    }

RoomRectDiagonal
  = "rect"i _ p1:Point _ p2:Point {
      const loc = location();
      return { type: 'RoomRectDiagonal', p1, p2, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.RoomRectDiagonal;
    }

RoomRectAtSize
  = "rect"i _ "at"i _ at:Point _ "size"i _ size:Point {
      const loc = location();
      return { type: 'RoomRectAtSize', at, size, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.RoomRectAtSize;
    }

RoomRectCenterSize
  = "rect"i _ "center"i _ center:Point _ "size"i _ size:Point {
      const loc = location();
      return { type: 'RoomRectCenterSize', center, size, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.RoomRectCenterSize;
    }

RoomRectSizeOnly
  = "rect"i _ "size"i _ size:SizeValue {
      const loc = location();
      return { type: 'RoomRectSizeOnly', size, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.RoomRectSizeOnly;
    }

// Size value can include 'auto' for automatic dimension calculation
SizeValue
  = "(" _ x:DimensionValue _ "," _ y:DimensionValue _ ")" {
      return { x, y } as AST.SizeValue;
    }

DimensionValue
  = "auto"i { return 'auto' as const; }
  / value:Number { return value; }

// Fill geometry: fill between room1 and room2
RoomFill
  = "fill"i _ "between"i _ room1:Identifier _ "and"i _ room2:Identifier {
      const loc = location();
      return { 
        type: 'RoomFill', 
        between: [room1, room2] as [string, string],
        span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } }
      } as AST.RoomFill;
    }

RoomRectSpan
  = "rect"i _ "span"i _ "x"i _ "from"i _ fromEdge:EdgeReference _ "to"i _ toEdge:EdgeReference _ "y"i _ "(" _ y1:Number _ "," _ y2:Number _ ")" {
      const loc = location();
      return {
        type: 'RoomRectSpan',
        spanX: { type: 'SpanX', from: fromEdge, to: toEdge },
        spanY: { type: 'SpanY', from: y1, to: y2 },
        span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } }
      } as AST.RoomRectSpan;
    }

EdgeReference
  = room:Identifier "." edge:EdgeRefSide {
      return { room, edge } as AST.EdgeReference;
    }

EdgeRefSide
  = "left"i { return 'left' as const; }
  / "right"i { return 'right' as const; }
  / "top"i { return 'top' as const; }
  / "bottom"i { return 'bottom' as const; }

// ============================================================================
// Relative Placement
// ============================================================================

AttachDirective
  = "attach"i _ direction:RelativeDirection _ target:Identifier {
      const loc = location();
      return { type: 'AttachDirective', direction, target, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.AttachDirective;
    }

RelativeDirection
  = "north_of"i { return 'north_of' as AST.RelativeDirection; }
  / "south_of"i { return 'south_of' as AST.RelativeDirection; }
  / "east_of"i { return 'east_of' as AST.RelativeDirection; }
  / "west_of"i { return 'west_of' as AST.RelativeDirection; }

AlignDirective
  = AlignDirectiveExplicit
  / AlignDirectiveSimple

// Explicit edge alignment: align my left with bedroom.left
AlignDirectiveExplicit
  = "align"i _ "my"i _ myEdge:AlignEdge _ "with"i _ withRoom:Identifier "." withEdge:AlignEdge {
      const loc = location();
      return { 
        type: 'AlignDirective', 
        myEdge, 
        withRoom, 
        withEdge, 
        span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } }
      } as AST.AlignDirectiveExplicit;
    }

// Simple alignment: align top/bottom/left/right/center
AlignDirectiveSimple
  = "align"i _ alignment:AlignmentType {
      const loc = location();
      return { type: 'AlignDirective', alignment, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.AlignDirectiveSimple;
    }

AlignmentType
  = "top"i { return 'top' as AST.AlignmentType; }
  / "bottom"i { return 'bottom' as AST.AlignmentType; }
  / "left"i { return 'left' as AST.AlignmentType; }
  / "right"i { return 'right' as AST.AlignmentType; }
  / "center"i { return 'center' as AST.AlignmentType; }

AlignEdge
  = "top"i { return 'top' as AST.AlignEdge; }
  / "bottom"i { return 'bottom' as AST.AlignEdge; }
  / "left"i { return 'left' as AST.AlignEdge; }
  / "right"i { return 'right' as AST.AlignEdge; }

GapDirective
  = "gap"i _ distance:Number {
      const loc = location();
      return { type: 'GapDirective', distance, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.GapDirective;
    }

// Extend directive: extend from living.top to master.bottom
ExtendDirective
  = "extend"i _ "from"i _ from:EdgeReference _ "to"i _ to:EdgeReference {
      const loc = location();
      // Determine axis from the edges referenced
      const fromIsVertical = from.edge === 'top' || from.edge === 'bottom';
      const axis = fromIsVertical ? 'y' : 'x';
      return { 
        type: 'ExtendDirective', 
        axis,
        from, 
        to, 
        span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } }
      } as AST.ExtendDirective;
    }

// Width directive for fill geometry
WidthDirective
  = "width"i _ value:Number {
      return { type: 'WidthDirective', value };
    }

// Height directive for fill geometry  
HeightDirective
  = "height"i _ value:Number {
      return { type: 'HeightDirective', value };
    }

// ============================================================================
// Openings
// ============================================================================

Opening
  = DoorOpening
  / WindowOpening

DoorOpening
  = "opening"i _ "door"i _ name:Identifier _ "{" _ content:(_ DoorContent)* _ "}" {
      const loc = location();
      const span = { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } };
      
      // Collect all content items
      let between: [string, string] | undefined;
      let roomEdge: { room: string; edge: AST.EdgeSide } | undefined;
      let at: AST.Position = { type: 'absolute', value: 0 };
      let width = 0;
      let swing: string | undefined;
      
      for (const [, item] of content) {
        if (item.type === 'between') {
          between = item.rooms;
        } else if (item.type === 'onSharedEdge') {
          // shared_edge marker (used with between)
        } else if (item.type === 'onRoomEdge') {
          roomEdge = { room: item.room, edge: item.edge };
        } else if (item.type === 'at') {
          at = item.position;
        } else if (item.type === 'width') {
          width = item.value;
        } else if (item.type === 'swing') {
          swing = item.room;
        }
      }
      
      // Return appropriate door type based on content
      if (roomEdge) {
        // Door on single room edge (exterior door)
        const result: AST.DoorOpening = {
          type: 'DoorOpening',
          name,
          room: roomEdge.room,
          edge: roomEdge.edge,
          at,
          width,
          span
        };
        if (swing) result.swing = swing;
        return result;
      } else {
        // Door between two rooms
        const result: AST.DoorOpening = {
          type: 'DoorOpening',
          name,
          between: between || ['', ''],
          on: 'shared_edge' as const,
          at,
          width,
          span
        };
        if (swing) result.swing = swing;
        return result;
      }
    }

DoorContent
  = DoorBetween
  / DoorOnRoomEdge
  / DoorOnSharedEdge
  / DoorAt
  / DoorWidth
  / DoorSwing

DoorBetween
  = "between"i _ room1:Identifier _ "and"i _ room2:Identifier {
      return { type: 'between', rooms: [room1, room2] as [string, string] };
    }

DoorOnRoomEdge
  = "on"i _ room:Identifier "." "edge"i _ edge:EdgeSide {
      return { type: 'onRoomEdge', room, edge };
    }

DoorOnSharedEdge
  = "on"i _ "shared_edge"i {
      return { type: 'onSharedEdge' };
    }

DoorAt
  = "at"i _ position:Position {
      return { type: 'at', position };
    }

Position
  = value:Number "%" {
      return { type: 'percentage', value } as AST.PositionPercentage;
    }
  / value:Number {
      return { type: 'absolute', value } as AST.PositionAbsolute;
    }

DoorWidth
  = "width"i _ value:Number {
      return { type: 'width', value };
    }

DoorSwing
  = "swing"i _ room:Identifier {
      return { type: 'swing', room };
    }

WindowOpening
  = "opening"i _ "window"i _ name:Identifier _ "{" _ content:(_ WindowContent)* _ "}" {
      const loc = location();
      const result: AST.WindowOpening = {
        type: 'WindowOpening',
        name,
        room: '',
        edge: 'south',
        at: { type: 'absolute', value: 0 } as AST.Position,
        width: 0,
        span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } }
      };
      
      for (const [, item] of content) {
        if (item.type === 'windowOn') {
          result.room = item.room;
          result.edge = item.edge;
        } else if (item.type === 'at') {
          result.at = item.position;
        } else if (item.type === 'width') {
          result.width = item.value;
        } else if (item.type === 'sill') {
          result.sill = item.value;
        }
      }
      
      return result;
    }

WindowContent
  = WindowOn
  / WindowAt
  / WindowWidth
  / WindowSill

WindowOn
  = "on"i _ room:Identifier "." "edge"i _ edge:EdgeSide {
      return { type: 'windowOn', room, edge };
    }

WindowAt
  = "at"i _ position:Position {
      return { type: 'at', position };
    }

WindowWidth
  = "width"i _ value:Number {
      return { type: 'width', value };
    }

WindowSill
  = "sill"i _ value:Number {
      return { type: 'sill', value };
    }

EdgeSide
  = "north"i { return 'north' as AST.EdgeSide; }
  / "south"i { return 'south' as AST.EdgeSide; }
  / "east"i { return 'east' as AST.EdgeSide; }
  / "west"i { return 'west' as AST.EdgeSide; }

// ============================================================================
// Wall Thickness Override
// ============================================================================

WallThicknessOverride
  = "wall_thickness"i _ room:Identifier "." edge:EdgeSide _ thickness:Number {
      const loc = location();
      return { type: 'WallThicknessOverride', room, edge, thickness, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.WallThicknessOverride;
    }

// ============================================================================
// Assertions
// ============================================================================

Assertion
  = AssertionInsideFootprint
  / AssertionNoOverlap
  / AssertionOpeningsOnWalls
  / AssertionMinRoomArea
  / AssertionRoomsConnected

AssertionInsideFootprint
  = "assert"i _ "inside"i _ "footprint"i _ target:("all_rooms"i / Identifier) {
      const loc = location();
      const t = typeof target === 'string' && target.toLowerCase() === 'all_rooms' ? 'all_rooms' : target;
      return { type: 'AssertionInsideFootprint', target: t, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.AssertionInsideFootprint;
    }

AssertionNoOverlap
  = "assert"i _ "no_overlap"i _ "rooms"i {
      const loc = location();
      return { type: 'AssertionNoOverlap', target: 'rooms', span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.AssertionNoOverlap;
    }

AssertionOpeningsOnWalls
  = "assert"i _ "openings_on_walls"i {
      const loc = location();
      return { type: 'AssertionOpeningsOnWalls', span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.AssertionOpeningsOnWalls;
    }

AssertionMinRoomArea
  = "assert"i _ "min_room_area"i _ room:Identifier _ ">=" _ minArea:Number {
      const loc = location();
      return { type: 'AssertionMinRoomArea', room, minArea, span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.AssertionMinRoomArea;
    }

AssertionRoomsConnected
  = "assert"i _ "rooms_connected"i {
      const loc = location();
      return { type: 'AssertionRoomsConnected', span: { start: { line: loc.start.line, column: loc.start.column, offset: loc.start.offset }, end: { line: loc.end.line, column: loc.end.column, offset: loc.end.offset } } } as AST.AssertionRoomsConnected;
    }

// ============================================================================
// Primitives
// ============================================================================

Point
  = "(" _ x:Number _ "," _ y:Number _ ")" {
      return { x, y } as AST.Point;
    }

PointList
  = PointListBracketed
  / PointListSpaced

// Bracketed syntax: [ (1, 2), (3, 4), (5, 6) ]
PointListBracketed
  = "[" _ head:Point tail:(_ "," _ Point)* _ ","? _ "]" {
      return [head, ...tail.map((t: [unknown, unknown, unknown, AST.Point]) => t[3])];
    }

// Original space-separated syntax: (1, 2) (3, 4) (5, 6)
PointListSpaced
  = head:Point tail:(_ Point)* {
      return [head, ...tail.map((t: [unknown, AST.Point]) => t[1])];
    }

Number
  = value:$("-"? [0-9]+ ("." [0-9]+)?) unit:("m"i / "cm"i / "mm"i / "ft"i / "in"i)? {
      return parseFloat(value);
    }

String
  = "\"" chars:$[^"]* "\"" {
      return chars;
    }

Identifier
  = $([a-zA-Z_][a-zA-Z0-9_]*)

// ============================================================================
// Whitespace and Comments
// ============================================================================

_
  = (Whitespace / Comment)*

Whitespace
  = [ \t\n\r]+

Comment
  = "#" [^\n]* "\n"?
  / "//" [^\n]* "\n"?
  / "/*" (!"*/" .)* "*/"

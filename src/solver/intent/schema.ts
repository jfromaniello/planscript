/**
 * TypeBox schemas for the floor plan solver intent format.
 * These provide:
 * - Runtime validation
 * - TypeScript type inference
 * - JSON Schema generation for users
 */

import { Type, type Static } from '@sinclair/typebox';

// =============================================================================
// Basic Types
// =============================================================================

export const UnitsSchema = Type.Union([Type.Literal('m'), Type.Literal('cm')], {
  description: 'Unit of measurement. All dimensions will be interpreted in this unit.',
});

export const EdgeDirectionSchema = Type.Union(
  [Type.Literal('north'), Type.Literal('south'), Type.Literal('east'), Type.Literal('west')],
  { description: 'Cardinal direction for edge alignment' }
);

export const Point2DSchema = Type.Tuple([Type.Number(), Type.Number()], {
  description: 'A 2D coordinate as [x, y]',
});

// =============================================================================
// Footprint
// =============================================================================

export const RectFootprintSchema = Type.Object(
  {
    kind: Type.Literal('rect'),
    min: Point2DSchema,
    max: Point2DSchema,
  },
  {
    description: 'Rectangular footprint defined by min and max corners',
    additionalProperties: false,
  }
);

export const PolygonFootprintSchema = Type.Object(
  {
    kind: Type.Literal('polygon'),
    points: Type.Array(Point2DSchema, { minItems: 3 }),
  },
  {
    description: 'Polygon footprint defined by vertices (must be convex or simple)',
    additionalProperties: false,
  }
);

export const FootprintSchema = Type.Union([RectFootprintSchema, PolygonFootprintSchema], {
  description: 'Building footprint - the outer boundary of the floor plan',
});

// =============================================================================
// Zone Specifications
// =============================================================================

export const ZoneIdSchema = Type.String({
  description: 'Zone identifier (e.g., "front", "middle", "back", "left", "right")',
  minLength: 1,
});

export const BandSpecSchema = Type.Object(
  {
    id: ZoneIdSchema,
    minWidth: Type.Optional(Type.Number({ minimum: 0, description: 'Minimum width of this band' })),
    targetWidth: Type.Optional(Type.Number({ minimum: 0, description: 'Target width of this band' })),
    maxWidth: Type.Optional(Type.Number({ minimum: 0, description: 'Maximum width of this band' })),
  },
  {
    description: 'Vertical band (left-to-right division) specification',
    additionalProperties: false,
  }
);

export const DepthSpecSchema = Type.Object(
  {
    id: ZoneIdSchema,
    minDepth: Type.Optional(Type.Number({ minimum: 0, description: 'Minimum depth of this zone' })),
    targetDepth: Type.Optional(Type.Number({ minimum: 0, description: 'Target depth of this zone' })),
    maxDepth: Type.Optional(Type.Number({ minimum: 0, description: 'Maximum depth of this zone' })),
  },
  {
    description: 'Horizontal depth zone (front-to-back division) specification',
    additionalProperties: false,
  }
);

// =============================================================================
// Room Types & Categories
// =============================================================================

export const RoomTypeSchema = Type.Union(
  [
    Type.Literal('bedroom'),
    Type.Literal('bath'),
    Type.Literal('kitchen'),
    Type.Literal('dining'),
    Type.Literal('living'),
    Type.Literal('office'),
    Type.Literal('garage'),
    Type.Literal('laundry'),
    Type.Literal('hall'),
    Type.Literal('corridor'),
    Type.Literal('foyer'),
    Type.Literal('stairwell'),
    Type.Literal('closet'),
    Type.Literal('ensuite'),
    Type.Literal('utility'),
    Type.Literal('storage'),
    Type.Literal('other'),
  ],
  {
    description: 'Type of room, used for defaults and access rules',
  }
);

export const RoomCategorySchema = Type.Union(
  [
    Type.Literal('circulation'),
    Type.Literal('private'),
    Type.Literal('public'),
    Type.Literal('service'),
  ],
  {
    description:
      'Room category for access rules. circulation: hall, corridor, foyer, stairwell. private: bedroom, bath, closet, ensuite. public: living, dining, kitchen, office. service: laundry, garage, storage, utility.',
  }
);

export const RoomIdSchema = Type.String({
  description: 'Unique room identifier',
  minLength: 1,
});

// =============================================================================
// Room Specification
// =============================================================================

export const AspectRatioSchema = Type.Object(
  {
    min: Type.Number({ minimum: 0, description: 'Minimum width/height ratio' }),
    max: Type.Number({ minimum: 0, description: 'Maximum width/height ratio' }),
  },
  {
    description: 'Aspect ratio constraints (width/height)',
    additionalProperties: false,
  }
);

export const RoomSpecSchema = Type.Object(
  {
    id: RoomIdSchema,
    type: RoomTypeSchema,
    label: Type.Optional(Type.String({ description: 'Display label (defaults to id)' })),

    // Geometry targets
    minArea: Type.Number({
      exclusiveMinimum: 0,
      description: 'Minimum required area for this room',
    }),
    targetArea: Type.Optional(
      Type.Number({ exclusiveMinimum: 0, description: 'Target area (solver will try to achieve)' })
    ),
    maxArea: Type.Optional(
      Type.Number({ exclusiveMinimum: 0, description: 'Maximum area (soft constraint, penalized if exceeded)' })
    ),
    minWidth: Type.Optional(
      Type.Number({ exclusiveMinimum: 0, description: 'Minimum width constraint' })
    ),
    minHeight: Type.Optional(
      Type.Number({ exclusiveMinimum: 0, description: 'Minimum height constraint' })
    ),
    maxWidth: Type.Optional(
      Type.Number({ exclusiveMinimum: 0, description: 'Maximum width constraint' })
    ),
    maxHeight: Type.Optional(
      Type.Number({ exclusiveMinimum: 0, description: 'Maximum height constraint' })
    ),
    aspect: Type.Optional(AspectRatioSchema),
    fillCell: Type.Optional(
      Type.Boolean({
        description:
          'If true, room will try to fill its entire cell rather than just meeting area targets',
      })
    ),

    // Placement intent
    preferredBands: Type.Optional(
      Type.Array(ZoneIdSchema, { description: 'Preferred vertical bands for this room' })
    ),
    preferredDepths: Type.Optional(
      Type.Array(ZoneIdSchema, { description: 'Preferred depth zones for this room' })
    ),
    mustTouchExterior: Type.Optional(
      Type.Boolean({ description: 'Room must have at least one exterior wall' })
    ),
    mustTouchEdge: Type.Optional(EdgeDirectionSchema),

    // Adjacency
    adjacentTo: Type.Optional(
      Type.Array(RoomIdSchema, { description: 'Rooms this room should be adjacent to' })
    ),
    avoidAdjacentTo: Type.Optional(
      Type.Array(RoomIdSchema, { description: 'Rooms this room should NOT be adjacent to' })
    ),

    // Connectivity
    needsAccessFrom: Type.Optional(
      Type.Array(RoomIdSchema, {
        description: 'Rooms that must provide door access to this room',
      })
    ),
    isCirculation: Type.Optional(
      Type.Boolean({ description: 'Mark this room as circulation space (overrides type-based detection)' })
    ),
    hasExteriorDoor: Type.Optional(
      Type.Boolean({ description: 'This room has the main exterior door (entry point for reachability)' })
    ),
    isEnsuite: Type.Optional(
      Type.Boolean({
        description:
          'For bathrooms: marks as ensuite (private to one bedroom). If not specified, inferred from adjacencies.',
      })
    ),
  },
  {
    description: 'Specification for a single room',
    additionalProperties: false,
  }
);

// =============================================================================
// Opening Defaults
// =============================================================================

export const OpeningDefaultsSchema = Type.Object(
  {
    doorWidth: Type.Number({
      exclusiveMinimum: 0,
      description: 'Default interior door width',
    }),
    windowWidth: Type.Number({
      exclusiveMinimum: 0,
      description: 'Default window width',
    }),
    exteriorDoorWidth: Type.Optional(
      Type.Number({
        exclusiveMinimum: 0,
        description: 'Exterior door width (defaults to doorWidth)',
      })
    ),
    corridorWidth: Type.Optional(
      Type.Number({
        exclusiveMinimum: 0,
        description: 'Default corridor width (defaults to 1.2m)',
      })
    ),
  },
  {
    description: 'Default dimensions for doors and windows',
    additionalProperties: false,
  }
);

// =============================================================================
// Constraints
// =============================================================================

export const HardConstraintsSchema = Type.Object(
  {
    noOverlap: Type.Boolean({ description: 'Rooms must not overlap' }),
    insideFootprint: Type.Boolean({ description: 'All rooms must be inside the footprint' }),
    allRoomsReachable: Type.Optional(
      Type.Boolean({
        description: 'All rooms must be reachable from the entry point (defaults to true)',
      })
    ),
  },
  {
    description: 'Hard constraints that must be satisfied',
    additionalProperties: false,
  }
);

export const SoftConstraintKeySchema = Type.Union(
  [
    Type.Literal('respectPreferredZones'),
    Type.Literal('adjacencySatisfaction'),
    Type.Literal('minimizeHallArea'),
    Type.Literal('maximizeExteriorGlazing'),
    Type.Literal('bathroomClustering'),
    Type.Literal('compactness'),
    Type.Literal('minimizeExteriorWallBreaks'),
  ],
  { description: 'Soft constraint identifier for weight configuration' }
);

export const WeightsSchema = Type.Partial(
  Type.Object({
    respectPreferredZones: Type.Number({ description: 'Weight for respecting preferred zones' }),
    adjacencySatisfaction: Type.Number({ description: 'Weight for satisfying adjacency requirements' }),
    minimizeHallArea: Type.Number({ description: 'Weight for minimizing hallway area' }),
    maximizeExteriorGlazing: Type.Number({ description: 'Weight for maximizing exterior windows' }),
    bathroomClustering: Type.Number({ description: 'Weight for clustering bathrooms together' }),
    compactness: Type.Number({ description: 'Weight for compact room shapes' }),
    minimizeExteriorWallBreaks: Type.Number({ description: 'Weight for minimizing exterior wall breaks' }),
  }),
  { description: 'Soft constraint weights (all optional, have defaults)' }
);

// =============================================================================
// Access Rules
// =============================================================================

export const RoomTypeOrCategorySchema = Type.Union([RoomTypeSchema, RoomCategorySchema], {
  description: 'Either a specific room type or a category',
});

export const AccessRuleSchema = Type.Object(
  {
    roomType: RoomTypeOrCategorySchema,
    accessibleFrom: Type.Optional(
      Type.Array(RoomTypeOrCategorySchema, {
        description: 'Which room types/categories can have doors leading TO this room',
      })
    ),
    canLeadTo: Type.Optional(
      Type.Array(RoomTypeOrCategorySchema, {
        description: 'Which room types/categories this room can have doors leading TO',
      })
    ),
  },
  {
    description: 'Access rule defining door placement between room types',
    additionalProperties: false,
  }
);

export const AccessRulePresetSchema = Type.Union(
  [Type.Literal('open_plan'), Type.Literal('traditional'), Type.Literal('privacy_focused')],
  {
    description:
      'Predefined access rule preset. open_plan: minimal restrictions. traditional: bedrooms from circulation, formal flow. privacy_focused: strict private/public separation.',
  }
);

// =============================================================================
// Main Layout Intent Schema
// =============================================================================

export const LayoutIntentSchema = Type.Object(
  {
    units: UnitsSchema,
    footprint: FootprintSchema,

    // Zone decomposition (optional but recommended)
    bands: Type.Optional(
      Type.Array(BandSpecSchema, {
        description: 'Vertical bands (left-to-right divisions)',
      })
    ),
    depths: Type.Optional(
      Type.Array(DepthSpecSchema, {
        description: 'Depth zones (front-to-back divisions)',
      })
    ),

    // Global anchors
    frontEdge: EdgeDirectionSchema,
    gardenEdge: Type.Optional(EdgeDirectionSchema),

    // Defaults
    defaults: OpeningDefaultsSchema,

    // Rooms
    rooms: Type.Array(RoomSpecSchema, {
      minItems: 1,
      description: 'List of rooms to place in the floor plan',
    }),

    // Hard constraints
    hard: HardConstraintsSchema,

    // Access rules
    accessRulePreset: Type.Optional(AccessRulePresetSchema),
    accessRules: Type.Optional(
      Type.Array(AccessRuleSchema, {
        description: 'Custom access rules (override/extend preset)',
      })
    ),

    // Soft constraint weights
    weights: Type.Optional(WeightsSchema),
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://raw.githubusercontent.com/jfromaniello/planscript/main/intent-schema.json',
    title: 'PlanScript Layout Intent',
    description:
      'Input format for the PlanScript floor plan solver. Defines rooms, constraints, and preferences for automatic floor plan generation.',
    additionalProperties: false,
  }
);

// =============================================================================
// Type Exports (derived from schemas)
// =============================================================================

export type Units = Static<typeof UnitsSchema>;
export type EdgeDirection = Static<typeof EdgeDirectionSchema>;
export type Point2D = Static<typeof Point2DSchema>;
export type RectFootprint = Static<typeof RectFootprintSchema>;
export type PolygonFootprint = Static<typeof PolygonFootprintSchema>;
export type Footprint = Static<typeof FootprintSchema>;
export type ZoneId = Static<typeof ZoneIdSchema>;
export type BandSpec = Static<typeof BandSpecSchema>;
export type DepthSpec = Static<typeof DepthSpecSchema>;
export type RoomType = Static<typeof RoomTypeSchema>;
export type RoomCategory = Static<typeof RoomCategorySchema>;
export type RoomId = Static<typeof RoomIdSchema>;
export type AspectRatio = Static<typeof AspectRatioSchema>;
export type RoomSpec = Static<typeof RoomSpecSchema>;
export type OpeningDefaults = Static<typeof OpeningDefaultsSchema>;
export type HardConstraints = Static<typeof HardConstraintsSchema>;
export type SoftConstraintKey = Static<typeof SoftConstraintKeySchema>;
export type Weights = Static<typeof WeightsSchema>;
export type AccessRule = Static<typeof AccessRuleSchema>;
export type AccessRulePreset = Static<typeof AccessRulePresetSchema>;
export type LayoutIntent = Static<typeof LayoutIntentSchema>;

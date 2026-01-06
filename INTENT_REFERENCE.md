# Intent Reference

This document describes the JSON intent format used by the PlanScript solver to generate floor plans. The solver takes a high-level description of what you want (rooms, constraints, preferences) and produces valid PlanScript code.

## Table of Contents

- [Quick Start](#quick-start)
- [Top-Level Structure](#top-level-structure)
- [Footprint](#footprint)
- [Bands and Depths](#bands-and-depths)
- [Rooms](#rooms)
- [Access Rules](#access-rules)
- [Hard Constraints](#hard-constraints)
- [Soft Constraints (Weights)](#soft-constraints-weights)
- [Defaults](#defaults)
- [Complete Example](#complete-example)
- [Architectural Patterns](#architectural-patterns)

---

## Quick Start

A minimal intent file:

```json
{
  "units": "m",
  "footprint": { "kind": "rect", "min": [0, 0], "max": [12, 10] },
  "frontEdge": "south",
  "defaults": {
    "doorWidth": 0.9,
    "windowWidth": 1.5
  },
  "rooms": [
    { "id": "hall", "type": "hall", "minArea": 10, "hasExteriorDoor": true },
    { "id": "living", "type": "living", "minArea": 20, "adjacentTo": ["hall"] },
    { "id": "bedroom", "type": "bedroom", "minArea": 12, "adjacentTo": ["hall"] }
  ],
  "hard": {
    "noOverlap": true,
    "insideFootprint": true
  }
}
```

Run with:
```bash
planscript intent.json --out plan.psc --svg plan.svg
```

---

## Top-Level Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `units` | `"m"` \| `"cm"` | Yes | Measurement units. Internally converted to meters. |
| `footprint` | Footprint | Yes | Building outline. |
| `frontEdge` | EdgeDirection | Yes | Which edge faces the street/entrance. |
| `gardenEdge` | EdgeDirection | No | Which edge faces the garden (affects window placement). |
| `defaults` | OpeningDefaults | Yes | Default sizes for doors and windows. |
| `bands` | BandSpec[] | No | Vertical zone divisions (left-to-right). |
| `depths` | DepthSpec[] | No | Horizontal zone divisions (front-to-back). |
| `rooms` | RoomSpec[] | Yes | Room definitions. |
| `hard` | HardConstraints | Yes | Non-negotiable constraints. |
| `accessRulePreset` | AccessRulePreset | No | Predefined door placement rules. |
| `accessRules` | AccessRule[] | No | Custom door placement rules. |
| `weights` | SoftConstraints | No | Tunable optimization weights. |

### EdgeDirection

One of: `"north"`, `"south"`, `"east"`, `"west"`

In the coordinate system:
- **south** = bottom edge (y = 0), typically the street/front
- **north** = top edge (y = max), typically the garden/back
- **west** = left edge (x = 0)
- **east** = right edge (x = max)

---

## Footprint

The building outline. Can be rectangular or a polygon.

### Rectangular Footprint

```json
{
  "kind": "rect",
  "min": [0, 0],
  "max": [14, 10]
}
```

Creates a 14m × 10m rectangle.

### Polygon Footprint

For L-shaped, U-shaped, or irregular buildings:

```json
{
  "kind": "polygon",
  "points": [
    [0, 0], [18, 0], [18, 14], [12, 14], 
    [12, 5], [6, 5], [6, 14], [0, 14]
  ]
}
```

Points must be in order (clockwise or counter-clockwise) and form a closed shape.

**Common Shapes:**

L-shape (main body + extension):
```json
{
  "kind": "polygon",
  "points": [
    [0, 0], [10, 0], [10, 5], [16, 5],
    [16, 12], [0, 12]
  ]
}
```

U-shape (with courtyard):
```json
{
  "kind": "polygon", 
  "points": [
    [0, 0], [18, 0], [18, 14], [12, 14],
    [12, 5], [6, 5], [6, 14], [0, 14]
  ]
}
```

---

## Bands and Depths

Bands and depths divide the footprint into a grid of cells. This helps the solver understand where different types of rooms should go.

### Bands (Vertical Divisions)

Bands divide the building left-to-right. Common pattern: private | circulation | public

```json
"bands": [
  { "id": "private", "targetWidth": 5, "minWidth": 4, "maxWidth": 6 },
  { "id": "circulation", "targetWidth": 2, "minWidth": 1.5, "maxWidth": 2.5 },
  { "id": "public", "targetWidth": 7, "minWidth": 6, "maxWidth": 8 }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier referenced by rooms. |
| `targetWidth` | number | Preferred width in units. |
| `minWidth` | number | Minimum allowed width. |
| `maxWidth` | number | Maximum allowed width. |

### Depths (Horizontal Divisions)

Depths divide the building front-to-back. Common pattern: front | back

```json
"depths": [
  { "id": "front", "targetDepth": 5, "minDepth": 4, "maxDepth": 6 },
  { "id": "back", "targetDepth": 7 }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier referenced by rooms. |
| `targetDepth` | number | Preferred depth in units. |
| `minDepth` | number | Minimum allowed depth. |
| `maxDepth` | number | Maximum allowed depth. |

**Tip:** If you don't specify bands/depths, the solver creates a single cell covering the entire footprint.

---

## Rooms

Each room describes what you want, not where it goes. The solver figures out placement.

### RoomSpec Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (use underscores, not hyphens). |
| `type` | RoomType | Yes | Room type (affects defaults and rules). |
| `label` | string | No | Display name in generated plans. |
| `minArea` | number | Yes | Minimum area in square units. |
| `targetArea` | number | No | Preferred area (defaults to minArea × 1.1). |
| `maxArea` | number | No | Maximum area (soft constraint, penalized if exceeded). |
| `minWidth` | number | No | Minimum width. |
| `minHeight` | number | No | Minimum height/depth. |
| `maxWidth` | number | No | Maximum width. |
| `maxHeight` | number | No | Maximum height/depth. |
| `aspect` | {min, max} | No | Allowed width/height ratio range. |
| `fillCell` | boolean | No | If true, expand to fill available cell space. |
| `preferredBands` | string[] | No | Which bands this room prefers. |
| `preferredDepths` | string[] | No | Which depths this room prefers. |
| `mustTouchExterior` | boolean | No | Room must touch an exterior wall. |
| `mustTouchEdge` | EdgeDirection | No | Room must touch this specific edge. |
| `adjacentTo` | string[] | No | Room IDs this room should be next to. |
| `avoidAdjacentTo` | string[] | No | Room IDs this room should NOT be next to. |
| `isCirculation` | boolean | No | Mark as circulation space (for reachability). |
| `hasExteriorDoor` | boolean | No | This room has the main entrance. |
| `isEnsuite` | boolean | No | For baths: private to one bedroom. |

### Room Types

| Type | Category | Description |
|------|----------|-------------|
| `bedroom` | private | Sleeping room |
| `bath` | private | Shared bathroom |
| `ensuite` | private | Private bathroom (attached to bedroom) |
| `closet` | private | Storage closet |
| `living` | public | Living room |
| `dining` | public | Dining room |
| `kitchen` | public | Kitchen |
| `office` | public | Home office |
| `hall` | circulation | Hallway |
| `corridor` | circulation | Narrow passage |
| `foyer` | circulation | Entry foyer |
| `stairwell` | circulation | Stairs |
| `garage` | service | Car garage |
| `laundry` | service | Laundry room |
| `utility` | service | Utility/mechanical room |
| `storage` | service | Storage room |
| `other` | - | Unclassified |

### Room Categories

- **circulation**: Spaces you walk through (halls, corridors, foyers). Essential for reachability.
- **private**: Bedrooms, bathrooms, closets. Usually accessed from circulation.
- **public**: Living spaces. Can often connect to each other.
- **service**: Garages, laundry. Usually at edges or accessed from kitchen.

### Example Rooms

**Entry Hall** (with front door):
```json
{
  "id": "hall",
  "type": "hall",
  "label": "Entry Hall",
  "minArea": 12,
  "targetArea": 16,
  "minWidth": 1.8,
  "preferredBands": ["circulation"],
  "mustTouchEdge": "south",
  "hasExteriorDoor": true,
  "isCirculation": true
}
```

**Master Bedroom** (with ensuite):
```json
{
  "id": "master",
  "type": "bedroom",
  "label": "Master Bedroom",
  "minArea": 14,
  "targetArea": 18,
  "preferredBands": ["private"],
  "mustTouchExterior": true,
  "mustTouchEdge": "north",
  "adjacentTo": ["hall"]
}
```

**Ensuite Bathroom** (private to master):
```json
{
  "id": "ensuite",
  "type": "ensuite",
  "label": "Master Ensuite",
  "minArea": 4,
  "targetArea": 6,
  "adjacentTo": ["master"],
  "isEnsuite": true
}
```

**Shared Bathroom** (accessed from hall):
```json
{
  "id": "bath",
  "type": "bath",
  "label": "Bathroom",
  "minArea": 5,
  "targetArea": 7,
  "adjacentTo": ["hall"],
  "isEnsuite": false
}
```

**Kitchen** (open to living):
```json
{
  "id": "kitchen",
  "type": "kitchen",
  "label": "Kitchen",
  "minArea": 12,
  "targetArea": 15,
  "preferredBands": ["public"],
  "adjacentTo": ["living", "hall"],
  "mustTouchExterior": true
}
```

---

## Access Rules

Access rules control which rooms can have doors connecting them. This enforces architectural conventions like "you shouldn't walk through a bedroom to reach another room."

### Access Rule Presets

Use `accessRulePreset` for common patterns:

| Preset | Description |
|--------|-------------|
| `open_plan` | Minimal restrictions. Bedrooms accessible from circulation or other bedrooms. |
| `traditional` | Standard home. Bedrooms from circulation only. Public rooms can interconnect. |
| `privacy_focused` | Strict separation. All rooms accessed only through circulation. |

```json
"accessRulePreset": "traditional"
```

### Custom Access Rules

Override or extend presets with `accessRules`:

```json
"accessRules": [
  {
    "roomType": "bedroom",
    "accessibleFrom": ["circulation"],
    "canLeadTo": ["ensuite", "closet"]
  },
  {
    "roomType": "bath",
    "accessibleFrom": ["circulation"]
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `roomType` | RoomType \| RoomCategory | Which room type this rule applies to. |
| `accessibleFrom` | (RoomType \| RoomCategory)[] | Which rooms can have doors TO this room. |
| `canLeadTo` | (RoomType \| RoomCategory)[] | Which rooms this room can have doors TO. |

**Built-in Rules (always enforced):**
- Bathrooms get only one door (no pass-through)
- Ensuites only accessible from their owner bedroom
- Shared bathrooms prefer circulation (corridor > hall > foyer > kitchen)

---

## Hard Constraints

Non-negotiable requirements. If these can't be satisfied, the solver fails.

```json
"hard": {
  "noOverlap": true,
  "insideFootprint": true,
  "allRoomsReachable": true
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `noOverlap` | boolean | - | Rooms cannot overlap. |
| `insideFootprint` | boolean | - | All rooms must be inside the footprint. |
| `allRoomsReachable` | boolean | true | Every room must be reachable from the entry. |

**Reachability:** The solver traces paths through doors from the entry room (the room with `hasExteriorDoor: true`). If any room can't be reached, the solve fails.

---

## Soft Constraints (Weights)

Soft constraints are preferences, not requirements. The solver tries to maximize them but will trade off between them.

```json
"weights": {
  "adjacencySatisfaction": 5,
  "respectPreferredZones": 3,
  "maximizeExteriorGlazing": 2,
  "minimizeHallArea": 1,
  "bathroomClustering": 1,
  "compactness": 1
}
```

| Weight | Default | Description |
|--------|---------|-------------|
| `adjacencySatisfaction` | 3 | Reward rooms being adjacent to their `adjacentTo` targets. |
| `respectPreferredZones` | 2 | Reward rooms being in their preferred bands/depths. |
| `maximizeExteriorGlazing` | 1 | Reward living spaces having exterior walls (for windows). |
| `minimizeHallArea` | 1 | Penalize oversized circulation spaces. |
| `bathroomClustering` | 1 | Reward bathrooms being near each other (plumbing efficiency). |
| `compactness` | 1 | Reward compact room shapes (avoid long narrow rooms). |
| `minimizeExteriorWallBreaks` | 1 | Reward continuous exterior walls. |

Higher weight = more important. Set to 0 to disable.

---

## Defaults

Default sizes for openings:

```json
"defaults": {
  "doorWidth": 0.9,
  "windowWidth": 1.5,
  "exteriorDoorWidth": 1.1,
  "corridorWidth": 1.2
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `doorWidth` | - | Interior door width (typically 0.8-0.9m). |
| `windowWidth` | - | Standard window width. |
| `exteriorDoorWidth` | doorWidth | Front door width (typically wider). |
| `corridorWidth` | 1.2 | Minimum corridor width if auto-generated. |

---

## Complete Example

A family house with traditional layout:

```json
{
  "units": "m",
  "footprint": { "kind": "rect", "min": [0, 0], "max": [16, 12] },
  "frontEdge": "south",
  "gardenEdge": "north",
  
  "defaults": {
    "doorWidth": 0.9,
    "windowWidth": 1.5,
    "exteriorDoorWidth": 1.1
  },
  
  "bands": [
    { "id": "private", "targetWidth": 5 },
    { "id": "circulation", "targetWidth": 2.5 },
    { "id": "public", "targetWidth": 8.5 }
  ],
  
  "depths": [
    { "id": "front", "targetDepth": 6 },
    { "id": "back", "targetDepth": 6 }
  ],
  
  "rooms": [
    {
      "id": "hall",
      "type": "hall",
      "label": "Hallway",
      "minArea": 20,
      "targetArea": 24,
      "minWidth": 2,
      "preferredBands": ["circulation"],
      "mustTouchEdge": "south",
      "hasExteriorDoor": true,
      "isCirculation": true
    },
    {
      "id": "living",
      "type": "living",
      "label": "Living Room",
      "minArea": 20,
      "targetArea": 25,
      "preferredBands": ["public"],
      "preferredDepths": ["back"],
      "mustTouchExterior": true,
      "mustTouchEdge": "north",
      "adjacentTo": ["hall", "kitchen"]
    },
    {
      "id": "kitchen",
      "type": "kitchen",
      "label": "Kitchen",
      "minArea": 12,
      "targetArea": 15,
      "preferredBands": ["public"],
      "preferredDepths": ["front"],
      "mustTouchExterior": true,
      "adjacentTo": ["hall", "living"]
    },
    {
      "id": "master",
      "type": "bedroom",
      "label": "Master Bedroom",
      "minArea": 14,
      "targetArea": 16,
      "preferredBands": ["private"],
      "preferredDepths": ["back"],
      "mustTouchExterior": true,
      "mustTouchEdge": "north",
      "adjacentTo": ["hall"]
    },
    {
      "id": "ensuite",
      "type": "ensuite",
      "label": "Master Ensuite",
      "minArea": 4,
      "targetArea": 5,
      "preferredBands": ["private"],
      "adjacentTo": ["master"],
      "isEnsuite": true
    },
    {
      "id": "bedroom2",
      "type": "bedroom",
      "label": "Bedroom 2",
      "minArea": 10,
      "targetArea": 12,
      "preferredBands": ["private"],
      "preferredDepths": ["front"],
      "mustTouchExterior": true,
      "adjacentTo": ["hall"]
    },
    {
      "id": "bath",
      "type": "bath",
      "label": "Bathroom",
      "minArea": 5,
      "targetArea": 6,
      "preferredBands": ["private"],
      "adjacentTo": ["hall"],
      "isEnsuite": false
    }
  ],
  
  "hard": {
    "noOverlap": true,
    "insideFootprint": true,
    "allRoomsReachable": true
  },
  
  "accessRulePreset": "traditional",
  
  "weights": {
    "adjacencySatisfaction": 5,
    "respectPreferredZones": 3,
    "maximizeExteriorGlazing": 2,
    "bathroomClustering": 1
  }
}
```

---

## Architectural Patterns

### Linear Corridor House

Corridor runs through the middle, rooms on both sides:

```json
"bands": [
  { "id": "west_rooms", "targetWidth": 5 },
  { "id": "corridor", "targetWidth": 1.5, "maxWidth": 2 },
  { "id": "east_rooms", "targetWidth": 5 }
]
```

### L-Shaped House

Use polygon footprint. Place public rooms in main body, private in extension:

```json
"footprint": {
  "kind": "polygon",
  "points": [[0,0], [10,0], [10,5], [16,5], [16,12], [0,12]]
},
"bands": [
  { "id": "main", "targetWidth": 10 },
  { "id": "extension", "targetWidth": 6 }
]
```

### U-Shaped House with Courtyard

Wings on sides, entry in center. Requires corridors in wings for access:

```json
"footprint": {
  "kind": "polygon",
  "points": [[0,0], [18,0], [18,14], [12,14], [12,5], [6,5], [6,14], [0,14]]
},
"bands": [
  { "id": "west", "targetWidth": 6 },
  { "id": "center", "targetWidth": 6 },
  { "id": "east", "targetWidth": 6 }
]
```

**Important:** In wing layouts, add corridor rooms to provide circulation access to back rooms:

```json
{
  "id": "west_corridor",
  "type": "corridor",
  "minArea": 8,
  "minWidth": 1.2,
  "maxWidth": 2,
  "preferredBands": ["west"],
  "adjacentTo": ["kitchen"],
  "isCirculation": true
}
```

### Ensuite vs Shared Bathroom

**Ensuite** (private to one bedroom):
```json
{
  "id": "ensuite",
  "type": "ensuite",
  "minArea": 4,
  "adjacentTo": ["master"],
  "isEnsuite": true
}
```

**Shared** (accessed from circulation):
```json
{
  "id": "bath",
  "type": "bath", 
  "minArea": 5,
  "adjacentTo": ["hall"],
  "isEnsuite": false
}
```

### Open Plan Living

Kitchen, dining, living as one connected space:

```json
{
  "id": "kitchen",
  "type": "kitchen",
  "adjacentTo": ["living", "dining"],
  "isCirculation": true
},
{
  "id": "living",
  "type": "living",
  "adjacentTo": ["kitchen", "dining"],
  "isCirculation": true
}
```

Mark public rooms as `isCirculation: true` to allow pass-through access.

---

## Troubleshooting

### "Plan has unreachable rooms"

**Cause:** Some rooms can't be reached from the entry via doors.

**Solutions:**
1. Add `adjacentTo` pointing to a circulation room
2. Add a corridor room to connect isolated areas
3. Check that shared bathrooms are adjacent to circulation, not just bedrooms

### "No valid placement found"

**Cause:** Room constraints are too tight for the available space.

**Solutions:**
1. Reduce `minArea` requirements
2. Relax `minWidth`/`minHeight` constraints
3. Make bands/depths more flexible (wider min/max range)
4. Remove some `mustTouchEdge` constraints

### Rooms in wrong locations

**Solutions:**
1. Add explicit `preferredBands` and `preferredDepths`
2. Increase `respectPreferredZones` weight
3. Add `mustTouchEdge` for anchor rooms

### Bathroom has wrong door

**The solver picks the best door based on priority:**
1. Corridors/halls (best for shared baths)
2. Foyers
3. Other circulation
4. Kitchens
5. Living rooms
6. Bedrooms (only for ensuites)

If a shared bath is getting a door to the kitchen instead of a corridor, make sure the bath is actually adjacent to the corridor (check your geometry).

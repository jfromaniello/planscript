## Advanced Greedy Floor-Plan Solver Spec (TypeScript)

**Goal:** Convert a *zoning + constraints* intent model into a valid **PlanScript** floor plan (rect/polygon rooms + openings + windows) using an **advanced greedy** placement engine (with limited backtracking), *not* an LLM.

---

# 1. Scope and Non-Goals

## In scope

* Single-level 2D plans
* Rectangular rooms (primary), optional corridor polygons
* Footprint boundary (rect/polygon)
* Doors/windows placement (basic rules)
* Constraint checking and scoring
* Greedy placement + small local repairs + bounded backtracking

## Out of scope (v1)

* Curved walls, multi-floor, structure/MEP
* Architectural “style” heuristics beyond simple scoring
* Full global optimization (SAT/ILP) (optional future)

---

# 2. High-level Architecture

Pipeline:

1. **Parse input** (Intent JSON)
2. **Normalize** (units, defaults, derived constraints)
3. **Discretize** into a *layout frame* (bands + depth zones, or slicing tree)
4. **Greedy place** rooms (largest / most constrained first)
5. **Route circulation** (corridor skeleton)
6. **Place openings** (doors/windows)
7. **Validate** hard constraints
8. **Score** soft constraints
9. **Repair** (local adjustments, swaps, shrink/expand)
10. **Emit PlanScript**

Key idea: separate **hard constraints** (must pass) vs **soft constraints** (optimize).

---

# 3. Input Model (Intent JSON)

### 3.1 Types

```ts
type Units = "m" | "cm";

type Footprint =
  | { kind: "rect"; min: [number, number]; max: [number, number] }
  | { kind: "polygon"; points: Array<[number, number]> };

type ZoneId = string; // e.g., "front", "middle", "back", "left", "right"

type BandSpec = {
  id: ZoneId;                 // "left", "center", "right"
  minWidth?: number;          // optional; solver can derive
  targetWidth?: number;       // optional
  maxWidth?: number;          // optional
};

type DepthSpec = {
  id: ZoneId;                 // "front", "middle", "back"
  minDepth?: number;
  targetDepth?: number;
  maxDepth?: number;
};

type RoomId = string;

type RoomSpec = {
  id: RoomId;
  label?: string;

  // Geometry targets (solver tries to match)
  minArea: number;
  targetArea?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspect?: { min: number; max: number }; // w/h

  // Placement intent
  preferredBands?: ZoneId[];  // e.g., ["left"]
  preferredDepths?: ZoneId[]; // e.g., ["back"]
  mustTouchExterior?: boolean; // bedrooms, living
  mustTouchGardenEdge?: boolean; // great_room to north edge

  // Adjacency
  adjacentTo?: RoomId[];
  avoidAdjacentTo?: RoomId[];

  // Connectivity
  needsAccessFrom?: RoomId[]; // e.g., ["hall", "foyer"]
  isCirculation?: boolean;    // hall/corridor

  // Category helps defaults (windows, doors, scoring)
  type: "bedroom" | "bath" | "kitchen" | "dining" | "living" | "office" | "garage" | "laundry" | "hall" | "other";
};

type OpeningDefaults = {
  doorWidth: number;     // e.g., 0.9
  windowWidth: number;   // e.g., 1.8
  exteriorDoorWidth?: number; // e.g., 1.1
};

type LayoutIntent = {
  units: Units;
  footprint: Footprint;

  // Optional decomposition hints (strongly recommended)
  bands?: BandSpec[];    // e.g., left/center/right
  depths?: DepthSpec[];  // e.g., front/middle/back

  // Global anchors
  frontEdge: "south" | "north" | "east" | "west";   // defines entry side
  gardenEdge?: "north" | "south" | "east" | "west"; // typically opposite front

  defaults: OpeningDefaults;

  rooms: RoomSpec[];

  // Hard constraints
  hard: {
    noOverlap: true;
    insideFootprint: true;
    allRoomsConnected?: boolean; // via doors through circulation graph
  };

  // Soft constraints weights (tunable)
  weights?: Partial<Record<
    | "respectPreferredZones"
    | "adjacencySatisfaction"
    | "minimizeHallArea"
    | "maximizeGardenGlazing"
    | "bathroomClustering"
    | "compactness"
    | "minimizeExteriorWallBreaks",
    number
  >>;
};
```

### 3.2 Minimal example input (human/LLM generates this)

```json
{
  "units": "m",
  "footprint": { "kind": "rect", "min": [0,0], "max": [20,18] },
  "frontEdge": "south",
  "gardenEdge": "north",
  "defaults": { "doorWidth": 0.9, "windowWidth": 1.8, "exteriorDoorWidth": 1.1 },
  "bands": [
    { "id": "left", "targetWidth": 7.5 },
    { "id": "right", "targetWidth": 12.5 }
  ],
  "depths": [
    { "id": "front", "targetDepth": 6 },
    { "id": "middle", "targetDepth": 5 },
    { "id": "back", "targetDepth": 7 }
  ],
  "rooms": [
    { "id": "garage", "type": "garage", "minArea": 35, "preferredBands": ["left"], "preferredDepths": ["front"], "mustTouchExterior": true },
    { "id": "foyer", "type": "hall", "minArea": 10, "preferredDepths": ["front"], "needsAccessFrom": [] },
    { "id": "office", "type": "office", "minArea": 12, "preferredBands": ["right"], "preferredDepths": ["front"], "mustTouchExterior": true },
    { "id": "great_room", "type": "living", "minArea": 45, "preferredBands": ["right"], "preferredDepths": ["back"], "mustTouchGardenEdge": true, "mustTouchExterior": true },
    { "id": "hall", "type": "hall", "minArea": 12, "preferredDepths": ["middle"], "isCirculation": true },
    { "id": "master", "type": "bedroom", "minArea": 16, "preferredBands": ["left"], "preferredDepths": ["back"], "mustTouchExterior": true, "adjacentTo": ["ensuite"] },
    { "id": "ensuite", "type": "bath", "minArea": 5, "preferredBands": ["left"], "preferredDepths": ["back"], "adjacentTo": ["master"] },
    { "id": "bed2", "type": "bedroom", "minArea": 12, "preferredBands": ["left"], "preferredDepths": ["middle"], "mustTouchExterior": true },
    { "id": "bed3", "type": "bedroom", "minArea": 12, "preferredBands": ["left"], "preferredDepths": ["middle"], "mustTouchExterior": true },
    { "id": "bath", "type": "bath", "minArea": 5, "preferredBands": ["left"], "preferredDepths": ["middle"], "adjacentTo": ["bed2", "bed3"] }
  ],
  "hard": { "noOverlap": true, "insideFootprint": true, "allRoomsConnected": true },
  "weights": { "minimizeHallArea": 2, "adjacencySatisfaction": 3, "respectPreferredZones": 2 }
}
```

---

# 4. Internal Representations

## 4.1 Geometry primitives

```ts
type Point = { x: number; y: number };
type Rect = { x1: number; y1: number; x2: number; y2: number }; // axis-aligned
type Edge = { a: Point; b: Point; orientation: "h" | "v" };

type PlacedRoom = {
  id: RoomId;
  rect: Rect;
  label?: string;
  type: RoomSpec["type"];
  band?: ZoneId;
  depth?: ZoneId;
};

type PlanState = {
  footprint: Footprint;
  placed: Map<RoomId, PlacedRoom>;
  unplaced: RoomId[];
  openings: any[]; // door/window IR
};
```

## 4.2 Constraint evaluation

Hard checks:

* Inside footprint
* No overlap (rect intersection > epsilon)
* Required adjacencies possible (shared edges or via corridor)
* Exterior touch for rooms requiring it

Soft scoring:

* Zone match score
* Adjacency satisfaction score
* Compactness (wasted void area)
* Hall area ratio

---

# 5. Layout Frame: Bands + Depth Zones (Slicing Tree)

The solver uses a **slicing structure** to avoid “random packing”:

1. Compute total footprint width/height from `footprint rect` or bounding box (if polygon).
2. Determine **bands** (vertical slices) and **depth zones** (horizontal slices).
3. Form a grid of *cells* = band × depth.
4. Assign rooms to cells (primary cell), then place within cell.

This yields global structure and prevents tetris-like scattering.

### 5.1 Deriving band/depth sizes

If `bands` not provided:

* derive `left`, `center`, `right` using room area totals by preferred band
* default to 2 bands if garage exists: left=garage wing, right=public wing

Same for depths:

* if `frontEdge` is south, depths are stacked south→north.

---

# 6. Greedy Placement Algorithm (Advanced)

## 6.1 Ordering strategy (critical)

Place rooms in priority order:

1. **Anchored rooms**: `mustTouchGardenEdge`, `mustTouchExterior` + preferred zone fixed
2. **Largest area rooms** (great_room, garage)
3. **Rooms with many constraints** (high degree adjacency)
4. **Private rooms** (bedrooms)
5. **Service rooms** (baths, laundry)
6. **Circulation last** *or* inserted as scaffolding early (two modes)

Recommended: **Scaffold mode**:

* Place `great_room`, `garage`, `foyer`, `office`, `master` first
* Place a provisional `hall spine`
* Fill remaining rooms around the spine

## 6.2 Candidate generation per room

For each room, generate a bounded set of candidate rectangles:

* Determine target cell(s) from preferred bands/depths
* Generate candidates along:

  * cell corners
  * along exterior edges if required
  * adjacent to already placed “anchor” rooms (e.g., ensuite next to master)

Candidate sizes:

* pick (w,h) pairs that satisfy minArea and aspect bounds
* start from targetArea; expand/shrink by small deltas (e.g., ±10%)

Candidate placement positions:

* snap to grid
* ensure within footprint cell

## 6.3 Choose best candidate

Evaluate each candidate:

* reject if hard constraints fail (overlap, out of footprint, etc.)
* score with soft function

Pick max score.

### Soft scoring components (example)

* +W_zone if in preferred band/depth
* +W_adj if shares edge with required adjacent rooms
* +W_ext if touches exterior when required (or bonus if touches garden edge)
* −W_void for fragmentation / leftover slivers
* −W_aspect if too skinny
* −W_hall if increases required corridor length

## 6.4 Local repair moves

When a room fails placement:

* **shrink-to-fit** (reduce toward minArea)
* **swap** with a same-zone room
* **shift** neighbors slightly within cell
* **rotate** (swap w/h)
* **promote** to alternate cell (second preference)

## 6.5 Bounded backtracking

Maintain a stack of decisions for last N rooms (e.g., N=6).
If placement fails:

* pop last decision
* try next-best candidate
* continue

This is not full search; it’s “limited undo”.

---

# 7. Circulation (Hall) Generation

Treat circulation as a **routing problem** but simplified:

## 7.1 Connectivity graph

Create a required connectivity graph:

* foyer must connect to great_room
* hall must connect to bedroom doors and bathrooms
* garage access optional

## 7.2 Hall “spine”

Generate a spine corridor:

* choose a vertical or L-shaped path through middle cell(s)
* corridor width fixed (e.g., 1.4–2.0m)
* corridor is a polygon if L-shaped

### Corridor generation heuristic

* Find a path from foyer to private wing centroid and to great_room centroid
* Use Manhattan routing with 1 bend max
* Expand path into corridor polygon

## 7.3 Attach doors

For each room needing access:

* find closest wall segment shared with corridor boundary
* place door centered on that segment, avoiding corners

---

# 8. Openings (Doors/Windows)

## 8.1 Doors

Rules:

* Exterior entry door on `foyer.edge frontEdge`
* Interior doors on shared edge between room and hall/spine or directly adjacent rooms

Placement:

* `at 50%` of shared edge unless conflicts
* If door collides with corner, nudge by ±0.3m

## 8.2 Windows

Rules:

* Bedrooms must have ≥ 1 exterior window
* Great room must have large glazing on garden edge
* Baths optional small window if exterior

Placement:

* choose longest exterior edge of room
* place window centered
* if multiple windows, distribute evenly

---

# 9. Validation

## 9.1 Hard constraints

* All rooms inside footprint
* No overlap
* Rooms with `mustTouchExterior` have at least one exterior wall segment
* Door openings are on shared edges / exterior edges
* Optional: All rooms reachable from foyer via doors (graph connectivity)

## 9.2 Sanity constraints (recommended)

* Hall area ratio ≤ threshold (e.g., 10–14%)
* No room with width < minWidth or height < minHeight
* Avoid ultra-thin leftover gaps (< 0.3m) in major cells (score penalty)

---

# 10. Output: PlanScript Emitter

The emitter translates `PlanState` into PlanScript:

1. `units`, `origin`, `defaults`
2. `plan "<name>" { ... }`
3. `footprint rect ...` (or polygon)
4. `room <id> { rect (...) (...) label "..." }` for rect rooms
5. `room hall { polygon (x,y) ... }` if corridor polygon
6. `opening door ...` and `opening window ...`
7. `assert ...`

Important: match your PlanScript polygon syntax:

* points space-separated on a single line:
  `polygon (x,y) (x,y) (x,y)`

---

# 11. Recommended Implementation (TypeScript)

## 11.1 Why TypeScript

* Excellent for AST + geometry data
* Fast iteration
* Strong typing for constraint engine
* Great test tooling

## 11.2 Libraries

* **Geometry**

  * `polygon-clipping` (boolean ops) — useful if you later support polygon footprint
  * `martinez-polygon-clipping` (alternative)
  * For rect-only v1, implement intersection yourself (fast and robust)

* **Graph**

  * `graphlib` (optional) for connectivity graph; or write a small BFS

* **DXF/SVG export** (if needed later)

  * DXF: `dxf-writer`
  * SVG: custom string emitter is easiest

# 12. Determinism Guarantees

To keep output deterministic:

* stable iteration order (sort room IDs)
* stable candidate ordering
* seeded randomness only if explicitly enabled (default off)
* grid snapping with exact rounding rule

---

# 13. CLI Interface (Recommended)

Example:

```bash
plansolve intent.json --out plan.ps --format planscript
```

Options:

* `--seed` (optional)
* `--variants N` generate N candidates and pick best by scoring
* `--debug` emit intermediate JSON + score breakdown

---

# 14. “Advanced Greedy” Enhancements (Recommended)

These are still greedy, but improve quality a lot:

1. **Generate K variants** by permuting:

   * band widths
   * depth splits
   * anchor placements (e.g., master left vs right)
2. Solve each variant greedily
3. Keep the best-scoring valid plan

This makes results dramatically less “box-packed” without heavy optimization.

---

# 15. Deliverables

* `Intent` schema + JSON examples
* Greedy solver producing placed rects + corridor polygon
* Constraint engine with clear failure reasons
* PlanScript emitter
* Test suite with:

  * known cases (3BR house)
  * randomized fuzz (no overlaps, inside footprint)


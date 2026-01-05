# Deterministic Floor Plan DSL (DFP-DSL)

## 1. Project Overview

This project defines and implements a **deterministic, textual Domain-Specific Language (DSL)** for describing **2D architectural floor plans**.

The DSL is intentionally **limited in scope**:

* It describes **only spatial layout** (rooms, walls, doors, windows).
* It does **not** describe plumbing, electrical, HVAC, structure, furniture, or levels.
* It produces a **complete, unambiguous floor plan** that can be compiled into geometry.

The DSL is designed to be:

* **Deterministic** (no heuristics, no aesthetic decisions)
* **Compiler-based** (parse → validate → generate)
* **LLM-friendly** (easy for language models to generate valid programs)
* **Exportable** to standard 2D formats (SVG, DXF, PDF)

---

## 2. Design Goals

### Explicit Non-Goals

* No generative design
* No optimization or “best layout” inference
* No architectural styling decisions
* No building systems (MEP, structure, etc.)

### Core Goals

1. **Any floor plan can be expressed**
2. **Every program compiles to exact geometry**
3. **Invalid plans fail with clear errors**
4. **High-level syntax lowers to low-level geometry**
5. **The same input always produces the same output**

---

## 3. Conceptual Model

### Authoring Level (High-Level DSL)

Humans and LLMs write:

* rooms
* polygons or rectangles
* relative attachments
* openings (doors/windows)
* constraints (`assert`)

### Geometry Level (Intermediate Representation)

The compiler produces:

* explicit wall segments
* absolute coordinates
* opening placement on walls

### Output Level

The geometry IR is exported to:

* SVG (visual preview)
* DXF (CAD)
* JSON (further tooling)
* PDF (optional)

---

## 4. Coordinate System and Units

```dsl
units meters
origin (0,0)
axis x:right y:up
grid 0.10
```

* Cartesian 2D plane
* All geometry is absolute after compilation
* Grid is used for snapping and validation only

---

## 5. Footprint Definition

The footprint defines the outer boundary of the plan.

```dsl
footprint polygon (0,0) (20,0) (20,30) (0,30)
```

or shorthand:

```dsl
footprint rect (0,0) (20,30)
```

Rules:

* Must be closed
* Must not self-intersect
* All rooms must be inside the footprint

---

## 6. Rooms

### 6.1 Polygon-Based Rooms (Universal Form)

```dsl
room living {
  polygon (1,1) (9,1) (9,7) (1,7)
  label "Living Room"
}
```

Rules:

* Polygon must be closed
* No self-intersection
* Clockwise or counter-clockwise allowed (normalized internally)

---

### 6.2 Rectangular Room Sugar Syntax

Rectangles are syntactic sugar that compile into polygons.

#### Diagonal Points

```dsl
room kitchen {
  rect (9,1) (13,7)
}
```

#### Origin + Size

```dsl
room bedroom {
  rect at (1,7) size (3.6,4.0)
}
```

#### Center + Size

```dsl
room bath {
  rect center (6,9) size (2.6,2.2)
}
```

Compilation rule:

```
rect → polygon (x1,y1) (x2,y1) (x2,y2) (x1,y2)
```

Errors:

* zero width or height
* inverted axes are normalized automatically

---

## 7. Relative Placement (Deterministic)

Relative placement is allowed **only when fully constrained**.

```dsl
room kitchen {
  rect size (4,6)
  attach east_of living
  align top
  gap 0
}
```

Allowed relations:

* `north_of | south_of | east_of | west_of`
* `align top | bottom | left | right | center`
* `gap <number>`

No vague relations (`near`, `close_to`, etc.) are allowed.

---

## 8. Openings (Doors and Windows)

### 8.1 Doors Between Rooms

```dsl
opening door d1 {
  between living and hall
  on shared_edge
  at 0.6          # percentage or absolute distance
  width 0.90
  swing hall
}
```

Rules:

* Door must lie fully on a shared wall
* Swing direction must reference a room
* Door cannot overlap wall corners

---

### 8.2 Windows on External or Internal Walls

```dsl
opening window w1 {
  on living.edge south
  at 2.0m
  width 2.4m
  sill 0.9m
}
```

Rules:

* Must be placed on a valid wall segment
* Cannot exceed wall length

---

## 9. Walls (Implicit by Default)

Walls are **implicitly generated** from room boundaries.

Rules:

* Shared room edges generate a single shared wall
* External edges generate exterior walls
* Default wall thickness applies unless overridden

Optional explicit override (advanced):

```dsl
wall_thickness living.south 0.25
```

---

## 10. Assertions (Compile-Time Validation)

Assertions make the DSL **programmable, not descriptive**.

```dsl
assert inside footprint all_rooms
assert no_overlap rooms
assert openings_on_walls
assert min_room_area bedroom >= 12.0
```

Typical compiler errors:

* `E101 polygon not closed`
* `E201 overlapping rooms`
* `E310 opening not on wall`
* `E420 room has no access`
* `E130 outside footprint`

Compilation **fails** if any assertion fails.

---

## 11. Compilation Pipeline

```
DSL Source
   ↓
Parser (PEG / ANTLR)
   ↓
AST
   ↓
Lowering (rect/attach → polygon)
   ↓
Geometry IR (walls, openings)
   ↓
Validation / Assertions
   ↓
Exporters (SVG / DXF / JSON)
```

No stage is optional.

---

## 12. LLM-Friendly Design Principles

* Small vocabulary
* Repetitive syntax
* Deterministic lowering
* Clear error messages
* No aesthetic heuristics
* Explicit geometry always wins

This allows:

* LLM → DSL
* Compiler → errors
* LLM → fix DSL
* Repeat until valid

---

## 13. Example Complete Program

```dsl
units m
origin (0,0)

plan "Example House" {
  footprint rect (0,0) (20,30)

  room living  { rect (1,1) (9,7) }
  room kitchen { rect size (4,6) attach east_of living align top }
  room hall    { rect span x from living.left to kitchen.right y (7,9) }

  room bedroom {
    rect at (1,9) size (3.6,4.0)
  }

  room bath {
    rect size (2.6,2.2)
    attach east_of bedroom align top
  }

  opening door d1 {
    between living and hall
    on shared_edge
    at 0.6
    width 0.9
  }

  assert no_overlap rooms
  assert inside footprint all_rooms
}
```

---

## 14. Recommended Tooling

### Language & Compiler

* **TypeScript** (fast iteration, great tooling)
* **PEG.js / Nearley / ANTLR**
* Immutable AST structures

### Geometry

* Custom lightweight geometry engine
* Robust polygon intersection library

### Export

* SVG: native
* DXF: `dxf-writer` or custom emitter
* JSON: internal IR

### Validation

* Custom rule engine
* Strong error typing (`E###`)

---

## 15. Future Extensions (Out of Scope v1)

* Curved walls (`arc`)
* Multi-level plans
* Furniture (non-structural)
* Code-generated dimension styles
* IFC export

---

## 16. Summary

This project defines:

* a **true DSL**, not a prompt format
* a **compiler**, not a generator
* a **deterministic pipeline**
* a **clean interface for LLMs**

It intentionally trades creativity for **precision, repeatability, and correctness**.

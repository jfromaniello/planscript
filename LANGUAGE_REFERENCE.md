# PlanScript Language Reference

This document provides a complete specification of the PlanScript language for defining floor plans. It is intended as both a reference for developers and as context for LLMs (ChatGPT, Claude, etc.) to generate valid PlanScript code.

> **For LLM users:** Provide this document as context when asking an LLM to generate PlanScript floor plans.

## Table of Contents

- [File Structure](#file-structure)
- [Units](#units)
- [Origin](#origin)
- [Defaults](#defaults)
- [Site](#site)
- [Plan Block](#plan-block)
- [Footprint](#footprint)
- [Zones](#zones)
- [Courtyards](#courtyards)
- [Rooms](#rooms)
  - [Rectangle with Two Corners](#rectangle-with-two-corners)
  - [Rectangle with Position and Size](#rectangle-with-position-and-size)
  - [Rectangle with Size and Attachment](#rectangle-with-size-and-attachment)
  - [Rectangle with Span](#rectangle-with-span)
  - [Polygon Rooms](#polygon-rooms)
  - [Room Labels](#room-labels)
- [Room References](#room-references)
- [Openings](#openings)
  - [Doors](#doors)
  - [Windows](#windows)
  - [Position Syntax](#position-syntax)
- [Assertions](#assertions)
- [Comments](#comments)
- [Complete Examples](#complete-examples)

---

## File Structure

A PlanScript file (`.psc`) has the following structure. All top-level declarations are optional except for `plan`.

```planscript
units <unit>              # Optional: set measurement units
origin (<x>, <y>)         # Optional: set coordinate origin
defaults { ... }          # Optional: default values for openings
site { ... }              # Optional: site orientation (for solar/street context)

plan "<name>" {           # Required: the floor plan definition
  footprint ...           # Required: building boundary
  zone ... { ... }        # Zero or more zones (grouped rooms)
  room ... { ... }        # Zero or more standalone rooms
  courtyard ... { ... }   # Zero or more courtyards (open spaces)
  opening ... { ... }     # Zero or more openings (doors/windows)
  assert ...              # Zero or more validation assertions
}
```

---

## Units

Sets the measurement unit for all coordinates and dimensions.

```planscript
units <unit>
```

**Valid units:**
| Unit | Description |
|------|-------------|
| `m` | Meters (default) |
| `cm` | Centimeters |
| `mm` | Millimeters |
| `ft` | Feet |
| `in` | Inches |

**Example:**
```planscript
units m
```

---

## Origin

Sets the coordinate origin point. Default is `(0, 0)`.

```planscript
origin (<x>, <y>)
```

**Example:**
```planscript
origin (0, 0)
```

---

## Defaults

Sets default values for door and window widths. When set, the `width` property becomes optional in opening definitions.

```planscript
defaults {
  door_width <value>
  window_width <value>
}
```

**Example:**
```planscript
defaults {
  door_width 0.9
  window_width 1.2
}
```

---

## Site

Defines the site orientation, enabling context-aware design validation. This allows you to specify which direction the street faces and validate that rooms have appropriate solar orientation or proximity to the street.

### Basic Syntax

```planscript
site {
  street <direction>      # Required: which direction the street/front faces
  hemisphere <hemisphere> # Optional: north (default) or south
}
```

**Directions:** `north`, `south`, `east`, `west`

**Hemispheres:** `north` (default), `south`

### Derived Information

When you specify `street south`, the compiler automatically derives:

| Concept | Meaning |
|---------|---------|
| `street` | South (where the entrance/front faces) |
| `back` | North (opposite of street, typically garden/yard) |
| `morning_sun` | East (sunrise direction) |
| `afternoon_sun` | West (sunset direction) |

### Example

```planscript
site {
  street south       # Front of house faces south (toward the street)
  hemisphere north   # Northern hemisphere (default)
}
```

With this configuration, you can use orientation assertions to validate your design:
- Bedrooms should have windows facing east (morning sun)
- Living room should face west (afternoon sun) or north (garden view)
- Garage should be near the street
- Service areas can be toward the street (don't waste good orientations)

---

## Plan Block

The main container for the floor plan. A file must have exactly one plan block.

```planscript
plan "<name>" {
  # footprint, rooms, openings, assertions
}
```

The name is optional:
```planscript
plan {
  # ...
}
```

---

## Footprint

Defines the building boundary. Required inside the plan block.

### Rectangle Footprint

```planscript
footprint rect (<x1>, <y1>) (<x2>, <y2>)
```

**Example:**
```planscript
footprint rect (0, 0) (20, 15)
```

### Polygon Footprint

For non-rectangular buildings (L-shaped, etc.):

```planscript
footprint polygon [
  (<x1>, <y1>),
  (<x2>, <y2>),
  (<x3>, <y3>),
  ...
]
```

**Example (L-shaped building):**
```planscript
footprint polygon [
  (0, 0),
  (20, 0),
  (20, 10),
  (12, 10),
  (12, 15),
  (0, 15)
]
```

---

## Zones

Zones are logical groupings of rooms that can be positioned as a unit. This allows you to think at a higher level - "place the social zone here, private zone there" - rather than calculating coordinates for each room individually.

### Basic Zone Syntax

```planscript
zone <id> {
  room <id> { ... }   # Rooms use local coordinates within the zone
  room <id> { ... }
}
```

Rooms inside a zone use **local coordinates** (relative to the zone's origin at 0,0). When the zone is positioned, all rooms are translated together.

### Zone with Positioning

Zones can attach to other zones or standalone rooms:

```planscript
zone <id> {
  attach <direction> <zone_or_room>
  align <alignment>
  gap <distance>
  
  room <id> { ... }
  room <id> { ... }
}
```

**Directions:**
| Direction | Description |
|-----------|-------------|
| `north_of` | Above the reference |
| `south_of` | Below the reference |
| `east_of` | To the right of the reference |
| `west_of` | To the left of the reference |

**Alignments:**
| Alignment | Description |
|-----------|-------------|
| `top` | Align top edges |
| `bottom` | Align bottom edges |
| `left` | Align left edges |
| `right` | Align right edges |
| `center` | Center alignment |

### Zone Example

```planscript
plan "House with Zones" {
  footprint rect (0, 0) (25, 20)
  
  # Entry area (standalone room)
  room entry { rect (10, 0) (15, 4) }
  
  # Social zone - living, dining, kitchen
  zone social {
    attach north_of entry
    align center
    gap 0
    
    room living { rect (0, 0) (8, 6) }
    room dining {
      rect size (4, 6)
      attach east_of living
      align top
      gap 0
    }
    room kitchen {
      rect size (4, 6)
      attach east_of dining
      align top
      gap 0
    }
  }
  
  # Private zone - bedrooms
  zone private {
    attach north_of social
    align left
    gap 0
    
    room master { rect (0, 0) (6, 5) }
    room bedroom2 {
      rect size (5, 5)
      attach east_of master
      align bottom
      gap 0
    }
  }
}
```

In this example:
1. The `entry` room is placed first at fixed coordinates
2. The `social` zone attaches north of entry, containing living/dining/kitchen
3. The `private` zone attaches north of social, containing bedrooms

### Zone Labels

Zones can have optional labels:

```planscript
zone private {
  label "Private Wing"
  room master { ... }
}
```

---

## Courtyards

Courtyards define open spaces or voids within the building footprint. They are commonly used for central patios, atriums, light wells, or garden spaces in U-shaped or courtyard-style floor plans.

### Basic Courtyard Syntax

```planscript
courtyard <id> {
  rect (<x1>, <y1>) (<x2>, <y2>)
}
```

Or with polygon geometry:

```planscript
courtyard <id> {
  polygon [
    (<x1>, <y1>),
    (<x2>, <y2>),
    ...
  ]
}
```

### Courtyard with Label

```planscript
courtyard <id> {
  rect (<x1>, <y1>) (<x2>, <y2>)
  label "<display name>"
}
```

### Courtyard Examples

**Simple Central Patio:**

```planscript
plan "U-Shaped House" {
  footprint rect (0, 0) (30, 40)
  
  # Left wing
  room wing_left { rect (0, 0) (10, 40) label "Left Wing" }
  
  # Right wing
  room wing_right { rect (20, 0) (30, 40) label "Right Wing" }
  
  # Back connection
  room back { rect (10, 30) (20, 40) label "Back" }
  
  # Central courtyard (open space)
  courtyard patio {
    rect (10, 10) (20, 30)
    label "Central Patio"
  }
}
```

**Irregular Courtyard:**

```planscript
courtyard garden {
  polygon [
    (12, 15),
    (22, 15),
    (22, 28),
    (17, 32),
    (12, 28)
  ]
  label "Garden"
}
```

### Courtyard Rendering

In SVG output, courtyards are rendered with:
- Light green fill color (to indicate open/outdoor space)
- Dashed border stroke
- Italic label text in green

This distinguishes them visually from enclosed rooms.

---

## Rooms

Rooms define the interior spaces. Each room has a unique identifier and a shape.

### Rectangle with Two Corners

```planscript
room <id> {
  rect (<x1>, <y1>) (<x2>, <y2>)
}
```

**Example:**
```planscript
room living {
  rect (1, 1) (9, 7)
}
```

### Rectangle with Position and Size

```planscript
room <id> {
  rect at (<x>, <y>) size (<width>, <height>)
}
```

**Example:**
```planscript
room bedroom {
  rect at (1, 9) size (4, 5)
}
```

### Rectangle with Size and Attachment

Positions a room relative to another room.

```planscript
room <id> {
  rect size (<width>, <height>)
  attach <direction> <room_ref>
  align <alignment>
  gap <distance>
}
```

**Directions:**
| Direction | Description |
|-----------|-------------|
| `north_of` | Above the reference room |
| `south_of` | Below the reference room |
| `east_of` | To the right of the reference room |
| `west_of` | To the left of the reference room |

**Alignments (Simple):**
| Alignment | Description |
|-----------|-------------|
| `top` | Align top edges (for east_of/west_of) |
| `bottom` | Align bottom edges (for east_of/west_of) |
| `left` | Align left edges (for north_of/south_of) |
| `right` | Align right edges (for north_of/south_of) |
| `center` | Center alignment |

**Explicit Alignment:**

For more precise control, use explicit edge alignment:

```planscript
align my <edge> with <room>.<edge>
```

This allows aligning any edge of the new room with any edge of another room.

**Example:**
```planscript
room kitchen {
  rect size (4, 6)
  attach east_of living
  align top
  gap 0
}
```

**Example with explicit alignment:**
```planscript
room bathroom {
  rect size (3, 2.5)
  attach north_of bedroom
  align my left with bedroom.left   # Align left edges precisely
}
```

### Auto Dimensions

Use `auto` for width or height to calculate dimensions automatically:

```planscript
room <id> {
  rect size (<width>, auto)   # Auto-calculate height
  attach <direction> <room_ref>
  extend from <room>.<edge> to <room>.<edge>  # Defines the auto dimension range
}
```

When `auto` is used:
- Without `extend`: Uses the target room's corresponding dimension
- With `extend`: Calculates the dimension from the specified edge range

**Example:**
```planscript
room hallway {
  rect size (1.5, auto)           # Width is 1.5, height calculated from extend
  attach east_of living
  extend from living.top to master.bottom  # Height spans from living.top to master.bottom
}
```

### Fill Between Rooms

Automatically fills the gap between two rooms:

```planscript
room <id> {
  fill between <room1> and <room2>
  width <value>    # Optional: explicit width
  height <value>   # Optional: explicit height
}
```

The fill geometry automatically:
- Detects whether rooms are separated horizontally or vertically
- Fills the gap between them
- Spans the overlapping dimension

**Example:**
```planscript
room corridor {
  fill between living and bedrooms
  width 1.2
}
```

### Rectangle with Span

Creates a room that spans between reference points from other rooms.

```planscript
room <id> {
  rect span x from <room>.<edge> to <room>.<edge> y (<y1>, <y2>)
}
```

Or spanning on Y axis:
```planscript
room <id> {
  rect span y from <room>.<edge> to <room>.<edge> x (<x1>, <x2>)
}
```

**Example:**
```planscript
room hallway {
  rect span x from living.left to kitchen.right y (7, 9)
}
```

### Polygon Rooms

For non-rectangular rooms:

```planscript
room <id> {
  polygon [
    (<x1>, <y1>),
    (<x2>, <y2>),
    (<x3>, <y3>),
    ...
  ]
}
```

### Room Labels

Optional display label for the room:

```planscript
room <id> {
  rect (1, 1) (9, 7)
  label "<display name>"
}
```

**Example:**
```planscript
room living {
  rect (1, 1) (9, 7)
  label "Living Room"
}
```

---

## Room References

Reference points and edges of rooms for positioning and spanning.

### Edge References

| Reference | Description |
|-----------|-------------|
| `<room>.left` | X coordinate of left edge |
| `<room>.right` | X coordinate of right edge |
| `<room>.top` | Y coordinate of top edge |
| `<room>.bottom` | Y coordinate of bottom edge |

**Example:**
```planscript
rect span x from living.left to kitchen.right y (7, 9)
```

### Edge Selectors

For placing openings on specific walls:

| Selector | Description |
|----------|-------------|
| `<room>.edge north` | Top wall |
| `<room>.edge south` | Bottom wall |
| `<room>.edge east` | Right wall |
| `<room>.edge west` | Left wall |

**Example:**
```planscript
opening window w1 {
  on living.edge south
  at 2.0
}
```

---

## Openings

Openings define doors and windows in walls.

### Doors

#### Interior Door (between two rooms)

```planscript
opening door <id> {
  between <room1> and <room2>
  on shared_edge
  at <position>
  width <value>           # Optional if defaults set
}
```

**Example:**
```planscript
opening door d1 {
  between living and kitchen
  on shared_edge
  at 50%
  width 0.9
}
```

#### Exterior Door (on a room's edge)

For front doors, back doors, or any door on an exterior wall:

```planscript
opening door <id> {
  on <room>.edge <direction>
  at <position>
  width <value>           # Optional if defaults set
}
```

**Example (front door):**
```planscript
opening door d_front {
  on foyer.edge south
  at 50%
  width 1.0
}
```

### Windows

Windows are placed on exterior walls:

```planscript
opening window <id> {
  on <room>.edge <direction>
  at <position>
  width <value>           # Optional if defaults set
  sill <height>           # Optional: sill height from floor
}
```

**Example:**
```planscript
opening window w1 {
  on living.edge south
  at 2.0
  width 2.4
  sill 0.9
}
```

### Position Syntax

Opening positions can be specified two ways:

| Syntax | Description |
|--------|-------------|
| `at <number>%` | Percentage along the wall (0-100%) |
| `at <number>` | Absolute distance from wall start (in current units) |

**Examples:**
```planscript
at 50%      # Centered on the wall
at 25%      # 25% from the start of the wall
at 2.0      # 2 meters from the start of the wall
at 0.5      # 0.5 meters from the start of the wall
```

---

## Assertions

Assertions validate the floor plan. They cause compilation errors if not satisfied.

### No Overlap

Ensures rooms don't overlap:

```planscript
assert no_overlap rooms
```

### Inside Footprint

Ensures all rooms are within the building footprint:

```planscript
assert inside footprint all_rooms
```

Or for a specific room:

```planscript
assert inside footprint <room_id>
```

### Minimum Room Area

Ensures a room meets minimum area requirements:

```planscript
assert min_room_area <room_id> >= <value>
```

**Example:**
```planscript
assert min_room_area bedroom >= 12.0
```

### Orientation Assertions

Orientation assertions require a `site` declaration. They validate that rooms have appropriate solar orientation or proximity to the street.

#### Has Window

Ensures a room has a window facing a specific direction:

```planscript
assert orientation <room_id> has_window <target>
```

**Targets:**
| Target | Description |
|--------|-------------|
| `north`, `south`, `east`, `west` | Cardinal direction |
| `morning_sun` | East (for bedrooms - wake up with natural light) |
| `afternoon_sun` | West (for living areas - evening light) |
| `street` | Same as the street direction from site |

**Examples:**
```planscript
assert orientation master has_window east         # Morning light
assert orientation living has_window afternoon_sun # Evening light
assert orientation bedroom has_window morning_sun  # Natural alarm clock
```

#### Near Street

Ensures a room is located near the street side of the building:

```planscript
assert orientation <room_id> near street
```

Use for rooms that need street access (garage, entry) or don't need premium orientations (service areas).

**Example:**
```planscript
assert orientation garage near street
assert orientation entry near street
```

#### Away From Street

Ensures a room is located at the back of the building (opposite the street):

```planscript
assert orientation <room_id> away_from street
```

Use for service areas that shouldn't waste street frontage.

**Example:**
```planscript
assert orientation laundry away_from street
assert orientation storage away_from street
```

#### Garden View

Ensures a room has a window facing the back (opposite the street):

```planscript
assert orientation <room_id> garden_view
```

Use for living areas that should have views of the yard/garden.

**Example:**
```planscript
assert orientation living garden_view
assert orientation dining garden_view
```

---

## Comments

Single-line comments start with `#`:

```planscript
# This is a comment
room living {
  rect (1, 1) (9, 7)  # Inline comment
}
```

---

## Complete Examples

### Simple: Two Rooms with Door

```planscript
units m

plan "Simple Apartment" {
  footprint rect (0, 0) (10, 8)

  room living {
    rect (0, 0) (6, 8)
    label "Living Room"
  }

  room bedroom {
    rect (6, 0) (10, 8)
    label "Bedroom"
  }

  opening door d1 {
    between living and bedroom
    on shared_edge
    at 50%
    width 0.9
  }
}
```

### Medium: House with Multiple Rooms

```planscript
units m

defaults {
  door_width 0.9
  window_width 1.5
}

plan "Family House" {
  footprint rect (0, 0) (15, 12)

  # Main living area
  room living {
    rect (1, 1) (8, 7)
    label "Living Room"
  }

  # Kitchen attached to living room
  room kitchen {
    rect size (5, 6)
    attach east_of living
    align top
    gap 0
    label "Kitchen"
  }

  # Hallway spanning across
  room hall {
    rect span x from living.left to kitchen.right y (7, 9)
    label "Hallway"
  }

  # Bedrooms
  room master {
    rect at (1, 9) size (5, 3)
    label "Master Bedroom"
  }

  room bedroom2 {
    rect at (6, 9) size (4, 3)
    label "Bedroom 2"
  }

  # Bathroom
  room bath {
    rect at (10, 9) size (3, 3)
    label "Bathroom"
  }

  # Doors
  opening door d1 { between living and hall on shared_edge at 50% }
  opening door d2 { between kitchen and hall on shared_edge at 50% }
  opening door d3 { between hall and master on shared_edge at 50% }
  opening door d4 { between hall and bedroom2 on shared_edge at 50% }
  opening door d5 { between hall and bath on shared_edge at 50% }

  # Windows
  opening window w1 { on living.edge south at 3.0 }
  opening window w2 { on master.edge north at 2.0 }
  opening window w3 { on bedroom2.edge north at 1.5 }

  # Validation
  assert no_overlap rooms
  assert inside footprint all_rooms
  assert min_room_area master >= 12.0
}
```

### Complex: L-Shaped Building

```planscript
units m

defaults {
  door_width 0.9
  window_width 1.2
}

plan "L-Shaped House" {
  # L-shaped footprint
  footprint polygon [
    (0, 0),
    (12, 0),
    (12, 8),
    (7, 8),
    (7, 14),
    (0, 14)
  ]

  # Ground floor rooms
  room living {
    rect (1, 1) (6, 7)
    label "Living Room"
  }

  room kitchen {
    rect (7, 1) (11, 7)
    label "Kitchen"
  }

  room dining {
    rect (1, 8) (6, 13)
    label "Dining Room"
  }

  # Doors
  opening door d1 {
    between living and kitchen
    on shared_edge
    at 50%
  }

  opening door d2 {
    between living and dining
    on shared_edge
    at 50%
  }

  # Windows on exterior walls
  opening window w1 { on living.edge south at 2.0 }
  opening window w2 { on living.edge west at 3.0 }
  opening window w3 { on kitchen.edge south at 2.0 }
  opening window w4 { on kitchen.edge east at 3.0 }
  opening window w5 { on dining.edge west at 2.5 }
  opening window w6 { on dining.edge north at 2.0 }

  assert no_overlap rooms
  assert inside footprint all_rooms
}
```

### Studio Apartment with Bathroom

```planscript
units m

defaults {
  door_width 0.8
  window_width 1.0
}

plan "Studio Apartment" {
  footprint rect (0, 0) (8, 6)

  room main {
    rect (0, 0) (8, 4.5)
    label "Living/Bedroom"
  }

  room bath {
    rect (5, 4.5) (8, 6)
    label "Bathroom"
  }

  room kitchen {
    rect (0, 4.5) (5, 6)
    label "Kitchenette"
  }

  opening door d1 { between main and bath on shared_edge at 50% }
  opening door d2 { between main and kitchen on shared_edge at 60% }

  opening window w1 { on main.edge south at 4.0 width 2.0 }

  assert no_overlap rooms
}
```

---

## Syntax Summary

### Keywords

```
units, origin, defaults, site, plan, footprint, zone, room, courtyard, opening, assert,
rect, polygon, at, size, attach, align, gap, span, from, to, label,
door, window, between, and, on, shared_edge, width, height, sill,
north_of, south_of, east_of, west_of,
north, south, east, west,
top, bottom, left, right, center,
no_overlap, inside, all_rooms, min_room_area,
orientation, has_window, near, away_from, garden_view,
morning_sun, afternoon_sun, street, hemisphere,
my, with, extend, fill, auto,
m, cm, mm, ft, in
```

### Coordinate Format

```
(<x>, <y>)           # Point
(<x1>, <y1>) (<x2>, <y2>)   # Two corners
```

### Point List Syntax

Polygons support two syntaxes:

**Bracketed (recommended for multiline):**
```planscript
polygon [
  (0, 0),
  (10, 0),
  (10, 10),
  (0, 10)
]
```

**Space-separated (compact):**
```planscript
polygon (0, 0) (10, 0) (10, 10) (0, 10)
```

Both syntaxes are equivalent. Bracketed syntax allows trailing commas.

### Numeric Values

```
10        # Integer
10.5      # Decimal
50%       # Percentage (for positions)
auto      # Auto-calculated dimension (for size)
```

### Identifiers

Room and opening IDs must:
- Start with a letter or underscore
- Contain only letters, numbers, and underscores
- Be unique within their category

```
room living { ... }      # Valid
room my_room { ... }     # Valid
room room1 { ... }       # Valid
room 1room { ... }       # Invalid - starts with number
```

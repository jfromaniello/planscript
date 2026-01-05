# PlanScript

A DSL for defining floor plans. Compile `.psc` files to SVG or JSON.

## Example

```planscript
units m
defaults {
  door_width 0.9
  window_width 2.4
}

plan "Example House" {
  footprint rect (0,0) (20,30)

  room living {
    rect (1,1) (9,7)
    label "Living Room"
  }

  room kitchen {
    rect size (4,6)
    attach east_of living
    align top
    gap 0
    label "Kitchen"
  }

  room hall {
    rect span x from living.left to kitchen.right y (7, 9)
    label "Hallway"
  }

  room bedroom {
    rect at (1,9) size (3.6,4.0)
    label "Master Bedroom"
  }

  room bath {
    rect size (2.6,2.2)
    attach east_of bedroom
    align top
    label "Bathroom"
  }

  opening door d1 { between living and hall on shared_edge at 60% }
  opening door d2 { between living and kitchen on shared_edge at 50% }
  opening door d3 { between hall and bedroom on shared_edge at 50% }
  opening window w1 { on living.edge south at 2.0 }
}
```

**Output:**

<p align="center">
  <img src="examples/house.svg" alt="Floor plan without dimensions" width="45%">
  <img src="examples/house-with-dimensions.svg" alt="Floor plan with dimensions" width="45%">
</p>

<p align="center">
  <em>Without dimensions</em> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <em>With <code>--dimensions</code> flag</em>
</p>

## Installation

```bash
npm install planscript
```

## CLI Usage

```bash
# Compile to SVG
planscript house.psc --svg house.svg

# Compile to SVG with dimension lines
planscript house.psc --svg house.svg --dimensions

# Compile to JSON
planscript house.psc --json house.json

# Both outputs
planscript house.psc --svg house.svg --json house.json
```

## Library Usage

### Simple Compilation

```typescript
import { compile } from 'planscript';

const source = `
  units m
  defaults {
    door_width 0.9
  }
  plan "My House" {
    footprint rect (0,0) (15,12)
    
    room living {
      rect (1,1) (8,6)
      label "Living Room"
    }
    
    room kitchen {
      rect (8,1) (14,6)
      label "Kitchen"
    }
    
    opening door d1 {
      between living and kitchen
      on shared_edge
      at 50%
    }
  }
`;

const result = compile(source);

if (result.success) {
  console.log(result.svg);      // SVG string
  console.log(result.geometry); // Geometry IR
} else {
  console.error(result.errors);
}
```

### Step-by-Step Pipeline

```typescript
import { 
  parse, 
  lower, 
  generateGeometry, 
  validate, 
  exportSVG, 
  exportJSON 
} from 'planscript';

// 1. Parse source to AST
const ast = parse(source);

// 2. Lower to resolved geometry
const lowered = lower(ast);

// 3. Generate geometry IR (walls, openings)
const geometry = generateGeometry(lowered);

// 4. Validate assertions
const errors = validate(lowered, geometry);
if (errors.length > 0) {
  throw new Error(errors[0].message);
}

// 5. Export
const svg = exportSVG(geometry, { width: 800, height: 600 });
const json = exportJSON(geometry, { pretty: true }, ast);
```

### Export Options

```typescript
// SVG options
const svg = exportSVG(geometry, {
  width: 1000,           // Canvas width (default: 1000)
  height: 800,           // Canvas height (default: 800)
  padding: 50,           // Padding around floor plan (default: 50)
  showDimensions: true,  // Show dimension lines (default: false)
  showLabels: true,      // Show room labels (default: true)
  wallColor: '#2c3e50',
  roomFillColor: '#ecf0f1',
  doorColor: '#e74c3c',
  windowColor: '#3498db',
});

// JSON options
const json = exportJSON(geometry, { 
  pretty: true  // Pretty-print JSON (default: false)
}, ast);
```

## Language Syntax

### Basic Structure

```planscript
units m                    # meters, cm, mm, ft, in
origin (0,0)               # optional origin point
defaults {
  door_width 0.9           # default door width
  window_width 1.2         # default window width
}

plan "House Name" {
  footprint rect (0,0) (20,15)
  
  # rooms...
  # openings...
  # assertions...
}
```

### Room Definitions

```planscript
# Rectangle with two corners
room living {
  rect (0,0) (8,6)
  label "Living Room"
}

# Rectangle with position and size
room bedroom {
  rect at (0,6) size (4,4)
}

# Relative placement
room kitchen {
  rect size (4,6)
  attach east_of living
  align top
  gap 0
}

# Span syntax (reference other rooms)
room hallway {
  rect span x from living.left to kitchen.right y (6, 8)
}
```

### Openings

```planscript
# Door between rooms
opening door d1 {
  between living and kitchen
  on shared_edge
  at 50%              # 50% along wall (centered)
  width 0.9           # optional if defaults set
}

# Window on room edge
opening window w1 {
  on living.edge south
  at 2.0              # 2 meters from wall start
  width 1.5
  sill 0.9            # sill height
}
```

### Position Syntax

- `at 50%` - percentage along wall (0-100)
- `at 2.0` - absolute distance in meters from wall start

### Assertions

```planscript
assert no_overlap rooms              # rooms don't overlap
assert inside footprint all_rooms    # rooms within footprint
assert min_room_area bedroom >= 12   # minimum area check
```

## VS Code Extension

The PlanScript VS Code extension provides:
- Syntax highlighting
- Go to Definition (Ctrl+Click)
- Hover information
- Document outline
- Autocomplete

### Installation

**From VS Code Marketplace:**
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "PlanScript"
4. Click Install

**From GitHub:**
```bash
# Clone the extension repo
git clone https://github.com/TODO_YOUR_USERNAME/vscode-planscript
cd vscode-planscript

# Install and build
npm install
npm run compile

# Install to VS Code
code --install-extension .
```

## License

MIT

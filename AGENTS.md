# AGENTS.md - Development Guide for AI Agents

This document provides context for AI agents (Claude, GPT, etc.) working on the PlanScript codebase.

## Project Overview

**PlanScript** is a deterministic, textual DSL for defining 2D architectural floor plans. It compiles human-readable code into precise geometry (SVG, JSON).

Key design principles:
- **Deterministic**: Same input always produces same output
- **Compiler-based**: Parse → Lower → Generate → Validate → Export
- **LLM-friendly**: Simple vocabulary, repetitive syntax, clear errors

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (ES modules) |
| Parser | Peggy (PEG parser generator) + ts-pegjs |
| Testing | Vitest |
| Build | TypeScript compiler (tsc) |
| Package | npm |

## Project Structure

```
cado/
├── src/
│   ├── parser/
│   │   ├── grammar.pegjs     # PEG grammar definition (SOURCE OF TRUTH)
│   │   ├── grammar.ts        # Generated parser (DO NOT EDIT)
│   │   ├── index.ts          # Parser API (parse, tryParse)
│   │   └── parser.test.ts    # Parser tests
│   ├── ast/
│   │   └── types.ts          # AST node type definitions
│   ├── lowering/
│   │   ├── index.ts          # AST → LoweredProgram (polygon resolution)
│   │   └── lowering.test.ts  # Lowering tests
│   ├── geometry/
│   │   ├── index.ts          # Geometry IR generation (walls, openings)
│   │   ├── types.ts          # Geometry IR types
│   │   └── geometry.test.ts  # Geometry tests
│   ├── validation/
│   │   └── index.ts          # Validation (assertions, overlap detection)
│   ├── exporters/
│   │   ├── svg.ts            # SVG export
│   │   └── json.ts           # JSON export
│   ├── compiler.ts           # Main compilation pipeline
│   ├── cli.ts                # CLI entry point
│   └── index.ts              # Public API exports
├── examples/                 # Example .psc files
├── LANGUAGE_REFERENCE.md     # Complete language documentation
├── DESIGN.md                 # Design document and philosophy
├── README.md                 # User-facing documentation
└── package.json
```

## NPM Scripts

```bash
# Install dependencies
npm install

# Build the parser from grammar (REQUIRED after grammar changes)
npm run build:grammar

# Compile TypeScript
npm run build:ts

# Full build (grammar + TypeScript)
npm run build

# Development mode (rebuild grammar, then watch TypeScript)
npm run dev

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Compilation Pipeline

```
Source (.psc)
    ↓ parse()           # src/parser/index.ts
AST (Program)
    ↓ lower()           # src/lowering/index.ts
LoweredProgram          # All geometry resolved to polygons
    ↓ generateGeometry() # src/geometry/index.ts
GeometryIR              # Walls, openings with coordinates
    ↓ validate()        # src/validation/index.ts
Validation errors OR success
    ↓ exportSVG() / exportJSON()  # src/exporters/
Output
```

## Key Files When Making Changes

### Adding New Syntax

1. **`src/parser/grammar.pegjs`** - Add grammar rules
2. **`src/ast/types.ts`** - Add AST type definitions
3. **`src/lowering/index.ts`** - Add lowering logic to resolve geometry
4. **`src/parser/parser.test.ts`** - Add parser tests
5. **`src/lowering/lowering.test.ts`** - Add lowering tests
6. **`LANGUAGE_REFERENCE.md`** - Document the new syntax

**Important**: After modifying `grammar.pegjs`, run `npm run build:grammar` to regenerate `grammar.ts`.

### Modifying Geometry Generation

- **`src/geometry/index.ts`** - Wall/opening generation logic
- **`src/geometry/types.ts`** - Geometry IR type definitions
- **`src/geometry/geometry.test.ts`** - Geometry tests

### Modifying Validation

- **`src/validation/index.ts`** - Assertion checking, overlap detection
- **`src/validation/validation.test.ts`** - Validation tests

### Modifying Export

- **`src/exporters/svg.ts`** - SVG rendering
- **`src/exporters/json.ts`** - JSON serialization
- **`src/exporters/exporters.test.ts`** - Export tests

## Testing

Tests use Vitest. Each module has co-located test files (`*.test.ts`).

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run src/parser/parser.test.ts

# Run tests matching pattern
npx vitest run -t "explicit alignment"

# Watch mode
npm run test:watch
```

### Test Structure

- **Parser tests**: Verify syntax is parsed correctly to AST
- **Lowering tests**: Verify AST is correctly resolved to polygons
- **Geometry tests**: Verify walls and openings are generated correctly
- **Validation tests**: Verify assertions catch errors
- **Exporter tests**: Verify output formats

## CLI Usage

```bash
# After building
node dist/cli.js <input.psc> [options]

# Options:
#   --svg <file>      Output SVG file
#   --json <file>     Output JSON file
#   --dimensions      Include dimension lines in SVG

# Example:
node dist/cli.js examples/house.psc --svg output.svg --dimensions
```

## Common Tasks

### Add a New Room Geometry Type

1. Add type to `src/ast/types.ts`:
   ```typescript
   export interface RoomNewType extends ASTNode {
     type: 'RoomNewType';
     // ... properties
   }
   ```

2. Add to `RoomGeometry` union in `src/ast/types.ts`

3. Add grammar rule in `src/parser/grammar.pegjs`:
   ```
   RoomNewType
     = "newtype"i _ /* ... */ {
         return { type: 'RoomNewType', /* ... */ } as AST.RoomNewType;
       }
   ```

4. Add to `RoomGeometry` rule in grammar

5. Add lowering logic in `src/lowering/index.ts`:
   ```typescript
   case 'RoomNewType': {
     // Convert to polygon
     return /* Point[] */;
   }
   ```

6. Add tests and documentation

### Add a New Directive

1. Add type to `src/ast/types.ts`
2. Add to `RoomDefinition` interface if room-level
3. Add grammar rule and include in `RoomContent`
4. Handle in room definition parsing in grammar
5. Use in lowering logic
6. Add tests and documentation

## Language Reference

See `LANGUAGE_REFERENCE.md` for complete syntax documentation. Key constructs:

- **Zones**: Logical groupings of rooms that can be positioned as a unit
- **Rooms**: `rect`, `polygon`, `fill between`
- **Positioning**: `attach`, `align`, `gap`, `extend`
- **Openings**: `opening door`, `opening window`
- **Assertions**: `assert no_overlap`, `assert inside footprint`, etc.

## Error Handling

The compiler produces typed errors:

- **Parse errors**: Invalid syntax (from Peggy)
- **Lowering errors**: Invalid references, missing directives
- **Validation errors**: Assertion failures (E201 overlap, E130 outside footprint, etc.)

Errors include source locations when available.

## Dependencies

Minimal dependencies by design:

- **peggy** + **ts-pegjs**: Parser generation
- **typescript**: Type checking and compilation
- **vitest**: Testing

No runtime dependencies for the core library.

## Solver Development Philosophy

The solver (`src/solver/`) converts high-level intent JSON into valid PlanScript. When working on the solver, follow these principles:

### The Solver Adapts to Intents, Not Vice Versa

**CRITICAL**: When the solver fails on a reasonable architectural intent, the problem is in the solver, not the intent. Do NOT modify intent files to work around solver limitations.

**Bad approach**:
```
Solver fails on shared bathroom → Change intent to make it an ensuite
```

**Good approach**:
```
Solver fails on shared bathroom → Fix solver to handle shared bathrooms
                                → OR fail with clear explanation if architecturally impossible
```

### When Intents Are Architecturally Impossible

Some intents are genuinely impossible due to architectural constraints. In these cases:

1. **The solver should FAIL**, not produce invalid layouts
2. **Error messages should explain WHY** it's impossible
3. **Suggest fixes** when possible

Example of an impossible intent:
- West wing (6m wide, linear) with: Kitchen (circulation), Shared Bath, Bedroom
- Shared bath needs circulation access, bedroom needs circulation access
- In a linear wing, only one can be adjacent to kitchen
- Bath can't be accessed through bedroom (not circulation)
- Bedroom can't be accessed through bath (architectural rule)

**Correct solver behavior**: Fail with message like:
> "Cannot place shared bath in west/back: requires circulation access but bedroom1 blocks the only path from kitchen. Consider adding a hall/corridor in the west wing."

### Debugging the Solver

Use `--inspect` flag to understand solver decisions:

```bash
node dist/cli.js input.intent.json --inspect
```

This shows:
- Room ordering with priority breakdown
- Candidate placements and rejection reasons
- Door placement decisions
- Access/reachability analysis

**Do NOT write throwaway debug scripts** - if you need visibility into solver behavior, use `--inspect` or improve its output.

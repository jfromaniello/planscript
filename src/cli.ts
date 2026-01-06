#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { compile, CompileError } from './compiler.js';
import { solve, parseIntent, validateIntent, parseAndValidateIntent, validateIntentSchema, formatValidationResult } from './solver/index.js';
import { formatInspectTrace } from './solver/inspect.js';
import { getLayoutIntentJsonSchemaString } from './solver/intent/json-schema.js';

const args = process.argv.slice(2);

// Detect subcommand
const command = args[0];

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

if (command === 'solve') {
  runSolve(args.slice(1));
} else if (command === 'compile') {
  runCompile(args.slice(1));
} else if (command === 'intent-schema') {
  runIntentSchema(args.slice(1));
} else if (command?.endsWith('.json')) {
  // Auto-detect: JSON file means solve
  runSolve(args);
} else if (command?.endsWith('.psc')) {
  // Auto-detect: .psc file means compile
  runCompile(args);
} else {
  // Legacy: treat first arg as input file for compile
  runCompile(args);
}

function showHelp() {
  console.log(`
PlanScript - A DSL for defining floor plans

Commands:
  planscript compile <input.psc> [options]   Compile PlanScript to SVG/JSON
  planscript solve <intent.json> [options]   Generate PlanScript from intent
  planscript intent-schema [options]         Output JSON Schema for intent format

Compile Options:
  --svg <output.svg>   Write SVG output to file
  --json <output.json> Write JSON output to file
  --dimensions         Include dimension lines in SVG
  --no-labels          Don't show room labels in SVG
  --no-svg             Don't generate SVG

Solve Options:
  --out <output.psc>   Write generated PlanScript to file
  --svg <output.svg>   Also compile and write SVG
  --debug              Show debug output
  --inspect            Show detailed solver inspection trace
  --variants <n>       Try n variants, pick best (default: 1)

Intent Schema Options:
  --out <file.json>    Write schema to file (default: stdout)

Examples:
  planscript compile house.psc --svg house.svg
  planscript solve intent.json --out house.psc
  planscript solve intent.json --out house.psc --svg house.svg
  planscript intent-schema --out intent-schema.json
  planscript house.psc --svg house.svg  # auto-detects compile
  planscript intent.json --out plan.psc # auto-detects solve
`);
}

function runIntentSchema(args: string[]) {
  let outputFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out' && args[i + 1]) {
      outputFile = args[++i];
    }
  }

  const schema = getLayoutIntentJsonSchemaString();

  if (outputFile) {
    writeFileSync(outputFile, schema);
    console.log(`JSON Schema written to: ${outputFile}`);
  } else {
    console.log(schema);
  }
}

/**
 * Format error in a way that editors can parse for click-to-navigate.
 */
function formatError(file: string, error: CompileError): string {
  const parts: string[] = [];

  if (error.location) {
    parts.push(`${file}:${error.location.line}:${error.location.column}`);
  } else {
    parts.push(file);
  }

  const errorType = error.code ? `error[${error.code}]` : 'error';
  parts.push(errorType);
  parts.push(error.message);

  return parts.join(': ');
}

function runCompile(args: string[]) {
  if (args.length === 0 || args[0].startsWith('-')) {
    console.error('Error: No input file specified');
    console.error('Usage: planscript compile <input.psc> [options]');
    process.exit(1);
  }

  const inputFile = args[0];
  const absoluteInputFile = resolve(inputFile);
  let svgOutput: string | undefined;
  let jsonOutput: string | undefined;
  let emitSVG = true;
  let emitJSON = false;
  let showDimensions = false;
  let showLabels = true;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--svg' && args[i + 1]) {
      svgOutput = args[++i];
    } else if (arg === '--json' && args[i + 1]) {
      jsonOutput = args[++i];
      emitJSON = true;
    } else if (arg === '--no-svg') {
      emitSVG = false;
    } else if (arg === '--dimensions') {
      showDimensions = true;
    } else if (arg === '--no-labels') {
      showLabels = false;
    }
  }

  try {
    const source = readFileSync(inputFile, 'utf-8');
    const result = compile(source, {
      emitSVG,
      emitJSON,
      svgOptions: {
        showDimensions,
        showLabels,
      },
      jsonOptions: { pretty: true },
    });

    if (!result.success) {
      console.error('');
      for (const error of result.errors) {
        console.error(formatError(absoluteInputFile, error));
      }
      console.error('');
      console.error(`Compilation failed with ${result.errors.length} error(s).`);
      process.exit(1);
    }

    console.log('Compilation successful!');

    if (svgOutput && result.svg) {
      writeFileSync(svgOutput, result.svg);
      console.log(`  SVG written to: ${svgOutput}`);
    } else if (result.svg) {
      console.log(`  SVG: ${result.svg.length} bytes generated`);
    }

    if (jsonOutput && result.json) {
      writeFileSync(jsonOutput, result.json);
      console.log(`  JSON written to: ${jsonOutput}`);
    }

    if (result.geometry) {
      console.log(`  Rooms: ${result.geometry.rooms.length}`);
      console.log(`  Walls: ${result.geometry.walls.length}`);
      console.log(`  Openings: ${result.geometry.openings.length}`);
    }
  } catch (e) {
    if (e instanceof Error) {
      console.error(`${absoluteInputFile}: error: ${e.message}`);
    } else {
      console.error(`${absoluteInputFile}: error: Unknown error occurred`);
    }
    process.exit(1);
  }
}

function runSolve(args: string[]) {
  if (args.length === 0 || args[0].startsWith('-')) {
    console.error('Error: No input file specified');
    console.error('Usage: planscript solve <intent.json> [options]');
    process.exit(1);
  }

  const inputFile = args[0];
  const absoluteInputFile = resolve(inputFile);
  let pscOutput: string | undefined;
  let svgOutput: string | undefined;
  let debug = false;
  let inspect = false;
  let variants = 1;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out' && args[i + 1]) {
      pscOutput = args[++i];
    } else if (arg === '--svg' && args[i + 1]) {
      svgOutput = args[++i];
    } else if (arg === '--debug') {
      debug = true;
    } else if (arg === '--inspect') {
      inspect = true;
    } else if (arg === '--variants' && args[i + 1]) {
      variants = parseInt(args[++i], 10);
    }
  }

  try {
    const jsonSource = readFileSync(inputFile, 'utf-8');
    
    // Parse and validate with TypeBox schema
    let intent;
    try {
      intent = parseAndValidateIntent(jsonSource);
    } catch (e) {
      if (e instanceof Error) {
        console.error(e.message);
      } else {
        console.error('Invalid intent format');
      }
      process.exit(1);
    }

    // Run additional semantic validation
    const validationErrors = validateIntent(intent);
    if (validationErrors.length > 0) {
      console.error('Intent validation errors:');
      for (const err of validationErrors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }

    // Solve
    console.log('Solving floor plan...');
    const result = solve(intent, { debug, inspect, variants });
    
    // Print inspection trace if requested
    if (inspect && result.inspectTrace) {
      console.log('');
      console.log(formatInspectTrace(result.inspectTrace));
      console.log('');
    }

    if (!result.success) {
      console.error('');
      console.error(`Solve failed: ${result.error}`);
      if (result.violations) {
        for (const v of result.violations) {
          console.error(`  - ${v}`);
        }
      }
      process.exit(1);
    }

    console.log('Solve successful!');
    console.log(`  Score: ${result.score.total.toFixed(2)}`);
    console.log(`  Rooms placed: ${result.state.placed.size}`);
    console.log(`  Openings: ${result.state.openings.length}`);

    // Write PlanScript output
    if (pscOutput) {
      writeFileSync(pscOutput, result.planScript);
      console.log(`  PlanScript written to: ${pscOutput}`);
    } else {
      console.log('\nGenerated PlanScript:');
      console.log('---');
      console.log(result.planScript);
      console.log('---');
    }

    // Optionally compile to SVG
    if (svgOutput) {
      console.log('\nCompiling to SVG...');
      const compileResult = compile(result.planScript, {
        emitSVG: true,
        svgOptions: { showDimensions: false, showLabels: true },
      });

      if (compileResult.success && compileResult.svg) {
        writeFileSync(svgOutput, compileResult.svg);
        console.log(`  SVG written to: ${svgOutput}`);
      } else {
        console.error('Failed to compile generated PlanScript to SVG');
        if (compileResult.errors) {
          for (const err of compileResult.errors) {
            console.error(`  - ${err.message}`);
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof Error) {
      console.error(`${absoluteInputFile}: error: ${e.message}`);
    } else {
      console.error(`${absoluteInputFile}: error: Unknown error occurred`);
    }
    process.exit(1);
  }
}

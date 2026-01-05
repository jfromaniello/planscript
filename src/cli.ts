#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { compile } from './compiler.js';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
PlanScript Compiler - A DSL for defining floor plans

Usage:
  planscript <input.psc> [options]

Options:
  --svg <output.svg>   Write SVG output to file
  --json <output.json> Write JSON output to file
  --dimensions         Include dimension lines in SVG
  --no-labels          Don't show room labels in SVG
  --no-svg             Don't generate SVG
  --help, -h           Show this help message

Examples:
  planscript house.psc --svg house.svg
  planscript house.psc --svg house.svg --dimensions
  planscript house.psc --json house.json --no-svg
`);
  process.exit(0);
}

const inputFile = args[0];
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
    console.error('Compilation failed:');
    for (const error of result.errors) {
      const location = error.location ? ` at line ${error.location.line}:${error.location.column}` : '';
      const code = error.code ? ` [${error.code}]` : '';
      console.error(`  ${error.phase}${code}${location}: ${error.message}`);
    }
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
    console.error(`Error: ${e.message}`);
  } else {
    console.error('Unknown error occurred');
  }
  process.exit(1);
}

#!/bin/bash
# Generate .svg from all .psc files in examples/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXAMPLES_DIR="$PROJECT_DIR/examples"
CLI="$PROJECT_DIR/dist/cli.js"

echo "Building SVGs from PlanScript files..."

for psc_file in "$EXAMPLES_DIR"/*.psc; do
  if [ -f "$psc_file" ]; then
    base_name=$(basename "$psc_file" .psc)
    svg_file="$EXAMPLES_DIR/$base_name.svg"
    
    echo "  $base_name.psc -> $base_name.svg"
    node "$CLI" "$psc_file" --svg "$svg_file" || echo "    Warning: Failed to compile $base_name.psc"
  fi
done

echo "Done!"

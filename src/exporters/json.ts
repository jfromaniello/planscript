import type { GeometryIR } from '../geometry/types.js';
import type { Program } from '../ast/types.js';

// ============================================================================
// JSON Export Options
// ============================================================================

export interface JSONExportOptions {
  pretty?: boolean;
  includeAST?: boolean;
}

// ============================================================================
// JSON Export Result
// ============================================================================

export interface JSONExportResult {
  version: string;
  geometry: GeometryIR;
  ast?: Program;
}

// ============================================================================
// Main Export Function
// ============================================================================

export function exportJSON(
  geometry: GeometryIR,
  options: JSONExportOptions = {},
  ast?: Program
): string {
  const result: JSONExportResult = {
    version: '1.0.0',
    geometry,
  };

  if (options.includeAST && ast) {
    result.ast = ast;
  }

  if (options.pretty) {
    return JSON.stringify(result, null, 2);
  }

  return JSON.stringify(result);
}

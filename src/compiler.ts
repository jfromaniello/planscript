import { parse, tryParse } from './parser/index.js';
import { lower, LoweringError } from './lowering/index.js';
import { generateGeometry } from './geometry/index.js';
import { validate, ValidationError } from './validation/index.js';
import { exportSVG, SVGExportOptions } from './exporters/svg.js';
import { exportJSON, JSONExportOptions } from './exporters/json.js';
import type { Program } from './ast/types.js';
import type { GeometryIR } from './geometry/types.js';

// ============================================================================
// Compile Error
// ============================================================================

export interface CompileError {
  phase: 'parse' | 'lower' | 'validate';
  message: string;
  location?: {
    line: number;
    column: number;
  };
  code?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Compile Result
// ============================================================================

export interface CompileResult {
  success: boolean;
  errors: CompileError[];
  ast?: Program;
  geometry?: GeometryIR;
  svg?: string;
  json?: string;
}

// ============================================================================
// Compile Options
// ============================================================================

export interface CompileOptions {
  emitSVG?: boolean;
  emitJSON?: boolean;
  svgOptions?: SVGExportOptions;
  jsonOptions?: JSONExportOptions;
}

// ============================================================================
// Compiler
// ============================================================================

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const errors: CompileError[] = [];

  // Phase 1: Parse
  const parseResult = tryParse(source);
  if (!parseResult.success) {
    return {
      success: false,
      errors: [
        {
          phase: 'parse',
          message: parseResult.error.message,
          location: parseResult.error.location?.start,
        },
      ],
    };
  }

  const ast = parseResult.program;

  // Phase 2: Lower
  let lowered;
  try {
    lowered = lower(ast);
  } catch (e) {
    if (e instanceof LoweringError) {
      return {
        success: false,
        errors: [
          {
            phase: 'lower',
            message: e.message,
            details: e.roomName ? { room: e.roomName } : undefined,
          },
        ],
        ast,
      };
    }
    throw e;
  }

  // Phase 3: Generate Geometry
  const geometry = generateGeometry(lowered);

  // Phase 4: Validate
  const validationErrors = validate(lowered, geometry);
  if (validationErrors.length > 0) {
    return {
      success: false,
      errors: validationErrors.map((e) => ({
        phase: 'validate' as const,
        message: e.message,
        code: e.code,
        details: e.details,
      })),
      ast,
      geometry,
    };
  }

  // Phase 5: Export
  const result: CompileResult = {
    success: true,
    errors: [],
    ast,
    geometry,
  };

  if (options.emitSVG !== false) {
    result.svg = exportSVG(geometry, options.svgOptions);
  }

  if (options.emitJSON) {
    result.json = exportJSON(geometry, options.jsonOptions, ast);
  }

  return result;
}

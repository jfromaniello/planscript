// ============================================================================
// PlanScript - A DSL for defining floor plans
// ============================================================================

// AST Types
export * from './ast/types.js';

// Parser
export { parse, tryParse, SyntaxError } from './parser/index.js';

// Lowering
export { lower, LoweringError, LoweredProgram, LoweredRoom, Defaults } from './lowering/index.js';

// Geometry
export * from './geometry/types.js';
export { generateGeometry } from './geometry/index.js';

// Validation
export { validate, ValidationError } from './validation/index.js';

// Exporters
export { exportSVG, SVGExportOptions } from './exporters/svg.js';
export { exportJSON, JSONExportOptions, JSONExportResult } from './exporters/json.js';

// Compiler (full pipeline)
export { compile, CompileResult, CompileError, CompileOptions } from './compiler.js';

// Solver (intent to PlanScript)
export { 
  solve, 
  parseIntent, 
  validateIntent,
  parseAndValidateIntent,
  validateIntentSchema,
  formatValidationResult,
  getLayoutIntentJsonSchema,
  getLayoutIntentJsonSchemaString,
  LayoutIntentSchema,
  type LayoutIntent,
  type RoomSpec,
  type ValidationResult,
  type ValidationError as IntentValidationError,
  type SolverResult,
  type SolveOptions,
} from './solver/index.js';

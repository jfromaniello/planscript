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

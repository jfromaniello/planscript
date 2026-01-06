/**
 * JSON Schema generation for the Layout Intent format.
 * Users can use this schema for editor validation, documentation, etc.
 */

import { LayoutIntentSchema } from './schema.js';

/**
 * Get the JSON Schema for the LayoutIntent format.
 * This can be used by editors, validators, or documentation tools.
 */
export function getLayoutIntentJsonSchema(): object {
  return LayoutIntentSchema;
}

/**
 * Get the JSON Schema as a formatted string.
 */
export function getLayoutIntentJsonSchemaString(indent = 2): string {
  return JSON.stringify(LayoutIntentSchema, null, indent);
}

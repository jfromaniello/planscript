/**
 * Intent validation using TypeBox.
 * Provides detailed, user-friendly error messages.
 */

import { Value } from '@sinclair/typebox/value';
import { LayoutIntentSchema, type LayoutIntent } from './schema.js';

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  success: boolean;
  errors: ValidationError[];
  /** Semantic warnings (not schema violations but potential issues) */
  warnings: string[];
}

/**
 * Format a TypeBox error path to be user-friendly.
 */
function formatPath(path: string): string {
  // Remove leading slash, make array indices clearer
  return path.replace(/^\//, '').replace(/\/(\d+)\//g, '[$1].').replace(/\/(\d+)$/, '[$1]').replace(/\//g, '.');
}

/**
 * Get a human-readable error message for a TypeBox error.
 */
function formatErrorMessage(error: { path: string; message: string; value: unknown }): string {
  const path = formatPath(error.path);
  
  // Customize common error messages
  if (error.message.includes('Expected union value')) {
    if (path.includes('units')) {
      return `must be "m" (meters) or "cm" (centimeters)`;
    }
    if (path.includes('frontEdge') || path.includes('gardenEdge') || path.includes('mustTouchEdge')) {
      return `must be "north", "south", "east", or "west"`;
    }
    if (path.includes('type') && path.includes('room')) {
      return `must be a valid room type (bedroom, bath, kitchen, dining, living, office, garage, laundry, hall, corridor, foyer, stairwell, closet, ensuite, utility, storage, other)`;
    }
    if (path.includes('footprint.kind')) {
      return `must be "rect" or "polygon"`;
    }
    if (path.includes('accessRulePreset')) {
      return `must be "open_plan", "traditional", or "privacy_focused"`;
    }
  }
  
  if (error.message.includes('Expected number')) {
    // Check if it's a negative number that should be positive
    if (typeof error.value === 'number' && error.value < 0) {
      return `must be a positive number`;
    }
    return `must be a number`;
  }
  
  if (error.message.includes('Expected string')) {
    return `must be a string`;
  }
  
  if (error.message.includes('Expected boolean')) {
    return `must be true or false`;
  }
  
  if (error.message.includes('Expected array')) {
    return `must be an array`;
  }
  
  if (error.message.includes('Expected object')) {
    return `must be an object`;
  }
  
  if (error.message.includes('Required property')) {
    const match = error.message.match(/Required property '([^']+)'/);
    if (match) {
      return `missing required property "${match[1]}"`;
    }
    return `missing required property`;
  }
  
  if (error.message.includes('Unexpected property')) {
    const match = error.message.match(/Unexpected property '([^']+)'/);
    if (match) {
      return `unknown property "${match[1]}" (check spelling or see schema)`;
    }
    return `unknown property`;
  }
  
  if (error.message.includes('minimum')) {
    return `value too small`;
  }
  
  if (error.message.includes('exclusiveMinimum')) {
    return `must be greater than 0`;
  }
  
  if (error.message.includes('minItems')) {
    return `array must not be empty`;
  }
  
  if (error.message.includes('minLength')) {
    return `must not be empty`;
  }
  
  return error.message;
}

/**
 * Validate a parsed JSON object against the LayoutIntent schema.
 * Returns detailed, user-friendly error messages.
 */
export function validateIntentSchema(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Run TypeBox validation
  const schemaErrors = [...Value.Errors(LayoutIntentSchema, data)];
  
  for (const error of schemaErrors) {
    errors.push({
      path: formatPath(error.path),
      message: formatErrorMessage({ path: error.path, message: error.message, value: error.value }),
      value: error.value,
    });
  }

  // If schema validation passed, run semantic validation
  if (errors.length === 0) {
    const intent = data as LayoutIntent;
    
    // Check for duplicate room IDs
    const roomIds = new Set<string>();
    for (const room of intent.rooms) {
      if (roomIds.has(room.id)) {
        errors.push({
          path: `rooms`,
          message: `duplicate room ID "${room.id}"`,
        });
      }
      roomIds.add(room.id);
    }

    // Check adjacency references
    for (let i = 0; i < intent.rooms.length; i++) {
      const room = intent.rooms[i];
      
      if (room.adjacentTo) {
        for (const adjId of room.adjacentTo) {
          if (!roomIds.has(adjId)) {
            errors.push({
              path: `rooms[${i}].adjacentTo`,
              message: `references unknown room "${adjId}"`,
            });
          }
          if (adjId === room.id) {
            errors.push({
              path: `rooms[${i}].adjacentTo`,
              message: `room cannot be adjacent to itself`,
            });
          }
        }
      }

      if (room.avoidAdjacentTo) {
        for (const adjId of room.avoidAdjacentTo) {
          if (!roomIds.has(adjId)) {
            errors.push({
              path: `rooms[${i}].avoidAdjacentTo`,
              message: `references unknown room "${adjId}"`,
            });
          }
        }
      }

      if (room.needsAccessFrom) {
        for (const accessId of room.needsAccessFrom) {
          if (!roomIds.has(accessId)) {
            errors.push({
              path: `rooms[${i}].needsAccessFrom`,
              message: `references unknown room "${accessId}"`,
            });
          }
        }
      }
    }

    // Check band/depth references in rooms
    const bandIds = new Set(intent.bands?.map(b => b.id) ?? []);
    const depthIds = new Set(intent.depths?.map(d => d.id) ?? []);

    for (let i = 0; i < intent.rooms.length; i++) {
      const room = intent.rooms[i];
      
      if (room.preferredBands) {
        for (const bandId of room.preferredBands) {
          if (bandIds.size > 0 && !bandIds.has(bandId)) {
            warnings.push(`rooms[${i}].preferredBands references undefined band "${bandId}"`);
          }
        }
      }

      if (room.preferredDepths) {
        for (const depthId of room.preferredDepths) {
          if (depthIds.size > 0 && !depthIds.has(depthId)) {
            warnings.push(`rooms[${i}].preferredDepths references undefined depth "${depthId}"`);
          }
        }
      }
    }

    // Semantic warnings
    const hasEntry = intent.rooms.some(r => 
      r.hasExteriorDoor || 
      r.type === 'foyer' || 
      (r.isCirculation && r.mustTouchEdge === intent.frontEdge)
    );
    
    if (intent.hard.allRoomsReachable !== false && !hasEntry) {
      warnings.push('No entry room defined (consider adding a foyer or marking a room with hasExteriorDoor: true)');
    }

    // Check for circulation when private rooms need it
    const hasCirculation = intent.rooms.some(r => 
      r.isCirculation || 
      ['hall', 'corridor', 'foyer', 'stairwell'].includes(r.type)
    );
    
    const hasPrivateRooms = intent.rooms.some(r => 
      ['bedroom', 'bath', 'ensuite'].includes(r.type)
    );

    if (hasPrivateRooms && !hasCirculation && intent.accessRulePreset === 'traditional') {
      warnings.push('Traditional access rules require circulation space for bedroom/bath access, but no circulation rooms defined');
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Parse and validate intent JSON in one step.
 * Returns the validated intent or throws with detailed errors.
 */
export function parseAndValidateIntent(json: string): LayoutIntent {
  let data: unknown;
  
  try {
    data = JSON.parse(json);
  } catch (e) {
    const err = e as Error;
    throw new Error(`Invalid JSON: ${err.message}`);
  }

  const result = validateIntentSchema(data);
  
  if (!result.success) {
    const errorMessages = result.errors.map(e => 
      e.path ? `  ${e.path}: ${e.message}` : `  ${e.message}`
    );
    throw new Error(`Invalid intent:\n${errorMessages.join('\n')}`);
  }

  return data as LayoutIntent;
}

/**
 * Format validation result as a user-friendly string.
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];
  
  if (result.errors.length > 0) {
    lines.push('Errors:');
    for (const error of result.errors) {
      if (error.path) {
        lines.push(`  ${error.path}: ${error.message}`);
      } else {
        lines.push(`  ${error.message}`);
      }
    }
  }
  
  if (result.warnings.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  ${warning}`);
    }
  }
  
  if (lines.length === 0) {
    return 'Valid';
  }
  
  return lines.join('\n');
}

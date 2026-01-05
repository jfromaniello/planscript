import { parse as peggyParse, PeggySyntaxError } from './grammar.js';
import type { Program } from '../ast/types.js';

export { PeggySyntaxError as SyntaxError };

export interface ParseError {
  message: string;
  location: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
}

export function parse(source: string): Program {
  return peggyParse(source) as Program;
}

export function tryParse(source: string): { success: true; program: Program } | { success: false; error: ParseError } {
  try {
    const program = parse(source);
    return { success: true, program };
  } catch (e: unknown) {
    // Check if it looks like a Peggy SyntaxError (has expected, found, location properties)
    if (e && typeof e === 'object' && 'location' in e && 'message' in e) {
      const err = e as { message: string; location: ParseError['location'] };
      return {
        success: false,
        error: {
          message: err.message,
          location: err.location,
        },
      };
    }
    throw e;
  }
}

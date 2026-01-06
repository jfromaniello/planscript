/**
 * Floor plan solver - converts intent JSON to PlanScript.
 */

export { 
  type LayoutIntent, 
  type RoomSpec, 
  type Footprint, 
  type AccessRule,
  type AccessRulePreset,
  type RoomCategory,
  ROOM_CATEGORIES,
  getAccessRulePreset,
  normalizeIntent 
} from './intent/types.js';
export { validateReachability, checkCirculationRequirement, isDoorAllowed } from './access/index.js';
export { type PlanState, type PlacedRoom, type SolveResult } from './types.js';
export { emitPlanScript, type EmitOptions } from './emit/planscript.js';

// TypeBox schema exports for validation and JSON schema generation
export { 
  LayoutIntentSchema,
  RoomSpecSchema,
  FootprintSchema,
  RoomTypeSchema,
  RoomCategorySchema,
} from './intent/schema.js';
export {
  validateIntentSchema,
  parseAndValidateIntent,
  formatValidationResult,
  type ValidationError,
  type ValidationResult,
} from './intent/validate.js';
export {
  getLayoutIntentJsonSchema,
  getLayoutIntentJsonSchemaString,
} from './intent/json-schema.js';

import type { LayoutIntent } from './intent/types.js';
import { normalizeIntent } from './intent/types.js';
import type { PlanState, SolveResult, PlacedRoom } from './types.js';
import { rectsAdjacent } from './types.js';
import { buildLayoutFrame, type LayoutFrame } from './layout/frame.js';
import { placeRooms, repairPlacement, getRoomOrdering, type PlacerOptions } from './layout/placer.js';
import { validatePlanHard } from './constraints/hard.js';
import { scorePlan, type ScoreBreakdown } from './constraints/soft.js';
import { placeOpenings } from './openings/index.js';
import { generateCorridor, validateCorridor } from './circulation/corridor.js';
import { emitPlanScript, resetOpeningCounter } from './emit/planscript.js';
import { validateReachability, checkCirculationRequirement, findEntryRoom, buildDoorGraph, findUnreachableRooms } from './access/index.js';
import { fillGapsIterative } from './layout/gaps.js';
import { createInspectTrace, type InspectTrace } from './inspect.js';
import { checkArchitecturalRules } from './access/rules.js';
import { isDoorAllowed } from './access/index.js';

export interface SolveOptions {
  /** Placer options */
  placer?: PlacerOptions;
  /** Number of variants to try (picks best scoring) */
  variants?: number;
  /** Enable repair pass after placement */
  repair?: boolean;
  /** Generate corridor to connect disconnected rooms */
  generateCorridor?: boolean;
  /** Fill gaps by expanding rooms after placement */
  fillGaps?: boolean;
  /** Enable debug logging */
  debug?: boolean;
  /** Enable inspection mode (detailed trace) */
  inspect?: boolean;
}

export interface SolveSuccess {
  success: true;
  planScript: string;
  state: PlanState;
  score: ScoreBreakdown;
  frame: LayoutFrame;
  warnings?: string[];
  /** Detailed inspection trace (only when inspect: true) */
  inspectTrace?: InspectTrace;
}

export interface SolveFailure {
  success: false;
  error: string;
  partialState?: PlanState;
  violations?: string[];
  /** Detailed inspection trace (only when inspect: true) */
  inspectTrace?: InspectTrace;
}

export type SolverResult = SolveSuccess | SolveFailure;

/**
 * Solve a floor plan from an intent specification.
 *
 * @param intent - The layout intent (room specs, constraints, etc.)
 * @param options - Solver options
 * @returns Solver result with PlanScript source or error
 */
export function solve(intent: LayoutIntent, options: SolveOptions = {}): SolverResult {
  const { variants = 1, repair = true, generateCorridor: enableCorridor = true, fillGaps = true, debug = false, inspect = false } = options;

  // Create inspection trace if needed
  const trace = inspect ? createInspectTrace() : null;

  try {
    // Normalize intent (fill defaults, convert units)
    const normalized = normalizeIntent(intent);

    if (debug) {
      console.log('Normalized intent:', JSON.stringify(normalized, null, 2));
    }

    // Build layout frame
    const frame = buildLayoutFrame(normalized);

    if (debug) {
      const validCells = frame.cells.filter(c => c.insideFootprint);
      console.log('Layout frame:', {
        bands: frame.bands.map(b => `${b.id}: ${b.x1}-${b.x2}`),
        depths: frame.depths.map(d => `${d.id}: ${d.y1}-${d.y2}`),
        cells: frame.cells.length,
        validCells: validCells.length,
        cellDetails: frame.cells.map(c => `${c.bandId}/${c.depthId}: ${c.insideFootprint ? 'valid' : 'OUTSIDE'}`),
      });
    }

    // Populate frame info in trace
    if (trace) {
      trace.frame.bands = frame.bands.map(b => ({ id: b.id, x1: b.x1, x2: b.x2 }));
      trace.frame.depths = frame.depths.map(d => ({ id: d.id, y1: d.y1, y2: d.y2 }));
      trace.frame.cells = frame.cells.map(c => ({
        id: `${c.bandId}/${c.depthId}`,
        rect: c.rect,
        insideFootprint: c.insideFootprint,
      }));

      // Get room ordering info
      const ordering = getRoomOrdering(normalized.rooms);
      for (const room of ordering.orderedRooms) {
        const prioInfo = ordering.priorities.get(room.id);
        const attached = ordering.attachedRoomsMap.get(room.id);
        trace.roomOrdering.push({
          id: room.id,
          type: room.type,
          priority: prioInfo?.priority ?? -1,
          breakdown: prioInfo?.breakdown ?? {},
          attachedRooms: attached?.map(a => a.id),
        });
      }
    }

    // Try multiple variants if requested
    let bestState: PlanState | null = null;
    let bestScore: ScoreBreakdown | null = null;

    for (let v = 0; v < variants; v++) {
      // Place rooms
      const state = placeRooms(normalized, frame, options.placer);

      // Check for unplaced rooms
      if (state.unplaced.length > 0) {
        if (debug) {
          console.log(`Variant ${v + 1}: ${state.unplaced.length} rooms could not be placed`);
        }
        
        // Record placement failures in trace
        if (trace) {
          for (const unplacedId of state.unplaced) {
            const room = normalized.rooms.find(r => r.id === unplacedId);
            trace.placements.push({
              roomId: unplacedId,
              preferredCells: [...(room?.preferredBands || []), ...(room?.preferredDepths || [])],
              candidatesEvaluated: 0,
              topCandidates: [],
              success: false,
              failureReason: 'No valid placement found',
            });
          }
        }
        continue;
      }

      // Validate basic hard constraints (overlap, footprint)
      const basicViolations = validatePlanHard(state, normalized);

      if (basicViolations.length > 0) {
        if (debug) {
          console.log(`Variant ${v + 1}: ${basicViolations.length} hard constraint violations`);
          for (const violation of basicViolations) {
            console.log(`  - ${violation.message}`);
          }
        }
        continue;
      }

      // Repair if enabled
      if (repair) {
        repairPlacement(state, normalized, frame);
      }

      // Fill gaps by expanding rooms
      if (fillGaps) {
        const gapPasses = fillGapsIterative(state, normalized, frame);
        if (debug && gapPasses > 0) {
          console.log(`Variant ${v + 1}: Filled gaps in ${gapPasses} pass(es)`);
        }
      }

      // Generate corridor if needed and enabled
      // Skip if intent already has circulation rooms defined
      const hasCirculationRooms = normalized.rooms.some(r => 
        r.isCirculation || ['hall', 'corridor', 'foyer'].includes(r.type)
      );
      
      if (enableCorridor && !hasCirculationRooms) {
        const corridor = generateCorridor(state, normalized, frame);
        if (corridor && validateCorridor(corridor, state, normalized)) {
          // Add corridor as a room
          const corridorRoom: PlacedRoom = {
            id: 'corridor',
            rect: corridor.rect ?? {
              x1: Math.min(...corridor.polygon.map(p => p.x)),
              y1: Math.min(...corridor.polygon.map(p => p.y)),
              x2: Math.max(...corridor.polygon.map(p => p.x)),
              y2: Math.max(...corridor.polygon.map(p => p.y)),
            },
            label: 'Hallway',
            type: 'hall',
          };
          state.placed.set('corridor', corridorRoom);
          state.corridorPolygon = corridor.polygon;

          if (debug) {
            console.log(`Variant ${v + 1}: Generated corridor with ${corridor.segments.length} segment(s)`);
          }
        }
      } else if (debug && hasCirculationRooms) {
        console.log(`Variant ${v + 1}: Skipping auto-corridor (intent has circulation rooms)`);
      }

      // Note: Reachability is validated after door placement

      // Score
      const score = scorePlan(state, normalized, frame);

      if (debug) {
        console.log(`Variant ${v + 1}: score = ${score.total.toFixed(2)}`);
      }

      if (!bestState || score.total > bestScore!.total) {
        bestState = state;
        bestScore = score;
      }
    }

    if (!bestState) {
      // Build a helpful error message from failure reasons
      // Get failure reasons from the last attempted state
      const lastState = placeRooms(normalized, frame, options.placer);
      const failureReasons = lastState.failureReasons || [];
      
      let errorMessage = 'Could not find a valid room placement';
      const violations: string[] = [];
      
      if (failureReasons.length > 0) {
        const failedRooms = failureReasons.map(f => f.roomId).join(', ');
        errorMessage = `Could not place ${failureReasons.length} room(s): ${failedRooms}`;
        
        for (const failure of failureReasons) {
          violations.push(failure.reason);
          if (failure.details) {
            violations.push(`  → ${failure.details}`);
          }
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        violations: violations.length > 0 ? violations : undefined,
        inspectTrace: trace ?? undefined,
      };
    }

    // Record successful placements in trace
    if (trace) {
      for (const [id, room] of bestState.placed.entries()) {
        const spec = normalized.rooms.find(r => r.id === id);
        trace.placements.push({
          roomId: id,
          preferredCells: [...(spec?.preferredBands || []), ...(spec?.preferredDepths || [])],
          candidatesEvaluated: 1, // We don't track this currently
          topCandidates: [{
            rect: room.rect,
            cell: `${room.band || ''}/${room.depth || ''}`,
            score: 0,
            accepted: true,
          }],
          finalPlacement: room.rect,
          success: true,
        });
      }
    }

    // Place openings (doors, windows) - respecting access rules
    resetOpeningCounter();
    placeOpenings(bestState, normalized, frame);

    // Collect door decisions for trace
    if (trace) {
      const rooms = Array.from(bestState.placed.values());
      const roomSpecMap = new Map(normalized.rooms.map(r => [r.id, r]));
      
      // Check all adjacent room pairs
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const roomA = rooms[i];
          const roomB = rooms[j];
          
          if (rectsAdjacent(roomA.rect, roomB.rect)) {
            // Check if door was placed
            const doorExists = bestState.openings.some(o => 
              o.type === 'door' && 
              ((o.roomId === roomA.id && o.connectsTo === roomB.id) ||
               (o.roomId === roomB.id && o.connectsTo === roomA.id))
            );
            
            let reason: string | undefined;
            if (!doorExists) {
              // Check why door wasn't placed
              const archViolation = checkArchitecturalRules(roomA, roomB, normalized, roomSpecMap);
              if (archViolation) {
                reason = archViolation;
              } else if (!isDoorAllowed(roomA, roomB, normalized, roomSpecMap)) {
                reason = 'Blocked by access rules';
              } else {
                reason = 'Shared edge too short for door';
              }
            }
            
            trace.doorDecisions.push({
              roomA: roomA.id,
              roomB: roomB.id,
              allowed: doorExists,
              reason,
            });
          }
        }
      }
    }

    // Collect warnings
    const warnings: string[] = [];

    // Final validation (skip old connectivity check - we use reachability now)
    const finalIntentWithoutConnectivity = {
      ...normalized,
      hard: { ...normalized.hard, allRoomsReachable: false },
    };
    const finalViolations = validatePlanHard(bestState, finalIntentWithoutConnectivity);
    if (finalViolations.length > 0) {
      return {
        success: false,
        error: 'Plan has constraint violations after opening placement',
        partialState: bestState,
        violations: finalViolations.map(v => v.message),
        inspectTrace: trace ?? undefined,
      };
    }

    // Validate reachability from entry
    const entryRoom = findEntryRoom(normalized, bestState);
    const reachabilityError = validateReachability(normalized, bestState);
    
    // Populate reachability info in trace
    if (trace) {
      trace.reachability.entryRoom = entryRoom?.id ?? null;
      
      const doorGraph = buildDoorGraph(bestState);
      for (const [roomId, connections] of doorGraph.entries()) {
        trace.reachability.doorGraph[roomId] = Array.from(connections);
      }
      
      if (entryRoom) {
        const unreachable = findUnreachableRooms(entryRoom.id, bestState);
        const allRoomIds = Array.from(bestState.placed.keys());
        trace.reachability.unreachableRooms = unreachable;
        trace.reachability.reachableRooms = allRoomIds.filter(id => !unreachable.includes(id));
      }
      
      // Final layout
      for (const [id, room] of bestState.placed.entries()) {
        trace.finalLayout.push({
          id,
          rect: room.rect,
          type: room.type,
        });
      }
    }
    
    if (reachabilityError) {
      if (debug) {
        console.log(`Reachability error: ${reachabilityError}`);
      }
      if (trace) {
        trace.warnings.push(reachabilityError);
      }
      // If allRoomsReachable is a hard constraint, fail the solve
      if (normalized.hard.allRoomsReachable !== false) {
        return {
          success: false,
          error: 'Plan has unreachable rooms',
          partialState: bestState,
          violations: [reachabilityError],
          inspectTrace: trace ?? undefined,
        };
      }
      // Otherwise just warn
      warnings.push(reachabilityError);
    }

    // Emit PlanScript
    const planScript = emitPlanScript(bestState, normalized, {
      planName: 'Generated Plan',
      includeComments: true,
      includeAssertions: true,
    });

    return {
      success: true,
      planScript,
      state: bestState,
      score: bestScore!,
      frame,
      warnings: warnings.length > 0 ? warnings : undefined,
      inspectTrace: trace ?? undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      inspectTrace: trace ?? undefined,
    };
  }
}

/**
 * Parse intent JSON from a string.
 * @deprecated Use parseAndValidateIntent for proper validation
 */
export function parseIntent(json: string): LayoutIntent {
  return JSON.parse(json) as LayoutIntent;
}

/**
 * Validate intent structure (basic checks).
 * Returns errors (fatal) - use validateIntentWarnings for non-fatal issues.
 */
export function validateIntent(intent: LayoutIntent): string[] {
  const errors: string[] = [];

  if (!intent.footprint) {
    errors.push('Missing footprint');
  }

  if (!intent.rooms || intent.rooms.length === 0) {
    errors.push('No rooms specified');
  }

  if (!intent.frontEdge) {
    errors.push('Missing frontEdge');
  }

  if (!intent.defaults) {
    errors.push('Missing defaults');
  } else {
    if (!intent.defaults.doorWidth) errors.push('Missing defaults.doorWidth');
    if (!intent.defaults.windowWidth) errors.push('Missing defaults.windowWidth');
  }

  if (!intent.hard) {
    errors.push('Missing hard constraints');
  }

  // Check for duplicate room IDs
  const roomIds = new Set<string>();
  for (const room of intent.rooms ?? []) {
    if (roomIds.has(room.id)) {
      errors.push(`Duplicate room ID: ${room.id}`);
    }
    roomIds.add(room.id);

    if (!room.minArea || room.minArea <= 0) {
      errors.push(`Room ${room.id} has invalid minArea`);
    }
  }

  // Check adjacency references
  for (const room of intent.rooms ?? []) {
    if (room.adjacentTo) {
      for (const adjId of room.adjacentTo) {
        if (!roomIds.has(adjId)) {
          errors.push(`Room ${room.id} references unknown adjacentTo: ${adjId}`);
        }
      }
    }
    if (room.needsAccessFrom) {
      for (const accessId of room.needsAccessFrom) {
        if (!roomIds.has(accessId)) {
          errors.push(`Room ${room.id} references unknown needsAccessFrom: ${accessId}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Get warnings about potential issues with intent (non-fatal).
 */
export function validateIntentWarnings(intent: LayoutIntent): string[] {
  const warnings: string[] = [];

  // Check if circulation is needed but missing
  const circulationWarning = checkCirculationRequirement(intent);
  if (circulationWarning) {
    warnings.push(circulationWarning);
  }

  // Check if entry point exists when reachability is required
  if (intent.hard?.allRoomsReachable !== false) {
    const hasEntry = intent.rooms?.some(r => 
      r.hasExteriorDoor || 
      r.type === 'foyer' || 
      (r.isCirculation && r.mustTouchEdge === intent.frontEdge)
    );
    if (!hasEntry) {
      warnings.push('No entry room defined (consider adding a foyer or marking a room with hasExteriorDoor)');
    }
  }

  return warnings;
}

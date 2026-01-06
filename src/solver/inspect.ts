/**
 * Inspection/debugging output for the solver.
 * Provides detailed trace of solver decisions.
 */

import type { RoomSpec } from './intent/types.js';
import type { PlacedRoom, Rect } from './types.js';
import type { LayoutFrame, LayoutCell } from './layout/frame.js';

/** Information about a room's placement priority */
export interface RoomPriorityInfo {
  id: string;
  type: string;
  priority: number;
  breakdown: Record<string, number>;
  attachedRooms?: string[];
}

/** Information about a candidate placement */
export interface CandidateInfo {
  rect: Rect;
  cell: string;
  score: number;
  accepted: boolean;
  rejectionReason?: string;
}

/** Information about room placement */
export interface PlacementInfo {
  roomId: string;
  preferredCells: string[];
  candidatesEvaluated: number;
  topCandidates: CandidateInfo[];
  finalPlacement?: Rect;
  success: boolean;
  failureReason?: string;
}

/** Information about door placement decisions */
export interface DoorDecisionInfo {
  roomA: string;
  roomB: string;
  allowed: boolean;
  reason?: string;
}

/** Information about reachability analysis */
export interface ReachabilityInfo {
  entryRoom: string | null;
  reachableRooms: string[];
  unreachableRooms: string[];
  doorGraph: Record<string, string[]>;
}

/** Complete inspection trace */
export interface InspectTrace {
  /** Layout frame information */
  frame: {
    bands: { id: string; x1: number; x2: number }[];
    depths: { id: string; y1: number; y2: number }[];
    cells: { id: string; rect: Rect; insideFootprint: boolean }[];
  };
  
  /** Room ordering with priority breakdown */
  roomOrdering: RoomPriorityInfo[];
  
  /** Placement decisions for each room */
  placements: PlacementInfo[];
  
  /** Door placement decisions */
  doorDecisions: DoorDecisionInfo[];
  
  /** Reachability analysis */
  reachability: ReachabilityInfo;
  
  /** Final room positions */
  finalLayout: { id: string; rect: Rect; type: string }[];
  
  /** Warnings and issues detected */
  warnings: string[];
}

/** Creates a new empty trace */
export function createInspectTrace(): InspectTrace {
  return {
    frame: { bands: [], depths: [], cells: [] },
    roomOrdering: [],
    placements: [],
    doorDecisions: [],
    reachability: {
      entryRoom: null,
      reachableRooms: [],
      unreachableRooms: [],
      doorGraph: {},
    },
    finalLayout: [],
    warnings: [],
  };
}

/** Format the trace as human-readable text */
export function formatInspectTrace(trace: InspectTrace): string {
  const lines: string[] = [];
  
  // Header
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    SOLVER INSPECTION TRACE');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  
  // Frame
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ LAYOUT FRAME                                                │');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('Bands (horizontal zones):');
  for (const band of trace.frame.bands) {
    lines.push(`  ${band.id}: x = ${band.x1.toFixed(1)} to ${band.x2.toFixed(1)} (${(band.x2 - band.x1).toFixed(1)}m wide)`);
  }
  lines.push('');
  lines.push('Depths (vertical zones):');
  for (const depth of trace.frame.depths) {
    lines.push(`  ${depth.id}: y = ${depth.y1.toFixed(1)} to ${depth.y2.toFixed(1)} (${(depth.y2 - depth.y1).toFixed(1)}m deep)`);
  }
  lines.push('');
  lines.push('Cells:');
  for (const cell of trace.frame.cells) {
    const status = cell.insideFootprint ? '✓ valid' : '✗ OUTSIDE footprint';
    lines.push(`  ${cell.id}: ${status}`);
  }
  lines.push('');
  
  // Room ordering
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ ROOM ORDERING (by placement priority)                       │');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');
  for (let i = 0; i < trace.roomOrdering.length; i++) {
    const room = trace.roomOrdering[i];
    lines.push(`${i + 1}. ${room.id} (${room.type}) — priority: ${room.priority}`);
    
    const parts: string[] = [];
    const base = room.breakdown.base ?? 0;
    for (const [key, value] of Object.entries(room.breakdown)) {
      if (key === 'base') continue;
      if (value !== 0) {
        const sign = value > 0 ? '+' : '';
        parts.push(`${key}:${sign}${value}`);
      }
    }
    
    if (parts.length > 0) {
      lines.push(`   Breakdown: base(${base}) ${parts.join(' ')}`);
    }
    
    if (room.attachedRooms && room.attachedRooms.length > 0) {
      lines.push(`   Attached rooms: ${room.attachedRooms.join(', ')}`);
    }
  }
  lines.push('');
  
  // Placements
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ PLACEMENT DECISIONS                                         │');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');
  for (const placement of trace.placements) {
    const status = placement.success ? '✓' : '✗';
    lines.push(`${status} ${placement.roomId}`);
    lines.push(`   Preferred cells: ${placement.preferredCells.join(', ') || 'none'}`);
    lines.push(`   Candidates evaluated: ${placement.candidatesEvaluated}`);
    
    if (placement.topCandidates.length > 0) {
      lines.push('   Top candidates:');
      for (const cand of placement.topCandidates.slice(0, 3)) {
        const w = cand.rect.x2 - cand.rect.x1;
        const h = cand.rect.y2 - cand.rect.y1;
        const status = cand.accepted ? '→ SELECTED' : (cand.rejectionReason || '');
        lines.push(`     ${w.toFixed(1)}×${h.toFixed(1)}m at (${cand.rect.x1.toFixed(1)},${cand.rect.y1.toFixed(1)}) score=${cand.score.toFixed(1)} ${status}`);
      }
    }
    
    if (placement.finalPlacement) {
      const fp = placement.finalPlacement;
      const w = fp.x2 - fp.x1;
      const h = fp.y2 - fp.y1;
      lines.push(`   Final: ${w.toFixed(1)}×${h.toFixed(1)}m = ${(w * h).toFixed(1)}m² at (${fp.x1.toFixed(1)},${fp.y1.toFixed(1)})`);
    } else if (placement.failureReason) {
      lines.push(`   FAILED: ${placement.failureReason}`);
    }
    lines.push('');
  }
  
  // Door decisions
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ DOOR PLACEMENT DECISIONS                                    │');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  const allowedDoors = trace.doorDecisions.filter(d => d.allowed);
  const blockedDoors = trace.doorDecisions.filter(d => !d.allowed);
  
  if (allowedDoors.length > 0) {
    lines.push('Doors placed:');
    for (const door of allowedDoors) {
      lines.push(`  ✓ ${door.roomA} ↔ ${door.roomB}`);
    }
    lines.push('');
  }
  
  if (blockedDoors.length > 0) {
    lines.push('Doors blocked:');
    for (const door of blockedDoors) {
      lines.push(`  ✗ ${door.roomA} ↔ ${door.roomB}`);
      if (door.reason) {
        lines.push(`      Reason: ${door.reason}`);
      }
    }
    lines.push('');
  }
  
  // Reachability
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ REACHABILITY ANALYSIS                                       │');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push(`Entry room: ${trace.reachability.entryRoom || 'NOT FOUND'}`);
  lines.push('');
  
  if (trace.reachability.reachableRooms.length > 0) {
    lines.push(`Reachable rooms (${trace.reachability.reachableRooms.length}):`);
    lines.push(`  ${trace.reachability.reachableRooms.join(', ')}`);
    lines.push('');
  }
  
  if (trace.reachability.unreachableRooms.length > 0) {
    lines.push(`⚠ UNREACHABLE rooms (${trace.reachability.unreachableRooms.length}):`);
    lines.push(`  ${trace.reachability.unreachableRooms.join(', ')}`);
    lines.push('');
  }
  
  lines.push('Door connectivity graph:');
  for (const [room, connections] of Object.entries(trace.reachability.doorGraph)) {
    if (connections.length > 0) {
      lines.push(`  ${room} → ${connections.join(', ')}`);
    } else {
      lines.push(`  ${room} → (no doors)`);
    }
  }
  lines.push('');
  
  // Final layout
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ FINAL LAYOUT                                                │');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');
  for (const room of trace.finalLayout) {
    const w = room.rect.x2 - room.rect.x1;
    const h = room.rect.y2 - room.rect.y1;
    lines.push(`  ${room.id} (${room.type}): ${w.toFixed(1)}×${h.toFixed(1)}m = ${(w * h).toFixed(1)}m² at (${room.rect.x1.toFixed(1)},${room.rect.y1.toFixed(1)})`);
  }
  lines.push('');
  
  // Warnings
  if (trace.warnings.length > 0) {
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ WARNINGS                                                    │');
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');
    for (const warning of trace.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
    lines.push('');
  }
  
  lines.push('═══════════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

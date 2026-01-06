/**
 * Gap filling - expand rooms to eliminate gaps after placement.
 * 
 * After greedy placement, rooms may not fill their available space,
 * leaving gaps. This module expands rooms to fill those gaps.
 */

import type { LayoutIntent, RoomSpec } from '../intent/types.js';
import type { LayoutFrame } from './frame.js';
import type { PlanState, PlacedRoom, Rect, Point } from '../types.js';
import { rectsOverlap, rectInside, rectInsidePolygon, footprintToRect } from '../types.js';

/**
 * Expand rooms to fill gaps where possible.
 * Returns true if any rooms were expanded.
 */
export function fillGaps(
  state: PlanState,
  intent: LayoutIntent,
  frame: LayoutFrame
): boolean {
  let changed = false;
  const rooms = Array.from(state.placed.values());
  const roomSpecMap = new Map(intent.rooms.map(r => [r.id, r]));
  const fp = frame.footprintRect;
  const fpPolygon = frame.isPolygonFootprint ? frame.footprintPolygon : null;

  // Try to expand each room in all four directions
  for (const room of rooms) {
    const spec = roomSpecMap.get(room.id);
    
    // Try expanding in each direction
    const directions: Array<'north' | 'south' | 'east' | 'west'> = ['north', 'south', 'east', 'west'];
    
    for (const dir of directions) {
      const expanded = tryExpand(room, dir, rooms, fp, spec, fpPolygon);
      if (expanded) {
        room.rect = expanded;
        changed = true;
      }
    }
  }

  return changed;
}

/**
 * Try to expand a room in a given direction.
 * Returns the new rect if expansion is possible, null otherwise.
 */
function tryExpand(
  room: PlacedRoom,
  direction: 'north' | 'south' | 'east' | 'west',
  allRooms: PlacedRoom[],
  footprint: Rect,
  spec?: RoomSpec,
  footprintPolygon?: Point[] | null
): Rect | null {
  const otherRooms = allRooms.filter(r => r.id !== room.id);
  const rect = room.rect;
  
  // Find how far we can expand in this direction
  let limit: number;
  let expandedRect: Rect;
  
  switch (direction) {
    case 'north':
      limit = footprint.y2;
      for (const other of otherRooms) {
        if (wouldOverlapIfExpanded(rect, other.rect, direction)) {
          limit = Math.min(limit, other.rect.y1);
        }
      }
      if (limit <= rect.y2 + 0.05) return null; // No room to expand
      
      // Check max height constraint
      if (spec?.maxHeight && (limit - rect.y1) > spec.maxHeight) {
        limit = rect.y1 + spec.maxHeight;
      }
      
      expandedRect = { ...rect, y2: limit };
      break;
      
    case 'south':
      limit = footprint.y1;
      for (const other of otherRooms) {
        if (wouldOverlapIfExpanded(rect, other.rect, direction)) {
          limit = Math.max(limit, other.rect.y2);
        }
      }
      if (limit >= rect.y1 - 0.05) return null;
      
      if (spec?.maxHeight && (rect.y2 - limit) > spec.maxHeight) {
        limit = rect.y2 - spec.maxHeight;
      }
      
      expandedRect = { ...rect, y1: limit };
      break;
      
    case 'east':
      limit = footprint.x2;
      for (const other of otherRooms) {
        if (wouldOverlapIfExpanded(rect, other.rect, direction)) {
          limit = Math.min(limit, other.rect.x1);
        }
      }
      if (limit <= rect.x2 + 0.05) return null;
      
      if (spec?.maxWidth && (limit - rect.x1) > spec.maxWidth) {
        limit = rect.x1 + spec.maxWidth;
      }
      
      expandedRect = { ...rect, x2: limit };
      break;
      
    case 'west':
      limit = footprint.x1;
      for (const other of otherRooms) {
        if (wouldOverlapIfExpanded(rect, other.rect, direction)) {
          limit = Math.max(limit, other.rect.x2);
        }
      }
      if (limit >= rect.x1 - 0.05) return null;
      
      if (spec?.maxWidth && (rect.x2 - limit) > spec.maxWidth) {
        limit = rect.x2 - spec.maxWidth;
      }
      
      expandedRect = { ...rect, x1: limit };
      break;
  }
  
  // For polygon footprints, check that expanded rect is still inside
  if (footprintPolygon && !rectInsidePolygon(expandedRect, footprintPolygon)) {
    return null;
  }
  
  return expandedRect;
}

/**
 * Check if expanding rect in the given direction would cause overlap with other.
 */
function wouldOverlapIfExpanded(
  rect: Rect,
  other: Rect,
  direction: 'north' | 'south' | 'east' | 'west'
): boolean {
  // Check if other is in the expansion path
  switch (direction) {
    case 'north':
      // Other must be above rect and horizontally overlapping
      return other.y1 >= rect.y2 - 0.01 && 
             other.x1 < rect.x2 - 0.01 && 
             other.x2 > rect.x1 + 0.01;
    case 'south':
      return other.y2 <= rect.y1 + 0.01 && 
             other.x1 < rect.x2 - 0.01 && 
             other.x2 > rect.x1 + 0.01;
    case 'east':
      return other.x1 >= rect.x2 - 0.01 && 
             other.y1 < rect.y2 - 0.01 && 
             other.y2 > rect.y1 + 0.01;
    case 'west':
      return other.x2 <= rect.x1 + 0.01 && 
             other.y1 < rect.y2 - 0.01 && 
             other.y2 > rect.y1 + 0.01;
  }
}

/**
 * Run multiple passes of gap filling until no more changes.
 */
export function fillGapsIterative(
  state: PlanState,
  intent: LayoutIntent,
  frame: LayoutFrame,
  maxPasses: number = 5
): number {
  let passes = 0;
  while (passes < maxPasses) {
    const changed = fillGaps(state, intent, frame);
    if (!changed) break;
    passes++;
  }
  return passes;
}

/**
 * Layout frame: computes bands (vertical slices) and depth zones (horizontal slices)
 * to create a grid of cells for room placement.
 */

import type { LayoutIntent, BandSpec, DepthSpec, ZoneId, EdgeDirection, Footprint } from '../intent/types.js';
import { footprintToRect, footprintToPolygon, rectOverlapsPolygon, snap, type Rect, type Point } from '../types.js';

/** A cell in the layout grid (intersection of band and depth) */
export interface LayoutCell {
  bandId: ZoneId;
  depthId: ZoneId;
  rect: Rect;
  /** Whether this cell is fully inside the footprint polygon (for non-rectangular footprints) */
  insideFootprint: boolean;
}

/** The layout frame with bands, depths, and cells */
export interface LayoutFrame {
  footprintRect: Rect;
  /** Original footprint as polygon points (for polygon-aware placement) */
  footprintPolygon: Point[];
  /** Whether the footprint is non-rectangular (polygon) */
  isPolygonFootprint: boolean;
  bands: ResolvedBand[];
  depths: ResolvedDepth[];
  cells: LayoutCell[];
  frontEdge: EdgeDirection;
  gardenEdge?: EdgeDirection;
}

export interface ResolvedBand {
  id: ZoneId;
  x1: number;
  x2: number;
  width: number;
}

export interface ResolvedDepth {
  id: ZoneId;
  y1: number;
  y2: number;
  depth: number;
}

/**
 * Build a layout frame from the intent.
 * If bands/depths are not specified, derive them from room preferences.
 */
export function buildLayoutFrame(intent: LayoutIntent): LayoutFrame {
  const footprintRect = footprintToRect(intent.footprint);
  const footprintPolygon = footprintToPolygon(intent.footprint);
  const isPolygonFootprint = intent.footprint.kind === 'polygon';
  const totalWidth = footprintRect.x2 - footprintRect.x1;
  const totalHeight = footprintRect.y2 - footprintRect.y1;

  // Resolve bands (vertical slices, left to right)
  const bands = resolveBands(intent.bands, totalWidth, footprintRect.x1, intent);

  // Resolve depths (horizontal slices)
  // Depth direction depends on frontEdge
  const depths = resolveDepths(intent.depths, totalHeight, footprintRect.y1, intent);

  // Build cells (band × depth intersections)
  // For polygon footprints, mark cells that are outside the polygon
  const cells: LayoutCell[] = [];
  for (const band of bands) {
    for (const depth of depths) {
      const rect = {
        x1: band.x1,
        y1: depth.y1,
        x2: band.x2,
        y2: depth.y2,
      };
      
      // Check if cell overlaps with the footprint polygon
      const insideFootprint = isPolygonFootprint 
        ? rectOverlapsPolygon(rect, footprintPolygon)
        : true; // Rectangular footprints: all cells are inside
      
      cells.push({
        bandId: band.id,
        depthId: depth.id,
        rect,
        insideFootprint,
      });
    }
  }

  return {
    footprintRect,
    footprintPolygon,
    isPolygonFootprint,
    bands,
    depths,
    cells,
    frontEdge: intent.frontEdge,
    gardenEdge: intent.gardenEdge,
  };
}

function resolveBands(
  specs: BandSpec[] | undefined,
  totalWidth: number,
  startX: number,
  intent: LayoutIntent
): ResolvedBand[] {
  if (!specs || specs.length === 0) {
    // Derive bands from room preferences
    return deriveBandsFromRooms(totalWidth, startX, intent);
  }

  // Use specified bands
  return distributeBands(specs, totalWidth, startX);
}

function deriveBandsFromRooms(totalWidth: number, startX: number, intent: LayoutIntent): ResolvedBand[] {
  // Check if any rooms prefer left/right placement
  const hasLeftPreference = intent.rooms.some(r => r.preferredBands?.includes('left'));
  const hasRightPreference = intent.rooms.some(r => r.preferredBands?.includes('right'));
  const hasCenterPreference = intent.rooms.some(r => r.preferredBands?.includes('center'));

  if (hasLeftPreference && hasRightPreference) {
    // Two-band layout
    const leftWidth = snap(totalWidth * 0.4);
    const rightWidth = snap(totalWidth - leftWidth);
    return [
      { id: 'left', x1: startX, x2: snap(startX + leftWidth), width: leftWidth },
      { id: 'right', x1: snap(startX + leftWidth), x2: snap(startX + totalWidth), width: rightWidth },
    ];
  }

  if (hasCenterPreference) {
    // Three-band layout
    const sideWidth = snap(totalWidth * 0.3);
    const centerWidth = snap(totalWidth - 2 * sideWidth);
    return [
      { id: 'left', x1: startX, x2: snap(startX + sideWidth), width: sideWidth },
      { id: 'center', x1: snap(startX + sideWidth), x2: snap(startX + sideWidth + centerWidth), width: centerWidth },
      { id: 'right', x1: snap(startX + sideWidth + centerWidth), x2: snap(startX + totalWidth), width: sideWidth },
    ];
  }

  // Default: single band spanning full width
  return [{ id: 'full', x1: startX, x2: snap(startX + totalWidth), width: totalWidth }];
}

function distributeBands(specs: BandSpec[], totalWidth: number, startX: number): ResolvedBand[] {
  // Calculate total target width and distribute proportionally
  let totalTarget = 0;
  const hasTarget = specs.filter(s => s.targetWidth !== undefined);

  if (hasTarget.length === specs.length) {
    // All have targets, use them as weights
    totalTarget = specs.reduce((sum, s) => sum + (s.targetWidth ?? 0), 0);
  } else {
    // Distribute equally for those without targets
    totalTarget = totalWidth;
  }

  const bands: ResolvedBand[] = [];
  let currentX = startX;

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    let width: number;

    if (spec.targetWidth !== undefined && totalTarget > 0) {
      width = snap((spec.targetWidth / totalTarget) * totalWidth);
    } else {
      // Equal distribution for specs without target
      const remaining = specs.length - hasTarget.length;
      const remainingWidth = totalWidth - hasTarget.reduce((sum, s) => sum + (s.targetWidth ?? 0), 0);
      width = snap(remainingWidth / remaining);
    }

    // Apply min/max constraints
    if (spec.minWidth !== undefined) width = Math.max(width, spec.minWidth);
    if (spec.maxWidth !== undefined) width = Math.min(width, spec.maxWidth);

    // Last band takes remaining space
    if (i === specs.length - 1) {
      width = snap(startX + totalWidth - currentX);
    }

    bands.push({
      id: spec.id,
      x1: currentX,
      x2: snap(currentX + width),
      width,
    });
    currentX = snap(currentX + width);
  }

  return bands;
}

function resolveDepths(
  specs: DepthSpec[] | undefined,
  totalHeight: number,
  startY: number,
  intent: LayoutIntent
): ResolvedDepth[] {
  if (!specs || specs.length === 0) {
    return deriveDepthsFromRooms(totalHeight, startY, intent);
  }

  return distributeDepths(specs, totalHeight, startY, intent.frontEdge);
}

function deriveDepthsFromRooms(totalHeight: number, startY: number, intent: LayoutIntent): ResolvedDepth[] {
  const hasFront = intent.rooms.some(r => r.preferredDepths?.includes('front'));
  const hasBack = intent.rooms.some(r => r.preferredDepths?.includes('back'));
  const hasMiddle = intent.rooms.some(r => r.preferredDepths?.includes('middle'));

  // Determine order based on front edge
  // If front is south, front zone is at low Y, back at high Y
  // If front is north, front zone is at high Y, back at low Y
  const frontFirst = intent.frontEdge === 'south' || intent.frontEdge === 'west';

  if (hasFront && hasBack && hasMiddle) {
    // Three-depth layout
    const frontDepth = snap(totalHeight * 0.33);
    const middleDepth = snap(totalHeight * 0.34);
    const backDepth = snap(totalHeight - frontDepth - middleDepth);

    const zones = frontFirst
      ? [
          { id: 'front', depth: frontDepth },
          { id: 'middle', depth: middleDepth },
          { id: 'back', depth: backDepth },
        ]
      : [
          { id: 'back', depth: backDepth },
          { id: 'middle', depth: middleDepth },
          { id: 'front', depth: frontDepth },
        ];

    return buildDepthsFromZones(zones, startY);
  }

  if (hasFront && hasBack) {
    // Two-depth layout
    const frontDepth = snap(totalHeight * 0.45);
    const backDepth = snap(totalHeight - frontDepth);

    const zones = frontFirst
      ? [
          { id: 'front', depth: frontDepth },
          { id: 'back', depth: backDepth },
        ]
      : [
          { id: 'back', depth: backDepth },
          { id: 'front', depth: frontDepth },
        ];

    return buildDepthsFromZones(zones, startY);
  }

  // Default: single depth
  return [{ id: 'full', y1: startY, y2: snap(startY + totalHeight), depth: totalHeight }];
}

function buildDepthsFromZones(zones: { id: string; depth: number }[], startY: number): ResolvedDepth[] {
  const depths: ResolvedDepth[] = [];
  let currentY = startY;

  for (const zone of zones) {
    depths.push({
      id: zone.id,
      y1: currentY,
      y2: snap(currentY + zone.depth),
      depth: zone.depth,
    });
    currentY = snap(currentY + zone.depth);
  }

  return depths;
}

function distributeDepths(
  specs: DepthSpec[],
  totalHeight: number,
  startY: number,
  frontEdge: EdgeDirection
): ResolvedDepth[] {
  // Order specs based on front edge
  const frontFirst = frontEdge === 'south' || frontEdge === 'west';
  const orderedSpecs = frontFirst ? [...specs] : [...specs].reverse();

  let totalTarget = 0;
  const hasTarget = orderedSpecs.filter(s => s.targetDepth !== undefined);

  if (hasTarget.length === orderedSpecs.length) {
    totalTarget = orderedSpecs.reduce((sum, s) => sum + (s.targetDepth ?? 0), 0);
  } else {
    totalTarget = totalHeight;
  }

  const depths: ResolvedDepth[] = [];
  let currentY = startY;

  for (let i = 0; i < orderedSpecs.length; i++) {
    const spec = orderedSpecs[i];
    let depth: number;

    if (spec.targetDepth !== undefined && totalTarget > 0) {
      depth = snap((spec.targetDepth / totalTarget) * totalHeight);
    } else {
      const remaining = orderedSpecs.length - hasTarget.length;
      const remainingHeight = totalHeight - hasTarget.reduce((sum, s) => sum + (s.targetDepth ?? 0), 0);
      depth = snap(remainingHeight / remaining);
    }

    if (spec.minDepth !== undefined) depth = Math.max(depth, spec.minDepth);
    if (spec.maxDepth !== undefined) depth = Math.min(depth, spec.maxDepth);

    if (i === orderedSpecs.length - 1) {
      depth = snap(startY + totalHeight - currentY);
    }

    depths.push({
      id: spec.id,
      y1: currentY,
      y2: snap(currentY + depth),
      depth,
    });
    currentY = snap(currentY + depth);
  }

  return depths;
}

/** Find a cell by band and depth IDs */
export function findCell(frame: LayoutFrame, bandId: ZoneId, depthId: ZoneId): LayoutCell | undefined {
  return frame.cells.find(c => c.bandId === bandId && c.depthId === depthId);
}

/** Find all cells that match any of the given band/depth preferences */
export function findPreferredCells(
  frame: LayoutFrame,
  preferredBands?: ZoneId[],
  preferredDepths?: ZoneId[]
): LayoutCell[] {
  return frame.cells.filter(c => {
    // Skip cells that are entirely outside the polygon footprint
    if (!c.insideFootprint) return false;
    
    const bandMatch = !preferredBands || preferredBands.length === 0 || preferredBands.includes(c.bandId);
    const depthMatch = !preferredDepths || preferredDepths.length === 0 || preferredDepths.includes(c.depthId);
    return bandMatch && depthMatch;
  });
}

/** Get all cells that are inside the footprint */
export function getValidCells(frame: LayoutFrame): LayoutCell[] {
  return frame.cells.filter(c => c.insideFootprint);
}

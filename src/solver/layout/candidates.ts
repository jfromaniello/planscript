/**
 * Candidate generation for room placement.
 * Generates possible rectangles for a room within a cell or set of cells.
 */

import type { RoomSpec } from '../intent/types.js';
import type { LayoutCell, LayoutFrame } from './frame.js';
import {
  type Rect,
  type PlacedRoom,
  snap,
  rectWidth,
  rectHeight,
  rectsOverlap,
  rectsAdjacent,
  sharedEdgeLength,
  touchesEdge,
  touchesExterior,
  GRID_SNAP,
} from '../types.js';

/** A candidate placement for a room */
export interface Candidate {
  rect: Rect;
  cell: LayoutCell;
  score: number; // preliminary score for ordering
}

/** Options for candidate generation */
export interface CandidateOptions {
  /** Already placed rooms to avoid overlap and align with */
  placedRooms: PlacedRoom[];
  /** Rooms that this room should be adjacent to */
  adjacentRoomIds?: string[];
  /** Size variations to try (e.g., [1.0, 0.9, 1.1] for 100%, 90%, 110% of target) */
  sizeVariations?: number[];
  /** Position step for scanning (defaults to GRID_SNAP * 2) */
  positionStep?: number;
  /** Area to reserve in the cell for attached rooms (ensuite, closet) */
  reservedArea?: number;
}

/**
 * Generate candidate placements for a room within preferred cells.
 */
export function generateCandidates(
  room: RoomSpec,
  cells: LayoutCell[],
  frame: LayoutFrame,
  options: CandidateOptions
): Candidate[] {
  const candidates: Candidate[] = [];
  const { placedRooms, adjacentRoomIds = [], sizeVariations = [1.0, 0.95, 1.05], reservedArea = 0 } = options;
  const positionStep = options.positionStep ?? GRID_SNAP * 4; // 0.2m steps

  // Find rooms we want to be adjacent to
  const adjacentRooms = placedRooms.filter(p => adjacentRoomIds.includes(p.id));

  for (const cell of cells) {
    const cellWidth = rectWidth(cell.rect);
    const cellHeight = rectHeight(cell.rect);

    // Generate size variations
    // Account for reserved area (ensuite/closet that will be placed adjacent)
    const sizes = generateSizes(room, cellWidth, cellHeight, sizeVariations, reservedArea);

    for (const { width, height } of sizes) {
      // Generate positions within the cell
      const positions = generatePositions(cell.rect, width, height, positionStep, frame, room, adjacentRooms, placedRooms);

      for (const { x, y, bonusScore } of positions) {
        const rect: Rect = {
          x1: snap(x),
          y1: snap(y),
          x2: snap(x + width),
          y2: snap(y + height),
        };

        // Skip if overlaps with placed rooms
        if (placedRooms.some(p => rectsOverlap(rect, p.rect))) {
          continue;
        }

        // Skip if outside cell bounds
        // Exception: allow positions that extend slightly outside cell if they're adjacent to required rooms
        const cellTolerance = 0.001;
        const isAdjacentPosition = bonusScore >= 15; // High bonus indicates adjacency position
        const extendedTolerance = isAdjacentPosition ? 1.0 : cellTolerance; // Allow 1m extension for adjacency
        
        if (rect.x1 < cell.rect.x1 - extendedTolerance || rect.x2 > cell.rect.x2 + extendedTolerance) continue;
        if (rect.y1 < cell.rect.y1 - extendedTolerance || rect.y2 > cell.rect.y2 + extendedTolerance) continue;

        // Calculate preliminary score
        const score = calculatePreliminaryScore(rect, room, cell, frame, adjacentRooms, bonusScore);

        candidates.push({ rect, cell, score });
      }
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Deduplicate very similar candidates
  return deduplicateCandidates(candidates);
}

interface SizeOption {
  width: number;
  height: number;
}

function generateSizes(
  room: RoomSpec,
  cellWidth: number,
  cellHeight: number,
  variations: number[],
  reservedArea: number = 0
): SizeOption[] {
  const sizes: SizeOption[] = [];
  
  // Calculate available area (cell area minus reserved for attached rooms)
  const cellArea = cellWidth * cellHeight;
  const availableArea = cellArea - reservedArea;
  
  // If fillCell mode, prioritize full cell size
  if (room.fillCell) {
    let width = cellWidth;
    let height = cellHeight;
    
    // Apply max constraints
    if (room.maxWidth && width > room.maxWidth) width = room.maxWidth;
    if (room.maxHeight && height > room.maxHeight) height = room.maxHeight;
    
    // Check min area
    if (width * height >= room.minArea) {
      sizes.push({ width: snap(width), height: snap(height) });
    }
    
    // Also try some smaller variations in case full cell doesn't work
    if (width * 0.9 * height >= room.minArea) {
      sizes.push({ width: snap(width * 0.9), height: snap(height) });
    }
    if (width * height * 0.9 >= room.minArea) {
      sizes.push({ width: snap(width), height: snap(height * 0.9) });
    }
    
    return sizes;
  }
  
  // Calculate target area, capped by available space if we need to reserve for attached rooms
  let targetArea = room.targetArea ?? room.minArea * 1.1;
  if (reservedArea > 0) {
    // Leave room for attached rooms - ensure we have a usable rectangle
    // Attached rooms need at least 2.5m on one dimension to be practical (for bathroom)
    const minAttachedDimension = 2.5;
    
    // Calculate max dimensions that leave space for attached room
    // We need to leave space on EITHER width OR height side
    const maxWidthKeepingSpace = cellWidth - minAttachedDimension;
    const maxHeightKeepingSpace = cellHeight - minAttachedDimension;
    
    // Pick the dimension constraint that still gives us enough area for the main room
    // Prefer the one that leaves the most room for the main room while still fitting attached
    const areaIfWidthConstrained = maxWidthKeepingSpace * Math.min(cellHeight, maxHeightKeepingSpace + 2);
    const areaIfHeightConstrained = Math.min(cellWidth, maxWidthKeepingSpace + 2) * maxHeightKeepingSpace;
    
    // Use the better option (larger area for main room)
    const maxArea = Math.max(areaIfWidthConstrained, areaIfHeightConstrained);
    
    // Cap target area, but ensure we stay above minArea
    if (targetArea >= maxArea) {
      targetArea = Math.max(room.minArea, maxArea * 0.95); // 5% reduction for safety
    }
  }

  // Calculate base dimensions from area
  // Try to maintain aspect ratio constraints
  const aspectMin = room.aspect?.min ?? 0.5;
  const aspectMax = room.aspect?.max ?? 2.0;

  for (const scale of variations) {
    const area = targetArea * scale;
    if (area < room.minArea * 0.95) continue; // Don't go below min area

    // Try different aspect ratios (limited set for performance)
    for (const aspect of [1.0, 0.75, 1.33]) {
      if (aspect < aspectMin || aspect > aspectMax) continue;

      // width/height = aspect, width * height = area
      // width = sqrt(area * aspect), height = sqrt(area / aspect)
      let width = snap(Math.sqrt(area * aspect));
      let height = snap(Math.sqrt(area / aspect));

      // Apply min/max constraints
      if (room.minWidth && width < room.minWidth) {
        width = room.minWidth;
        height = snap(area / width);
      }
      if (room.minHeight && height < room.minHeight) {
        height = room.minHeight;
        width = snap(area / height);
      }
      if (room.maxWidth && width > room.maxWidth) {
        width = room.maxWidth;
        height = snap(area / width);
      }
      if (room.maxHeight && height > room.maxHeight) {
        height = room.maxHeight;
        width = snap(area / height);
      }

      // Must fit in cell
      if (width > cellWidth || height > cellHeight) {
        // Try to fit by shrinking
        if (width > cellWidth) {
          width = cellWidth;
          height = snap(Math.max(room.minArea / width, height));
        }
        if (height > cellHeight) {
          height = cellHeight;
          width = snap(Math.max(room.minArea / height, width));
        }
      }

      // Final check
      if (width <= cellWidth && height <= cellHeight && width * height >= room.minArea * 0.95) {
        // Avoid duplicate sizes
        if (!sizes.some(s => Math.abs(s.width - width) < 0.1 && Math.abs(s.height - height) < 0.1)) {
          sizes.push({ width, height });
        }
      }
    }

    // Also try swapped (rotated) dimensions
    for (const { width: w, height: h } of [...sizes]) {
      if (w !== h && h <= cellWidth && w <= cellHeight) {
        if (!sizes.some(s => Math.abs(s.width - h) < 0.1 && Math.abs(s.height - w) < 0.1)) {
          sizes.push({ width: h, height: w });
        }
      }
    }
  }

  return sizes;
}

interface PositionOption {
  x: number;
  y: number;
  bonusScore: number;
}

/**
 * Add positions adjacent to a given room rect.
 */
function addAdjacentPositions(
  positions: PositionOption[],
  adjRect: Rect,
  cellRect: Rect,
  width: number,
  height: number,
  bonusScore: number
): void {
  // East of adjacent room
  if (adjRect.x2 >= cellRect.x1 && adjRect.x2 <= cellRect.x2 - width + 0.01) {
    const overlapY1 = Math.max(adjRect.y1, cellRect.y1);
    const overlapY2 = Math.min(adjRect.y2, cellRect.y2);
    if (overlapY2 - overlapY1 >= height - 0.01) {
      positions.push({ x: adjRect.x2, y: overlapY1, bonusScore });
      positions.push({ x: adjRect.x2, y: overlapY2 - height, bonusScore });
    }
  }
  // West of adjacent room
  if (adjRect.x1 >= cellRect.x1 + width - 0.01 && adjRect.x1 <= cellRect.x2) {
    const overlapY1 = Math.max(adjRect.y1, cellRect.y1);
    const overlapY2 = Math.min(adjRect.y2, cellRect.y2);
    if (overlapY2 - overlapY1 >= height - 0.01) {
      positions.push({ x: adjRect.x1 - width, y: overlapY1, bonusScore });
      positions.push({ x: adjRect.x1 - width, y: overlapY2 - height, bonusScore });
    }
  }
  // North of adjacent room
  if (adjRect.y2 >= cellRect.y1 && adjRect.y2 <= cellRect.y2 - height + 0.01) {
    const overlapX1 = Math.max(adjRect.x1, cellRect.x1);
    const overlapX2 = Math.min(adjRect.x2, cellRect.x2);
    if (overlapX2 - overlapX1 >= width - 0.01) {
      positions.push({ x: overlapX1, y: adjRect.y2, bonusScore });
      positions.push({ x: overlapX2 - width, y: adjRect.y2, bonusScore });
    }
  }
  // South of adjacent room
  if (adjRect.y1 >= cellRect.y1 + height - 0.01 && adjRect.y1 <= cellRect.y2) {
    const overlapX1 = Math.max(adjRect.x1, cellRect.x1);
    const overlapX2 = Math.min(adjRect.x2, cellRect.x2);
    if (overlapX2 - overlapX1 >= width - 0.01) {
      positions.push({ x: overlapX1, y: adjRect.y1 - height, bonusScore });
      positions.push({ x: overlapX2 - width, y: adjRect.y1 - height, bonusScore });
    }
  }
}

function generatePositions(
  cellRect: Rect,
  width: number,
  height: number,
  step: number,
  frame: LayoutFrame,
  room: RoomSpec,
  adjacentRooms: PlacedRoom[],
  allPlacedRooms: PlacedRoom[] = []
): PositionOption[] {
  const positions: PositionOption[] = [];
  const fp = frame.footprintRect;

  // Strategic positions first (corners, edges, adjacent to other rooms)
  const strategicPositions: PositionOption[] = [];

  // Cell corners - prioritize positions that extend to cell edges
  // This helps rooms in adjacent bands/depths touch at boundaries
  strategicPositions.push(
    { x: cellRect.x1, y: cellRect.y1, bonusScore: 2 },
    { x: cellRect.x2 - width, y: cellRect.y1, bonusScore: 2 },
    { x: cellRect.x1, y: cellRect.y2 - height, bonusScore: 2 },
    { x: cellRect.x2 - width, y: cellRect.y2 - height, bonusScore: 2 }
  );

  // Positions that extend to both band boundaries (full width of cell)
  // These are ideal for ensuring rooms touch at band edges
  if (width >= cellRect.x2 - cellRect.x1 - 0.1) {
    // Room is nearly full-width, place at cell boundaries
    strategicPositions.push(
      { x: cellRect.x1, y: cellRect.y1, bonusScore: 5 },
      { x: cellRect.x1, y: cellRect.y2 - height, bonusScore: 5 }
    );
  }

  // Positions that touch exterior edges (if room needs exterior)
  if (room.mustTouchExterior) {
    // Along south edge
    if (Math.abs(cellRect.y1 - fp.y1) < 0.01) {
      for (let x = cellRect.x1; x <= cellRect.x2 - width; x += step) {
        strategicPositions.push({ x: snap(x), y: cellRect.y1, bonusScore: 5 });
      }
    }
    // Along north edge
    if (Math.abs(cellRect.y2 - fp.y2) < 0.01) {
      for (let x = cellRect.x1; x <= cellRect.x2 - width; x += step) {
        strategicPositions.push({ x: snap(x), y: cellRect.y2 - height, bonusScore: 5 });
      }
    }
    // Along west edge
    if (Math.abs(cellRect.x1 - fp.x1) < 0.01) {
      for (let y = cellRect.y1; y <= cellRect.y2 - height; y += step) {
        strategicPositions.push({ x: cellRect.x1, y: snap(y), bonusScore: 5 });
      }
    }
    // Along east edge
    if (Math.abs(cellRect.x2 - fp.x2) < 0.01) {
      for (let y = cellRect.y1; y <= cellRect.y2 - height; y += step) {
        strategicPositions.push({ x: cellRect.x2 - width, y: snap(y), bonusScore: 5 });
      }
    }
  }

  // Positions adjacent to required rooms (very high bonus - this is critical)
  // For required adjacent rooms, extend cell bounds slightly to allow positions
  // that are adjacent to rooms in neighboring cells
  for (const adj of adjacentRooms) {
    // Create expanded bounds to find positions adjacent to rooms outside this cell
    const expandedBounds = {
      x1: Math.min(cellRect.x1, adj.rect.x2 - 0.1), // Extend west if adj is there
      y1: Math.min(cellRect.y1, adj.rect.y2 - 0.1), // Extend south if adj is there  
      x2: Math.max(cellRect.x2, adj.rect.x1 + width + 0.1), // Extend east if adj is there
      y2: Math.max(cellRect.y2, adj.rect.y1 + height + 0.1), // Extend north if adj is there
    };
    addAdjacentPositions(strategicPositions, adj.rect, expandedBounds, width, height, 20);
  }

  // Positions adjacent to ANY placed room (smaller bonus to avoid gaps)
  // This ensures rooms pack together without leaving gaps
  for (const placed of allPlacedRooms) {
    // Skip if already in adjacentRooms
    if (adjacentRooms.some(a => a.id === placed.id)) continue;
    addAdjacentPositions(strategicPositions, placed.rect, cellRect, width, height, 3);
  }

  positions.push(...strategicPositions);

  // Skip grid scan - strategic positions are usually sufficient
  // This greatly improves performance for larger plans

  return positions;
}

function calculatePreliminaryScore(
  rect: Rect,
  room: RoomSpec,
  cell: LayoutCell,
  frame: LayoutFrame,
  adjacentRooms: PlacedRoom[],
  bonusScore: number
): number {
  let score = bonusScore;
  const fp = frame.footprintRect;

  // Prefer corners (less wasted space, easier to pack)
  const isCorner =
    (Math.abs(rect.x1 - cell.rect.x1) < 0.01 || Math.abs(rect.x2 - cell.rect.x2) < 0.01) &&
    (Math.abs(rect.y1 - cell.rect.y1) < 0.01 || Math.abs(rect.y2 - cell.rect.y2) < 0.01);
  if (isCorner) score += 3;

  // Prefer edge alignment with cell - especially internal boundaries where bands/depths meet
  // This ensures rooms touch at band boundaries
  const touchesCellLeft = Math.abs(rect.x1 - cell.rect.x1) < 0.01;
  const touchesCellRight = Math.abs(rect.x2 - cell.rect.x2) < 0.01;
  const touchesCellBottom = Math.abs(rect.y1 - cell.rect.y1) < 0.01;
  const touchesCellTop = Math.abs(rect.y2 - cell.rect.y2) < 0.01;
  
  // Internal band/depth edges (not on footprint boundary) get higher bonus
  // This ensures rooms extend to shared band boundaries for connectivity
  const leftIsInternal = Math.abs(cell.rect.x1 - fp.x1) > 0.01;
  const rightIsInternal = Math.abs(cell.rect.x2 - fp.x2) > 0.01;
  const bottomIsInternal = Math.abs(cell.rect.y1 - fp.y1) > 0.01;
  const topIsInternal = Math.abs(cell.rect.y2 - fp.y2) > 0.01;

  if (touchesCellLeft) score += leftIsInternal ? 4 : 1;
  if (touchesCellRight) score += rightIsInternal ? 4 : 1;
  if (touchesCellBottom) score += bottomIsInternal ? 4 : 1;
  if (touchesCellTop) score += topIsInternal ? 4 : 1;

  // Exterior touch bonus
  if (room.mustTouchExterior && touchesExterior(rect, fp)) {
    score += 5;
  }

  // Specific edge touch bonus
  if (room.mustTouchEdge && touchesEdge(rect, fp, room.mustTouchEdge)) {
    score += 8;
  }

  // Garden edge bonus
  if (frame.gardenEdge && room.mustTouchEdge === frame.gardenEdge) {
    if (touchesEdge(rect, fp, frame.gardenEdge)) {
      score += 5;
    }
  }

  // Adjacency bonus - this is crucial for correct layouts
  // Must be high enough to override zone/edge preferences
  // Also reward longer shared edges (needed for door placement)
  const MIN_DOOR_WIDTH = 1.0; // Door + clearance
  for (const adj of adjacentRooms) {
    if (rectsAdjacent(rect, adj.rect)) {
      const sharedLen = sharedEdgeLength(rect, adj.rect);
      if (sharedLen >= MIN_DOOR_WIDTH) {
        // Good adjacency - shared edge long enough for a door
        score += 25 + Math.min(sharedLen * 2, 10); // Bonus for longer shared edges
      } else {
        // Adjacent but shared edge too short for door - this is BAD
        // Penalize heavily since we need doors between adjacent rooms
        score -= 15;
      }
    }
  }
  
  // Extra penalty if room has required adjacencies but isn't adjacent to any of them
  if (adjacentRooms.length > 0) {
    let hasGoodAdjacency = false;
    for (const adj of adjacentRooms) {
      if (rectsAdjacent(rect, adj.rect)) {
        const sharedLen = sharedEdgeLength(rect, adj.rect);
        if (sharedLen >= MIN_DOOR_WIDTH) {
          hasGoodAdjacency = true;
          break;
        }
      }
    }
    if (!hasGoodAdjacency) {
      // No good adjacency found - heavy penalty
      score -= 30;
    }
  }

  // Area closer to target is better
  const area = rectWidth(rect) * rectHeight(rect);
  const targetArea = room.targetArea ?? room.minArea * 1.1;
  const areaDiff = Math.abs(area - targetArea) / targetArea;
  score -= areaDiff * 5; // Penalty for area deviation

  // Aspect ratio closer to 1 is better (for most rooms)
  const aspect = rectWidth(rect) / rectHeight(rect);
  if (aspect < 0.6 || aspect > 1.67) {
    score -= 2; // Penalty for very elongated rooms
  }

  return score;
}

function deduplicateCandidates(candidates: Candidate[]): Candidate[] {
  const unique: Candidate[] = [];

  for (const c of candidates) {
    const isDuplicate = unique.some(
      u =>
        Math.abs(u.rect.x1 - c.rect.x1) < 0.05 &&
        Math.abs(u.rect.y1 - c.rect.y1) < 0.05 &&
        Math.abs(u.rect.x2 - c.rect.x2) < 0.05 &&
        Math.abs(u.rect.y2 - c.rect.y2) < 0.05
    );
    if (!isDuplicate) {
      unique.push(c);
    }
  }

  return unique;
}

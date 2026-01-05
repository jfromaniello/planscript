import type { Point } from '../ast/types.js';
import type { GeometryIR, Polygon, WallSegment, OpeningPlacement, ResolvedRoom } from '../geometry/types.js';

// ============================================================================
// SVG Export Options
// ============================================================================

export interface SVGExportOptions {
  width?: number;
  height?: number;
  padding?: number;
  scale?: number;
  showLabels?: boolean;
  showDimensions?: boolean;
  showFootprintDimensions?: boolean;
  backgroundColor?: string;
  wallColor?: string;
  wallWidth?: number;
  roomFillColor?: string;
  roomStrokeColor?: string;
  roomStrokeWidth?: number;
  doorColor?: string;
  windowColor?: string;
  footprintColor?: string;
  labelFontSize?: number;
  labelColor?: string;
  dimensionColor?: string;
  dimensionFontSize?: number;
  dimensionOffset?: number;
  dimensionStaggerStep?: number;
}

const defaultOptions: Required<SVGExportOptions> = {
  width: 1000,
  height: 800,
  padding: 60,
  scale: 1,
  showLabels: true,
  showDimensions: false,
  showFootprintDimensions: true,
  backgroundColor: '#ffffff',
  wallColor: '#2c3e50',
  wallWidth: 3,
  roomFillColor: '#ecf0f1',
  roomStrokeColor: '#bdc3c7',
  roomStrokeWidth: 1,
  doorColor: '#e74c3c',
  windowColor: '#3498db',
  footprintColor: '#7f8c8d',
  labelFontSize: 14,
  labelColor: '#2c3e50',
  dimensionColor: '#666666',
  dimensionFontSize: 10,
  dimensionOffset: 20,
  dimensionStaggerStep: 15,
};

// ============================================================================
// Coordinate Transform
// ============================================================================

interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
  height: number; // For Y-flip
}

function createTransform(geometry: GeometryIR, opts: Required<SVGExportOptions>): Transform {
  // Calculate bounds
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of geometry.footprint.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;

  // Calculate effective padding - need extra space for dimensions
  // Estimate: base padding + dimension offset + potential stagger levels + text
  const dimensionSpace = opts.showDimensions 
    ? opts.dimensionOffset + opts.dimensionStaggerStep * 4 + 30 // room for footprint dims + text
    : 0;
  const effectivePadding = opts.padding + dimensionSpace;

  // Calculate scale to fit content in SVG with padding
  const availableWidth = opts.width - effectivePadding * 2;
  const availableHeight = opts.height - effectivePadding * 2;
  const scaleX = availableWidth / contentWidth;
  const scaleY = availableHeight / contentHeight;
  const scale = Math.min(scaleX, scaleY) * opts.scale;

  // Center the content
  const scaledWidth = contentWidth * scale;
  const scaledHeight = contentHeight * scale;
  const offsetX = effectivePadding + (availableWidth - scaledWidth) / 2 - minX * scale;
  const offsetY = effectivePadding + (availableHeight - scaledHeight) / 2 - minY * scale;

  return { scale, offsetX, offsetY, height: opts.height };
}

function transformPoint(p: Point, t: Transform): Point {
  return {
    x: p.x * t.scale + t.offsetX,
    y: t.height - (p.y * t.scale + t.offsetY), // Flip Y
  };
}

function transformPolygon(points: Point[], t: Transform): Point[] {
  return points.map((p) => transformPoint(p, t));
}

// ============================================================================
// SVG Helpers
// ============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function pointsToPath(points: Point[]): string {
  if (points.length === 0) return '';
  const commands = points.map((p, i) => (i === 0 ? `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}` : `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`));
  commands.push('Z');
  return commands.join(' ');
}

function calculatePolygonCenter(points: Point[]): Point {
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return { x, y };
}

/**
 * Test if a point is inside a polygon using ray casting algorithm.
 */
function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  const { x, y } = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Calculate the distance from a point to a line segment.
 */
function pointToSegmentDistance(point: Point, p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lengthSquared = dx * dx + dy * dy;
  
  if (lengthSquared === 0) {
    // Segment is a point
    return Math.sqrt((point.x - p1.x) ** 2 + (point.y - p1.y) ** 2);
  }
  
  // Project point onto line, clamped to segment
  let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  
  const projX = p1.x + t * dx;
  const projY = p1.y + t * dy;
  
  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

/**
 * Calculate minimum distance from a point to the polygon boundary.
 */
function pointToPolygonDistance(point: Point, polygon: Point[]): number {
  let minDist = Infinity;
  
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const dist = pointToSegmentDistance(point, p1, p2);
    minDist = Math.min(minDist, dist);
  }
  
  return minDist;
}

/**
 * Find the visual center of a polygon using a "pole of inaccessibility" algorithm.
 * This finds the point inside the polygon that is furthest from any edge.
 * Uses an iterative grid-based approach for better accuracy.
 */
function findVisualCenter(points: Point[]): Point {
  // Calculate bounding box
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  // Start with centroid as fallback
  const centroid = calculatePolygonCenter(points);
  
  // If centroid is inside, use iterative refinement
  // Otherwise, find a point inside first
  let bestPoint = centroid;
  let bestDistance = isPointInPolygon(centroid, points) 
    ? pointToPolygonDistance(centroid, points) 
    : -Infinity;
  
  // Initial grid search
  const gridSize = 10;
  const cellWidth = width / gridSize;
  const cellHeight = height / gridSize;
  
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const testPoint = {
        x: minX + i * cellWidth,
        y: minY + j * cellHeight
      };
      
      if (isPointInPolygon(testPoint, points)) {
        const dist = pointToPolygonDistance(testPoint, points);
        if (dist > bestDistance) {
          bestDistance = dist;
          bestPoint = testPoint;
        }
      }
    }
  }
  
  // Refinement: search around best point with smaller grid
  const refineRadius = Math.max(cellWidth, cellHeight);
  const refineSteps = 5;
  
  for (let iteration = 0; iteration < 3; iteration++) {
    const searchRadius = refineRadius / Math.pow(2, iteration);
    const step = searchRadius / refineSteps;
    
    for (let dx = -refineSteps; dx <= refineSteps; dx++) {
      for (let dy = -refineSteps; dy <= refineSteps; dy++) {
        const testPoint = {
          x: bestPoint.x + dx * step,
          y: bestPoint.y + dy * step
        };
        
        if (isPointInPolygon(testPoint, points)) {
          const dist = pointToPolygonDistance(testPoint, points);
          if (dist > bestDistance) {
            bestDistance = dist;
            bestPoint = testPoint;
          }
        }
      }
    }
  }
  
  return bestPoint;
}

/**
 * Get the best label position for a polygon.
 * Uses centroid for convex polygons, visual center for concave ones.
 */
function getLabelPosition(points: Point[]): Point {
  const centroid = calculatePolygonCenter(points);
  
  // If centroid is inside the polygon, it's good enough for most cases
  if (isPointInPolygon(centroid, points)) {
    return centroid;
  }
  
  // For concave polygons where centroid is outside, find the visual center
  return findVisualCenter(points);
}

function calculatePolygonBounds(points: Point[]): { width: number; height: number } {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

// ============================================================================
// SVG Element Generation
// ============================================================================

function generateFootprintSVG(footprint: Polygon, t: Transform, opts: Required<SVGExportOptions>): string {
  const points = transformPolygon(footprint.points, t);
  const path = pointsToPath(points);
  return `<path d="${path}" fill="none" stroke="${opts.footprintColor}" stroke-width="2" stroke-dasharray="8,4" />`;
}

function generateRoomsSVG(rooms: ResolvedRoom[], t: Transform, opts: Required<SVGExportOptions>): string {
  const elements: string[] = [];

  for (const room of rooms) {
    const points = transformPolygon(room.polygon.points, t);
    const path = pointsToPath(points);
    
    // Room fill
    elements.push(
      `<path d="${path}" fill="${opts.roomFillColor}" stroke="${opts.roomStrokeColor}" stroke-width="${opts.roomStrokeWidth}" />`
    );
  }

  return elements.join('\n    ');
}

function generateLabelsSVG(rooms: ResolvedRoom[], t: Transform, opts: Required<SVGExportOptions>): string {
  if (!opts.showLabels) return '';
  
  const elements: string[] = [];

  for (const room of rooms) {
    if (!room.label) continue;
    
    const worldCenter = getLabelPosition(room.polygon.points);
    const screenCenter = transformPoint(worldCenter, t);
    
    // Calculate room size in screen coordinates to adapt font size
    const worldBounds = calculatePolygonBounds(room.polygon.points);
    const screenWidth = worldBounds.width * t.scale;
    const screenHeight = worldBounds.height * t.scale;
    const minDimension = Math.min(screenWidth, screenHeight);
    
    // Estimate text width (rough approximation: ~0.6 * fontSize * charCount)
    const label = room.label;
    const baseFontSize = opts.labelFontSize;
    const estimatedTextWidth = 0.6 * baseFontSize * label.length;
    
    // Scale font to fit within room (with some padding)
    const maxTextWidth = screenWidth * 0.85;
    const maxTextHeight = screenHeight * 0.4;
    
    let fontSize = baseFontSize;
    if (estimatedTextWidth > maxTextWidth) {
      fontSize = Math.floor((maxTextWidth / label.length) / 0.6);
    }
    // Also limit by height
    fontSize = Math.min(fontSize, maxTextHeight);
    // Ensure minimum readable size
    fontSize = Math.max(fontSize, 6);
    // Cap at base font size
    fontSize = Math.min(fontSize, baseFontSize);
    
    elements.push(
      `<text x="${screenCenter.x.toFixed(2)}" y="${screenCenter.y.toFixed(2)}" ` +
      `font-size="${fontSize}" fill="${opts.labelColor}" ` +
      `text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif">` +
      `${escapeXml(label)}</text>`
    );
  }

  return elements.join('\n    ');
}

function generateWallsSVG(walls: WallSegment[], t: Transform, opts: Required<SVGExportOptions>): string {
  const elements: string[] = [];

  for (const wall of walls) {
    const start = transformPoint(wall.start, t);
    const end = transformPoint(wall.end, t);
    
    elements.push(
      `<line x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}" ` +
      `x2="${end.x.toFixed(2)}" y2="${end.y.toFixed(2)}" ` +
      `stroke="${opts.wallColor}" stroke-width="${opts.wallWidth}" stroke-linecap="round" />`
    );
  }

  return elements.join('\n    ');
}

function generateOpeningsSVG(
  openings: OpeningPlacement[],
  walls: WallSegment[],
  t: Transform,
  opts: Required<SVGExportOptions>
): string {
  const elements: string[] = [];

  for (const opening of openings) {
    const wall = walls.find((w) => w.id === opening.wallId);
    if (!wall) continue;

    // Calculate opening position on wall (in world coordinates)
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);
    const ratio = opening.position / wallLength;

    const centerX = wall.start.x + dx * ratio;
    const centerY = wall.start.y + dy * ratio;

    // Unit vector along wall
    const ux = dx / wallLength;
    const uy = dy / wallLength;
    const halfWidth = opening.width / 2;

    // Opening endpoints in world coordinates
    const worldP1 = { x: centerX - ux * halfWidth, y: centerY - uy * halfWidth };
    const worldP2 = { x: centerX + ux * halfWidth, y: centerY + uy * halfWidth };

    // Transform to screen coordinates
    const p1 = transformPoint(worldP1, t);
    const p2 = transformPoint(worldP2, t);

    const color = opening.type === 'door' ? opts.doorColor : opts.windowColor;
    const strokeWidth = opening.type === 'door' ? 4 : 3;

    // Draw opening as a gap with colored indicator
    elements.push(
      `<line x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" ` +
      `x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" ` +
      `stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" />`
    );
  }

  return elements.join('\n    ');
}

// ============================================================================
// Dimension Lines - Smart Exterior Placement
// ============================================================================

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

interface ExteriorSides {
  north: boolean; // maxY side
  south: boolean; // minY side
  east: boolean;  // maxX side
  west: boolean;  // minX side
}

interface DimensionPlacement {
  type: 'width' | 'height';
  roomName: string;
  roomArea: number;
  side: 'top' | 'bottom' | 'left' | 'right';
  p1: Point;
  p2: Point;
  value: number;
  // For grouping/staggering
  coordinate: number; // Y for top/bottom, X for left/right
}

function getBounds(points: Point[]): Bounds {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX, maxX, minY, maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getRoomArea(points: Point[]): number {
  // Shoelace formula for polygon area
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function isEdgeAdjacentToRoom(
  edge: 'north' | 'south' | 'east' | 'west',
  roomBounds: Bounds,
  otherRooms: ResolvedRoom[],
  tolerance: number = 0.01
): boolean {
  for (const other of otherRooms) {
    const otherBounds = getBounds(other.polygon.points);
    
    switch (edge) {
      case 'north': // Check if another room is above (shares maxY edge)
        if (Math.abs(otherBounds.minY - roomBounds.maxY) < tolerance) {
          // Check horizontal overlap
          if (otherBounds.maxX > roomBounds.minX + tolerance && 
              otherBounds.minX < roomBounds.maxX - tolerance) {
            return true;
          }
        }
        break;
      case 'south': // Check if another room is below (shares minY edge)
        if (Math.abs(otherBounds.maxY - roomBounds.minY) < tolerance) {
          if (otherBounds.maxX > roomBounds.minX + tolerance && 
              otherBounds.minX < roomBounds.maxX - tolerance) {
            return true;
          }
        }
        break;
      case 'east': // Check if another room is to the right (shares maxX edge)
        if (Math.abs(otherBounds.minX - roomBounds.maxX) < tolerance) {
          if (otherBounds.maxY > roomBounds.minY + tolerance && 
              otherBounds.minY < roomBounds.maxY - tolerance) {
            return true;
          }
        }
        break;
      case 'west': // Check if another room is to the left (shares minX edge)
        if (Math.abs(otherBounds.maxX - roomBounds.minX) < tolerance) {
          if (otherBounds.maxY > roomBounds.minY + tolerance && 
              otherBounds.minY < roomBounds.maxY - tolerance) {
            return true;
          }
        }
        break;
    }
  }
  return false;
}

function getExteriorSides(
  room: ResolvedRoom,
  allRooms: ResolvedRoom[],
  fpBounds: Bounds
): ExteriorSides {
  const roomBounds = getBounds(room.polygon.points);
  const otherRooms = allRooms.filter(r => r.name !== room.name);
  const tolerance = 0.01;
  
  return {
    north: !isEdgeAdjacentToRoom('north', roomBounds, otherRooms, tolerance),
    south: !isEdgeAdjacentToRoom('south', roomBounds, otherRooms, tolerance),
    east: !isEdgeAdjacentToRoom('east', roomBounds, otherRooms, tolerance),
    west: !isEdgeAdjacentToRoom('west', roomBounds, otherRooms, tolerance),
  };
}

function shouldSkipDimension(roomDim: number, footprintDim: number, tolerance: number = 0.5): boolean {
  return Math.abs(roomDim - footprintDim) < tolerance;
}

/**
 * Check if a room's dimension on a given axis is redundant and should be skipped.
 * A dimension is redundant if:
 * 1. It equals the sum of contiguous adjacent rooms (e.g., Hallway 12m = Living 8m + Kitchen 4m)
 * 2. It equals an adjacent room's dimension on the same axis, and that room is larger
 *    (e.g., Kitchen height 6m = Living Room height 6m, but Living Room is larger)
 */
function isDimensionRedundant(
  room: ResolvedRoom,
  allRooms: ResolvedRoom[],
  axis: 'width' | 'height',
  tolerance: number = 0.1
): boolean {
  const roomBounds = getBounds(room.polygon.points);
  const roomArea = getRoomArea(room.polygon.points);
  const roomMin = axis === 'width' ? roomBounds.minX : roomBounds.minY;
  const roomMax = axis === 'width' ? roomBounds.maxX : roomBounds.maxY;
  const roomDim = axis === 'width' ? roomBounds.width : roomBounds.height;
  
  // Check 1: Is this dimension equal to an adjacent larger room's same dimension?
  // (for height, check east/west neighbors; for width, check north/south neighbors)
  const sameAxisEdges = axis === 'height' ? ['east', 'west'] : ['north', 'south'];
  
  for (const edge of sameAxisEdges) {
    for (const other of allRooms) {
      if (other.name === room.name) continue;
      
      const otherBounds = getBounds(other.polygon.points);
      const otherArea = getRoomArea(other.polygon.points);
      const otherDim = axis === 'width' ? otherBounds.width : otherBounds.height;
      
      // Check if rooms are adjacent on this edge
      let isAdjacent = false;
      if (edge === 'east' && Math.abs(otherBounds.minX - roomBounds.maxX) < tolerance) {
        isAdjacent = true;
      } else if (edge === 'west' && Math.abs(otherBounds.maxX - roomBounds.minX) < tolerance) {
        isAdjacent = true;
      } else if (edge === 'north' && Math.abs(otherBounds.minY - roomBounds.maxY) < tolerance) {
        isAdjacent = true;
      } else if (edge === 'south' && Math.abs(otherBounds.maxY - roomBounds.minY) < tolerance) {
        isAdjacent = true;
      }
      
      if (isAdjacent) {
        // Check if they have the same dimension and the other room is larger
        if (Math.abs(otherDim - roomDim) < tolerance && otherArea > roomArea) {
          return true;
        }
      }
    }
  }
  
  // Check 2: Is this dimension the sum of contiguous adjacent rooms?
  const perpendicularEdges = axis === 'width' ? ['north', 'south'] : ['east', 'west'];
  
  for (const edge of perpendicularEdges) {
    // Find all rooms adjacent on this edge
    const adjacentRooms: { bounds: Bounds; min: number; max: number }[] = [];
    
    for (const other of allRooms) {
      if (other.name === room.name) continue;
      
      const otherBounds = getBounds(other.polygon.points);
      
      // Check if other room shares the specified edge with this room
      let sharesEdge = false;
      if (edge === 'north' && Math.abs(otherBounds.minY - roomBounds.maxY) < tolerance) {
        sharesEdge = true;
      } else if (edge === 'south' && Math.abs(otherBounds.maxY - roomBounds.minY) < tolerance) {
        sharesEdge = true;
      } else if (edge === 'east' && Math.abs(otherBounds.minX - roomBounds.maxX) < tolerance) {
        sharesEdge = true;
      } else if (edge === 'west' && Math.abs(otherBounds.maxX - roomBounds.minX) < tolerance) {
        sharesEdge = true;
      }
      
      if (sharesEdge) {
        const otherMin = axis === 'width' ? otherBounds.minX : otherBounds.minY;
        const otherMax = axis === 'width' ? otherBounds.maxX : otherBounds.maxY;
        adjacentRooms.push({ bounds: otherBounds, min: otherMin, max: otherMax });
      }
    }
    
    if (adjacentRooms.length < 2) continue;
    
    // Check if adjacent rooms are contiguous and fully cover this room's span
    adjacentRooms.sort((a, b) => a.min - b.min);
    
    let coveredMin = adjacentRooms[0].min;
    let coveredMax = adjacentRooms[0].max;
    
    for (let i = 1; i < adjacentRooms.length; i++) {
      const curr = adjacentRooms[i];
      if (curr.min <= coveredMax + tolerance) {
        coveredMax = Math.max(coveredMax, curr.max);
      } else {
        break;
      }
    }
    
    // If the adjacent rooms fully cover this room's span, dimension is redundant
    if (coveredMin <= roomMin + tolerance && coveredMax >= roomMax - tolerance) {
      return true;
    }
  }
  
  return false;
}

function formatDimension(meters: number): string {
  if (meters >= 1) {
    // Show as meters with 1 decimal if needed
    const rounded = Math.round(meters * 10) / 10;
    return rounded % 1 === 0 ? `${rounded}m` : `${rounded.toFixed(1)}m`;
  } else {
    // Show as centimeters
    const cm = Math.round(meters * 100);
    return `${cm}cm`;
  }
}

function generateDimensionLine(
  p1: Point,
  p2: Point,
  offset: number,
  label: string,
  transform: Transform,
  opts: Required<SVGExportOptions>,
  side: 'top' | 'bottom' | 'left' | 'right'
): string {
  const screenP1 = transformPoint(p1, transform);
  const screenP2 = transformPoint(p2, transform);
  
  // Calculate dimension line position (offset from the edge)
  let dimP1: Point, dimP2: Point;
  let textX: number, textY: number;
  let textRotation = 0;
  
  const tickLength = 6;
  
  if (side === 'bottom' || side === 'top') {
    // Horizontal dimension line
    const yOffset = side === 'bottom' ? offset : -offset;
    dimP1 = { x: screenP1.x, y: screenP1.y + yOffset };
    dimP2 = { x: screenP2.x, y: screenP2.y + yOffset };
    textX = (dimP1.x + dimP2.x) / 2;
    textY = dimP1.y; // Centered on the line
  } else {
    // Vertical dimension line
    const xOffset = side === 'right' ? offset : -offset;
    dimP1 = { x: screenP1.x + xOffset, y: screenP1.y };
    dimP2 = { x: screenP2.x + xOffset, y: screenP2.y };
    textX = dimP1.x; // Centered on the line
    textY = (dimP1.y + dimP2.y) / 2;
    textRotation = -90;
  }
  
  const elements: string[] = [];
  
  // Main dimension line
  elements.push(
    `<line x1="${dimP1.x.toFixed(2)}" y1="${dimP1.y.toFixed(2)}" ` +
    `x2="${dimP2.x.toFixed(2)}" y2="${dimP2.y.toFixed(2)}" ` +
    `stroke="${opts.dimensionColor}" stroke-width="1" />`
  );
  
  // Tick marks at ends
  if (side === 'bottom' || side === 'top') {
    // Vertical ticks for horizontal lines
    const tickDir = side === 'bottom' ? -1 : 1;
    elements.push(
      `<line x1="${dimP1.x.toFixed(2)}" y1="${(dimP1.y + tickDir * tickLength).toFixed(2)}" ` +
      `x2="${dimP1.x.toFixed(2)}" y2="${(dimP1.y - tickDir * tickLength).toFixed(2)}" ` +
      `stroke="${opts.dimensionColor}" stroke-width="1" />`
    );
    elements.push(
      `<line x1="${dimP2.x.toFixed(2)}" y1="${(dimP2.y + tickDir * tickLength).toFixed(2)}" ` +
      `x2="${dimP2.x.toFixed(2)}" y2="${(dimP2.y - tickDir * tickLength).toFixed(2)}" ` +
      `stroke="${opts.dimensionColor}" stroke-width="1" />`
    );
  } else {
    // Horizontal ticks for vertical lines
    const tickDir = side === 'right' ? -1 : 1;
    elements.push(
      `<line x1="${(dimP1.x + tickDir * tickLength).toFixed(2)}" y1="${dimP1.y.toFixed(2)}" ` +
      `x2="${(dimP1.x - tickDir * tickLength).toFixed(2)}" y2="${dimP1.y.toFixed(2)}" ` +
      `stroke="${opts.dimensionColor}" stroke-width="1" />`
    );
    elements.push(
      `<line x1="${(dimP2.x + tickDir * tickLength).toFixed(2)}" y1="${dimP2.y.toFixed(2)}" ` +
      `x2="${(dimP2.x - tickDir * tickLength).toFixed(2)}" y2="${dimP2.y.toFixed(2)}" ` +
      `stroke="${opts.dimensionColor}" stroke-width="1" />`
    );
  }
  
  // Dimension text - centered on the line with white background
  const textAnchor = 'middle';
  const transform_attr = textRotation !== 0 ? ` transform="rotate(${textRotation}, ${textX.toFixed(2)}, ${textY.toFixed(2)})"` : '';
  
  // Estimate text width for background (approximate: fontSize * 0.6 per character)
  const textWidth = label.length * opts.dimensionFontSize * 0.6 + 4;
  const textHeight = opts.dimensionFontSize + 2;
  
  // Add white background rectangle behind text
  if (textRotation !== 0) {
    // For rotated text, we need to rotate the background too
    elements.push(
      `<rect x="${(textX - textWidth / 2).toFixed(2)}" y="${(textY - textHeight / 2).toFixed(2)}" ` +
      `width="${textWidth.toFixed(2)}" height="${textHeight.toFixed(2)}" ` +
      `fill="${opts.backgroundColor}"${transform_attr} />`
    );
  } else {
    elements.push(
      `<rect x="${(textX - textWidth / 2).toFixed(2)}" y="${(textY - textHeight / 2).toFixed(2)}" ` +
      `width="${textWidth.toFixed(2)}" height="${textHeight.toFixed(2)}" ` +
      `fill="${opts.backgroundColor}" />`
    );
  }
  
  elements.push(
    `<text x="${textX.toFixed(2)}" y="${textY.toFixed(2)}" ` +
    `font-size="${opts.dimensionFontSize}" fill="${opts.dimensionColor}" ` +
    `text-anchor="${textAnchor}" dominant-baseline="middle" ` +
    `font-family="Arial, sans-serif"${transform_attr}>${escapeXml(label)}</text>`
  );
  
  return elements.join('\n    ');
}

function areContiguous(a: DimensionPlacement, b: DimensionPlacement, tolerance: number = 0.01): boolean {
  // Two dimensions are contiguous if they're on the same line and don't overlap
  // For horizontal dims (top/bottom): same Y coordinate, and X ranges are adjacent
  // For vertical dims (left/right): same X coordinate, and Y ranges are adjacent
  
  if (a.side !== b.side) return false;
  
  if (a.side === 'top' || a.side === 'bottom') {
    // Horizontal dimensions - check if same Y and X ranges are adjacent (touching or nearly touching)
    if (Math.abs(a.coordinate - b.coordinate) > tolerance) return false;
    
    const aMinX = Math.min(a.p1.x, a.p2.x);
    const aMaxX = Math.max(a.p1.x, a.p2.x);
    const bMinX = Math.min(b.p1.x, b.p2.x);
    const bMaxX = Math.max(b.p1.x, b.p2.x);
    
    // Adjacent if one ends where the other starts (with small tolerance)
    return Math.abs(aMaxX - bMinX) < tolerance || Math.abs(bMaxX - aMinX) < tolerance;
  } else {
    // Vertical dimensions - check if same X and Y ranges are adjacent
    if (Math.abs(a.coordinate - b.coordinate) > tolerance) return false;
    
    const aMinY = Math.min(a.p1.y, a.p2.y);
    const aMaxY = Math.max(a.p1.y, a.p2.y);
    const bMinY = Math.min(b.p1.y, b.p2.y);
    const bMaxY = Math.max(b.p1.y, b.p2.y);
    
    return Math.abs(aMaxY - bMinY) < tolerance || Math.abs(bMaxY - aMinY) < tolerance;
  }
}

function doRangesOverlap(a: DimensionPlacement, b: DimensionPlacement, tolerance: number = 0.5): boolean {
  // Check if two dimensions would overlap if placed at the same offset
  if (a.side === 'top' || a.side === 'bottom') {
    const aMinX = Math.min(a.p1.x, a.p2.x);
    const aMaxX = Math.max(a.p1.x, a.p2.x);
    const bMinX = Math.min(b.p1.x, b.p2.x);
    const bMaxX = Math.max(b.p1.x, b.p2.x);
    
    return aMinX < bMaxX - tolerance && aMaxX > bMinX + tolerance;
  } else {
    const aMinY = Math.min(a.p1.y, a.p2.y);
    const aMaxY = Math.max(a.p1.y, a.p2.y);
    const bMinY = Math.min(b.p1.y, b.p2.y);
    const bMaxY = Math.max(b.p1.y, b.p2.y);
    
    return aMinY < bMaxY - tolerance && aMaxY > bMinY + tolerance;
  }
}

function groupAndStaggerDimensions(
  placements: DimensionPlacement[],
  baseOffset: number,
  staggerStep: number
): Map<string, { placement: DimensionPlacement; offset: number }[]> {
  // Group by side
  const groups = new Map<string, DimensionPlacement[]>();
  
  for (const p of placements) {
    const key = p.side;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(p);
  }
  
  const result = new Map<string, { placement: DimensionPlacement; offset: number }[]>();
  
  for (const [side, group] of groups) {
    // Sort by area descending (largest rooms get priority for closest offset)
    const sorted = [...group].sort((a, b) => b.roomArea - a.roomArea);
    
    // Assign offsets: contiguous dimensions share the same offset level
    // Non-contiguous but overlapping dimensions need different offset levels
    const withOffsets: { placement: DimensionPlacement; offset: number }[] = [];
    const offsetLevels: { level: number; placements: DimensionPlacement[] }[] = [];
    
    for (const placement of sorted) {
      // Find if this placement can share an offset level with existing placements
      let assignedLevel = -1;
      
      for (let i = 0; i < offsetLevels.length; i++) {
        const level = offsetLevels[i];
        
        // Check if this placement is contiguous with any in this level
        const isContiguousWithLevel = level.placements.some(p => areContiguous(p, placement));
        
        // Check if this placement overlaps with any in this level
        const overlapsWithLevel = level.placements.some(p => doRangesOverlap(p, placement));
        
        if (isContiguousWithLevel || !overlapsWithLevel) {
          // Can share this level - either contiguous or non-overlapping
          assignedLevel = i;
          break;
        }
      }
      
      if (assignedLevel === -1) {
        // Need a new offset level
        assignedLevel = offsetLevels.length;
        offsetLevels.push({ level: assignedLevel, placements: [] });
      }
      
      offsetLevels[assignedLevel].placements.push(placement);
      withOffsets.push({
        placement,
        offset: baseOffset + assignedLevel * staggerStep,
      });
    }
    
    result.set(side, withOffsets);
  }
  
  return result;
}

function generateDimensionsSVG(
  rooms: ResolvedRoom[],
  footprint: Polygon,
  transform: Transform,
  opts: Required<SVGExportOptions>
): string {
  if (!opts.showDimensions) return '';
  
  const elements: string[] = [];
  const fpBounds = getBounds(footprint.points);
  
  // Collect all dimension placements
  const placements: DimensionPlacement[] = [];
  
  for (const room of rooms) {
    const points = room.polygon.points;
    if (points.length < 3) continue;
    
    const roomBounds = getBounds(points);
    const roomArea = getRoomArea(points);
    const exterior = getExteriorSides(room, rooms, fpBounds);
    
    // Width dimension (horizontal)
    // Skip if: spans full footprint width, OR is sum of adjacent contiguous rooms
    const skipWidth = shouldSkipDimension(roomBounds.width, fpBounds.width) ||
                      isDimensionRedundant(room, rooms, 'width');
    
    if (!skipWidth) {
      // Prefer exterior edge: north (top) > south (bottom)
      let side: 'top' | 'bottom';
      let y: number;
      
      if (exterior.north) {
        side = 'top';
        y = roomBounds.maxY;
      } else {
        side = 'bottom';
        y = roomBounds.minY;
      }
      
      placements.push({
        type: 'width',
        roomName: room.name,
        roomArea,
        side,
        p1: { x: roomBounds.minX, y },
        p2: { x: roomBounds.maxX, y },
        value: roomBounds.width,
        coordinate: y,
      });
    }
    
    // Height dimension (vertical)
    // Skip if: spans full footprint height, OR is sum of adjacent contiguous rooms
    const skipHeight = shouldSkipDimension(roomBounds.height, fpBounds.height) ||
                       isDimensionRedundant(room, rooms, 'height');
    
    if (!skipHeight) {
      // Prefer exterior edge: west (left) > east (right)
      let side: 'left' | 'right';
      let x: number;
      
      if (exterior.west) {
        side = 'left';
        x = roomBounds.minX;
      } else {
        side = 'right';
        x = roomBounds.maxX;
      }
      
      placements.push({
        type: 'height',
        roomName: room.name,
        roomArea,
        side,
        p1: { x, y: roomBounds.minY },
        p2: { x, y: roomBounds.maxY },
        value: roomBounds.height,
        coordinate: x,
      });
    }
  }
  
  // Group and stagger dimensions
  const staggered = groupAndStaggerDimensions(
    placements,
    opts.dimensionOffset,
    opts.dimensionStaggerStep
  );
  
  // Track max offset for each side (for footprint dimensions)
  const maxOffsets: Record<string, number> = {
    top: opts.dimensionOffset,
    bottom: opts.dimensionOffset,
    left: opts.dimensionOffset,
    right: opts.dimensionOffset,
  };
  
  // Generate room dimension lines
  for (const [side, group] of staggered) {
    for (const { placement, offset } of group) {
      elements.push(
        generateDimensionLine(
          placement.p1,
          placement.p2,
          offset,
          formatDimension(placement.value),
          transform,
          opts,
          placement.side
        )
      );
      maxOffsets[side] = Math.max(maxOffsets[side], offset + opts.dimensionStaggerStep);
    }
  }
  
  // Generate footprint dimensions (furthest out)
  if (opts.showFootprintDimensions) {
    // Width (bottom of footprint)
    elements.push(
      generateDimensionLine(
        { x: fpBounds.minX, y: fpBounds.minY },
        { x: fpBounds.maxX, y: fpBounds.minY },
        maxOffsets.bottom + opts.dimensionStaggerStep,
        formatDimension(fpBounds.width),
        transform,
        opts,
        'bottom'
      )
    );
    
    // Height (left of footprint)
    elements.push(
      generateDimensionLine(
        { x: fpBounds.minX, y: fpBounds.minY },
        { x: fpBounds.minX, y: fpBounds.maxY },
        maxOffsets.left + opts.dimensionStaggerStep,
        formatDimension(fpBounds.height),
        transform,
        opts,
        'left'
      )
    );
  }
  
  return elements.join('\n    ');
}

// ============================================================================
// Main Export Function
// ============================================================================

export function exportSVG(geometry: GeometryIR, options: SVGExportOptions = {}): string {
  const opts: Required<SVGExportOptions> = { ...defaultOptions, ...options };
  const transform = createTransform(geometry, opts);

  const dimensionsSVG = generateDimensionsSVG(geometry.rooms, geometry.footprint, transform, opts);
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <defs>
    <style>
      .room-label { font-family: Arial, sans-serif; font-weight: 500; }
    </style>
  </defs>
  
  <!-- Background -->
  <rect width="${opts.width}" height="${opts.height}" fill="${opts.backgroundColor}" />
  
  <!-- Footprint (boundary) -->
  ${generateFootprintSVG(geometry.footprint, transform, opts)}
  
  <!-- Rooms -->
  ${generateRoomsSVG(geometry.rooms, transform, opts)}
  
  <!-- Walls -->
  ${generateWallsSVG(geometry.walls, transform, opts)}
  
  <!-- Openings (doors/windows) -->
  ${generateOpeningsSVG(geometry.openings, geometry.walls, transform, opts)}
  
  <!-- Labels -->
  ${generateLabelsSVG(geometry.rooms, transform, opts)}
  
  <!-- Dimensions -->
  ${dimensionsSVG}
</svg>`;

  return svg;
}

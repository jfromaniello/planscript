import type { Point, Position } from '../ast/types.js';
import type { LoweredProgram } from '../lowering/index.js';
import type { GeometryIR, Polygon, WallSegment, OpeningPlacement, ResolvedRoom, ResolvedCourtyard } from './types.js';

// Helper to resolve position to absolute value given wall length
function resolvePosition(position: Position, wallLength: number): number {
  if (position.type === 'percentage') {
    return (position.value / 100) * wallLength;
  }
  return position.value;
}

// ============================================================================
// Geometry Utilities
// ============================================================================

export function calculatePolygonArea(points: Point[]): number {
  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area) / 2;
}

export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function pointsEqual(p1: Point, p2: Point, epsilon = 1e-10): boolean {
  return Math.abs(p1.x - p2.x) < epsilon && Math.abs(p1.y - p2.y) < epsilon;
}

export function segmentsOverlap(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
  epsilon = 1e-10
): { overlap: boolean; start?: Point; end?: Point } {
  // Check if segments are collinear and overlapping
  // Simplified: only handles axis-aligned segments

  const aHorizontal = Math.abs(a1.y - a2.y) < epsilon;
  const bHorizontal = Math.abs(b1.y - b2.y) < epsilon;
  const aVertical = Math.abs(a1.x - a2.x) < epsilon;
  const bVertical = Math.abs(b1.x - b2.x) < epsilon;

  if (aHorizontal && bHorizontal && Math.abs(a1.y - b1.y) < epsilon) {
    const aMinX = Math.min(a1.x, a2.x);
    const aMaxX = Math.max(a1.x, a2.x);
    const bMinX = Math.min(b1.x, b2.x);
    const bMaxX = Math.max(b1.x, b2.x);

    const overlapStart = Math.max(aMinX, bMinX);
    const overlapEnd = Math.min(aMaxX, bMaxX);

    if (overlapStart < overlapEnd - epsilon) {
      return {
        overlap: true,
        start: { x: overlapStart, y: a1.y },
        end: { x: overlapEnd, y: a1.y },
      };
    }
  }

  if (aVertical && bVertical && Math.abs(a1.x - b1.x) < epsilon) {
    const aMinY = Math.min(a1.y, a2.y);
    const aMaxY = Math.max(a1.y, a2.y);
    const bMinY = Math.min(b1.y, b2.y);
    const bMaxY = Math.max(b1.y, b2.y);

    const overlapStart = Math.max(aMinY, bMinY);
    const overlapEnd = Math.min(aMaxY, bMaxY);

    if (overlapStart < overlapEnd - epsilon) {
      return {
        overlap: true,
        start: { x: a1.x, y: overlapStart },
        end: { x: a1.x, y: overlapEnd },
      };
    }
  }

  return { overlap: false };
}

// ============================================================================
// Wall Generation
// ============================================================================

interface Edge {
  start: Point;
  end: Point;
  roomName: string;
}

function extractEdges(room: ResolvedRoom): Edge[] {
  const edges: Edge[] = [];
  const points = room.polygon.points;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    edges.push({
      start: points[i],
      end: points[j],
      roomName: room.name,
    });
  }

  return edges;
}

function isEdgeOnFootprint(edge: Edge, footprint: Polygon): boolean {
  const footprintEdges: { start: Point; end: Point }[] = [];
  const points = footprint.points;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    footprintEdges.push({ start: points[i], end: points[j] });
  }

  for (const fEdge of footprintEdges) {
    const overlap = segmentsOverlap(edge.start, edge.end, fEdge.start, fEdge.end);
    if (overlap.overlap) {
      return true;
    }
  }

  return false;
}

interface WallCandidate {
  start: Point;
  end: Point;
  rooms: string[];
}

function generateWalls(rooms: ResolvedRoom[], footprint: Polygon, defaultThickness = 0.15): WallSegment[] {
  const walls: WallSegment[] = [];
  const allEdges: Edge[] = [];

  // Extract all edges from all rooms
  for (const room of rooms) {
    allEdges.push(...extractEdges(room));
  }

  // Track which segments we've already created walls for
  const createdWalls: WallCandidate[] = [];

  function isSegmentCovered(start: Point, end: Point): boolean {
    // Check if this segment is already covered by existing walls
    for (const wall of createdWalls) {
      const overlap = segmentsOverlap(start, end, wall.start, wall.end);
      if (overlap.overlap && overlap.start && overlap.end) {
        const overlapLen = distance(overlap.start, overlap.end);
        const segmentLen = distance(start, end);
        if (Math.abs(overlapLen - segmentLen) < 0.001) {
          return true; // Fully covered
        }
      }
    }
    return false;
  }

  // First pass: find all shared wall segments (where two rooms touch)
  for (let i = 0; i < allEdges.length; i++) {
    const edge1 = allEdges[i];
    
    for (let j = i + 1; j < allEdges.length; j++) {
      const edge2 = allEdges[j];
      if (edge2.roomName === edge1.roomName) continue;

      const overlap = segmentsOverlap(edge1.start, edge1.end, edge2.start, edge2.end);
      if (overlap.overlap && overlap.start && overlap.end) {
        // Create a shared wall for the overlapping segment
        if (!isSegmentCovered(overlap.start, overlap.end)) {
          createdWalls.push({
            start: overlap.start,
            end: overlap.end,
            rooms: [edge1.roomName, edge2.roomName],
          });
        }
      }
    }
  }

  // Second pass: create walls for non-shared edge segments
  for (const edge of allEdges) {
    // Find portions of this edge not covered by shared walls
    const uncoveredSegments = getUncoveredSegments(edge.start, edge.end, createdWalls);
    
    for (const seg of uncoveredSegments) {
      if (!isSegmentCovered(seg.start, seg.end)) {
        createdWalls.push({
          start: seg.start,
          end: seg.end,
          rooms: [edge.roomName],
        });
      }
    }
  }

  // Convert to WallSegment with IDs
  let wallId = 0;
  for (const candidate of createdWalls) {
    const isExterior = isEdgeOnFootprint(
      { start: candidate.start, end: candidate.end, roomName: candidate.rooms[0] },
      footprint
    );

    walls.push({
      id: `wall_${wallId++}`,
      start: candidate.start,
      end: candidate.end,
      thickness: defaultThickness,
      isExterior,
      rooms: candidate.rooms,
    });
  }

  return walls;
}

function getUncoveredSegments(
  start: Point,
  end: Point,
  existingWalls: WallCandidate[]
): { start: Point; end: Point }[] {
  // For axis-aligned segments, find portions not covered by existing walls
  const isHorizontal = Math.abs(start.y - end.y) < 0.001;
  const isVertical = Math.abs(start.x - end.x) < 0.001;

  if (!isHorizontal && !isVertical) {
    // For non-axis-aligned, just return the whole segment if not fully covered
    return [{ start, end }];
  }

  // Collect all overlapping ranges
  const overlaps: { from: number; to: number }[] = [];

  for (const wall of existingWalls) {
    const overlap = segmentsOverlap(start, end, wall.start, wall.end);
    if (overlap.overlap && overlap.start && overlap.end) {
      if (isHorizontal) {
        overlaps.push({
          from: Math.min(overlap.start.x, overlap.end.x),
          to: Math.max(overlap.start.x, overlap.end.x),
        });
      } else {
        overlaps.push({
          from: Math.min(overlap.start.y, overlap.end.y),
          to: Math.max(overlap.start.y, overlap.end.y),
        });
      }
    }
  }

  // Sort and merge overlapping ranges
  overlaps.sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const o of overlaps) {
    if (merged.length === 0 || merged[merged.length - 1].to < o.from - 0.001) {
      merged.push({ ...o });
    } else {
      merged[merged.length - 1].to = Math.max(merged[merged.length - 1].to, o.to);
    }
  }

  // Find uncovered segments
  const result: { start: Point; end: Point }[] = [];
  let current = isHorizontal ? Math.min(start.x, end.x) : Math.min(start.y, end.y);
  const segEnd = isHorizontal ? Math.max(start.x, end.x) : Math.max(start.y, end.y);
  const fixedCoord = isHorizontal ? start.y : start.x;

  for (const m of merged) {
    if (current < m.from - 0.001) {
      if (isHorizontal) {
        result.push({ start: { x: current, y: fixedCoord }, end: { x: m.from, y: fixedCoord } });
      } else {
        result.push({ start: { x: fixedCoord, y: current }, end: { x: fixedCoord, y: m.from } });
      }
    }
    current = Math.max(current, m.to);
  }

  if (current < segEnd - 0.001) {
    if (isHorizontal) {
      result.push({ start: { x: current, y: fixedCoord }, end: { x: segEnd, y: fixedCoord } });
    } else {
      result.push({ start: { x: fixedCoord, y: current }, end: { x: fixedCoord, y: segEnd } });
    }
  }

  return result;
}

// ============================================================================
// Opening Placement
// ============================================================================

interface DefaultWidths {
  doorWidth?: number;
  windowWidth?: number;
}

function placeOpenings(
  openings: LoweredProgram['openings'],
  walls: WallSegment[],
  rooms: ResolvedRoom[],
  defaults: DefaultWidths = {}
): OpeningPlacement[] {
  const placements: OpeningPlacement[] = [];

  for (const opening of openings) {
    if (opening.type === 'DoorOpening') {
      // Check if it's a door between two rooms or on a single room's edge
      if ('between' in opening) {
        // Door between two rooms - find shared wall
        const [room1Name, room2Name] = opening.between;
        const sharedWall = walls.find(
          (w) => w.rooms.includes(room1Name) && w.rooms.includes(room2Name)
        );

        if (sharedWall) {
          const wallLength = distance(sharedWall.start, sharedWall.end);
          const position = resolvePosition(opening.at, wallLength);
          
          // Use opening width if specified, otherwise use default
          const width = opening.width || defaults.doorWidth || 0.9;

          placements.push({
            id: opening.name,
            type: 'door',
            wallId: sharedWall.id,
            position,
            width,
            swing: opening.swing,
          });
        }
      } else if ('room' in opening && 'edge' in opening) {
        // Door on a single room's edge (exterior door)
        const room = rooms.find((r) => r.name === opening.room);
        if (!room) continue;

        const points = room.polygon.points;
        let targetWall: WallSegment | undefined;

        for (const wall of walls) {
          if (!wall.rooms.includes(opening.room)) continue;

          const midX = (wall.start.x + wall.end.x) / 2;
          const midY = (wall.start.y + wall.end.y) / 2;

          const xs = points.map((p) => p.x);
          const ys = points.map((p) => p.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);

          const isHorizontal = Math.abs(wall.start.y - wall.end.y) < 1e-10;
          const isVertical = Math.abs(wall.start.x - wall.end.x) < 1e-10;

          if (opening.edge === 'south' && isHorizontal && Math.abs(midY - minY) < 1e-10) {
            targetWall = wall;
            break;
          }
          if (opening.edge === 'north' && isHorizontal && Math.abs(midY - maxY) < 1e-10) {
            targetWall = wall;
            break;
          }
          if (opening.edge === 'west' && isVertical && Math.abs(midX - minX) < 1e-10) {
            targetWall = wall;
            break;
          }
          if (opening.edge === 'east' && isVertical && Math.abs(midX - maxX) < 1e-10) {
            targetWall = wall;
            break;
          }
        }

        if (targetWall) {
          const width = opening.width || defaults.doorWidth || 0.9;
          const wallLength = distance(targetWall.start, targetWall.end);
          const position = resolvePosition(opening.at, wallLength);
          
          placements.push({
            id: opening.name,
            type: 'door',
            wallId: targetWall.id,
            position,
            width,
            swing: opening.swing,
          });
        }
      }
    } else if (opening.type === 'WindowOpening') {
      // Find the wall on the specified edge of the room
      const room = rooms.find((r) => r.name === opening.room);
      if (!room) continue;

      // Find wall on the specified edge
      const points = room.polygon.points;
      let targetWall: WallSegment | undefined;

      for (const wall of walls) {
        if (!wall.rooms.includes(opening.room)) continue;

        // Determine which edge this wall is on
        const midX = (wall.start.x + wall.end.x) / 2;
        const midY = (wall.start.y + wall.end.y) / 2;

        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const isHorizontal = Math.abs(wall.start.y - wall.end.y) < 1e-10;
        const isVertical = Math.abs(wall.start.x - wall.end.x) < 1e-10;

        if (opening.edge === 'south' && isHorizontal && Math.abs(midY - minY) < 1e-10) {
          targetWall = wall;
          break;
        }
        if (opening.edge === 'north' && isHorizontal && Math.abs(midY - maxY) < 1e-10) {
          targetWall = wall;
          break;
        }
        if (opening.edge === 'west' && isVertical && Math.abs(midX - minX) < 1e-10) {
          targetWall = wall;
          break;
        }
        if (opening.edge === 'east' && isVertical && Math.abs(midX - maxX) < 1e-10) {
          targetWall = wall;
          break;
        }
      }

      if (targetWall) {
        // Use opening width if specified, otherwise use default
        const width = opening.width || defaults.windowWidth || 1.2;
        const wallLength = distance(targetWall.start, targetWall.end);
        const position = resolvePosition(opening.at, wallLength);
        
        placements.push({
          id: opening.name,
          type: 'window',
          wallId: targetWall.id,
          position,
          width,
          sill: opening.sill,
        });
      }
    }
  }

  return placements;
}

// ============================================================================
// Main Geometry Generation
// ============================================================================

export function generateGeometry(lowered: LoweredProgram): GeometryIR {
  const footprint: Polygon = { points: lowered.footprint };

  const rooms: ResolvedRoom[] = lowered.rooms.map((room) => ({
    name: room.name,
    label: room.label,
    polygon: { points: room.polygon },
    area: calculatePolygonArea(room.polygon),
  }));

  const courtyards: ResolvedCourtyard[] = lowered.courtyards.map((courtyard) => ({
    name: courtyard.name,
    label: courtyard.label,
    polygon: { points: courtyard.polygon },
    area: calculatePolygonArea(courtyard.polygon),
  }));

  const walls = generateWalls(rooms, footprint);
  const openings = placeOpenings(lowered.openings, walls, rooms, lowered.defaults);

  return {
    footprint,
    rooms,
    courtyards,
    walls,
    openings,
  };
}

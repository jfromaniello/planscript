/**
 * Intent types for the floor plan solver.
 * These define the input model that LLMs/humans generate.
 */

export type Units = 'm' | 'cm';

export type Footprint =
  | { kind: 'rect'; min: [number, number]; max: [number, number] }
  | { kind: 'polygon'; points: Array<[number, number]> };

export type ZoneId = string; // e.g., "front", "middle", "back", "left", "right"

export type EdgeDirection = 'north' | 'south' | 'east' | 'west';

export interface BandSpec {
  id: ZoneId;
  minWidth?: number;
  targetWidth?: number;
  maxWidth?: number;
}

export interface DepthSpec {
  id: ZoneId;
  minDepth?: number;
  targetDepth?: number;
  maxDepth?: number;
}

export type RoomId = string;

export type RoomType =
  | 'bedroom'
  | 'bath'
  | 'kitchen'
  | 'dining'
  | 'living'
  | 'office'
  | 'garage'
  | 'laundry'
  | 'hall'
  | 'corridor'
  | 'foyer'
  | 'stairwell'
  | 'closet'
  | 'ensuite'
  | 'utility'
  | 'storage'
  | 'other';

/**
 * Room type categories for access rules.
 * These are built-in and used when access rules reference categories.
 */
export type RoomCategory = 'circulation' | 'private' | 'public' | 'service';

export const ROOM_CATEGORIES: Record<RoomCategory, RoomType[]> = {
  circulation: ['hall', 'corridor', 'foyer', 'stairwell'],
  private: ['bedroom', 'bath', 'closet', 'ensuite'],
  public: ['living', 'dining', 'kitchen', 'office'],
  service: ['laundry', 'garage', 'storage', 'utility'],
};

/**
 * Get the category for a room type.
 */
export function getRoomCategory(type: RoomType): RoomCategory | null {
  for (const [category, types] of Object.entries(ROOM_CATEGORIES)) {
    if (types.includes(type)) {
      return category as RoomCategory;
    }
  }
  return null;
}

/**
 * Check if a room type is in a category.
 */
export function isRoomTypeInCategory(type: RoomType, category: RoomCategory): boolean {
  return ROOM_CATEGORIES[category].includes(type);
}

/**
 * Check if a room type is circulation.
 */
export function isCirculationType(type: RoomType): boolean {
  return ROOM_CATEGORIES.circulation.includes(type);
}

export interface RoomSpec {
  id: RoomId;
  label?: string;

  // Geometry targets (solver tries to match)
  minArea: number;
  targetArea?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspect?: { min: number; max: number }; // w/h ratio
  
  /** 
   * If true, room will try to fill its entire cell rather than just meeting area targets.
   * Useful for rooms that should expand to fill available space.
   */
  fillCell?: boolean;

  // Placement intent
  preferredBands?: ZoneId[];
  preferredDepths?: ZoneId[];
  mustTouchExterior?: boolean;
  mustTouchEdge?: EdgeDirection; // e.g., garden edge

  // Adjacency
  adjacentTo?: RoomId[];
  avoidAdjacentTo?: RoomId[];

  // Connectivity
  needsAccessFrom?: RoomId[];
  /** Mark this room as circulation space (overrides type-based detection) */
  isCirculation?: boolean;
  /** This room has the main exterior door (entry point for reachability) */
  hasExteriorDoor?: boolean;
  
  /** 
   * For bathrooms: marks this as an ensuite (private to one bedroom).
   * If not specified, inferred from adjacencies:
   * - adjacentTo contains exactly one bedroom → ensuite
   * - adjacentTo contains hall/circulation or multiple bedrooms → shared
   */
  isEnsuite?: boolean;

  // Room type helps with defaults (windows, doors, scoring)
  type: RoomType;
}

export interface OpeningDefaults {
  doorWidth: number;
  windowWidth: number;
  exteriorDoorWidth?: number;
  corridorWidth?: number; // defaults to 1.2m
}

export type SoftConstraintKey =
  | 'respectPreferredZones'
  | 'adjacencySatisfaction'
  | 'minimizeHallArea'
  | 'maximizeExteriorGlazing'
  | 'bathroomClustering'
  | 'compactness'
  | 'minimizeExteriorWallBreaks';

export interface HardConstraints {
  noOverlap: boolean;
  insideFootprint: boolean;
  /** All rooms must be reachable from the entry point (front door) */
  allRoomsReachable?: boolean;
}

/**
 * Access rule defining which room types can have doors to other types.
 * 
 * Example: Bedrooms should only be accessible from circulation spaces:
 * {
 *   roomType: "bedroom",
 *   accessibleFrom: ["circulation"]  // category or specific types
 * }
 */
export interface AccessRule {
  /** The room type this rule applies to */
  roomType: RoomType | RoomCategory;
  
  /** 
   * Which room types/categories can have doors leading TO this room.
   * Can be specific types ("hall", "foyer") or categories ("circulation").
   * If not specified, any room can have a door to this room.
   */
  accessibleFrom?: (RoomType | RoomCategory)[];
  
  /**
   * Which room types/categories this room can have doors leading TO.
   * Useful for things like "bedroom can lead to ensuite/closet".
   * If not specified, determined by other rooms' accessibleFrom rules.
   */
  canLeadTo?: (RoomType | RoomCategory)[];
}

/**
 * Predefined access rule presets for common architectural patterns.
 */
export type AccessRulePreset = 
  | 'open_plan'           // Minimal restrictions, open flow
  | 'traditional'         // Bedrooms from circulation, formal dining
  | 'privacy_focused';    // Strict private/public separation

/**
 * Get access rules for a preset.
 */
export function getAccessRulePreset(preset: AccessRulePreset): AccessRule[] {
  switch (preset) {
    case 'open_plan':
      return [
        // Bedrooms still need some privacy
        { roomType: 'bedroom', accessibleFrom: ['circulation', 'bedroom'] },
      ];
    
    case 'traditional':
      return [
        // Private rooms only from circulation
        { roomType: 'bedroom', accessibleFrom: ['circulation'], canLeadTo: ['ensuite', 'closet', 'bath'] },
        { roomType: 'bath', accessibleFrom: ['circulation', 'bedroom'] },
        { roomType: 'ensuite', accessibleFrom: ['bedroom'] },
        { roomType: 'closet', accessibleFrom: ['bedroom', 'circulation'] },
        // Public rooms can connect to each other and circulation
        { roomType: 'living', accessibleFrom: ['circulation', 'dining', 'kitchen', 'foyer'] },
        { roomType: 'dining', accessibleFrom: ['circulation', 'living', 'kitchen'] },
        { roomType: 'kitchen', accessibleFrom: ['circulation', 'dining', 'living', 'laundry', 'garage'] },
        { roomType: 'office', accessibleFrom: ['circulation', 'living'] },
        // Service rooms
        { roomType: 'garage', accessibleFrom: ['circulation', 'kitchen', 'laundry'] },
        { roomType: 'laundry', accessibleFrom: ['circulation', 'kitchen', 'garage'] },
      ];
    
    case 'privacy_focused':
      return [
        // Strict: bedrooms ONLY from circulation
        { roomType: 'bedroom', accessibleFrom: ['circulation'], canLeadTo: ['ensuite', 'closet'] },
        { roomType: 'bath', accessibleFrom: ['circulation'] }, // No ensuites, shared baths only
        { roomType: 'ensuite', accessibleFrom: ['bedroom'] },
        { roomType: 'closet', accessibleFrom: ['bedroom'] },
        // Public rooms through circulation only
        { roomType: 'living', accessibleFrom: ['circulation'] },
        { roomType: 'dining', accessibleFrom: ['circulation', 'kitchen'] },
        { roomType: 'kitchen', accessibleFrom: ['circulation', 'dining'] },
        { roomType: 'office', accessibleFrom: ['circulation'] },
      ];
    
    default:
      return [];
  }
}

export interface LayoutIntent {
  units: Units;
  footprint: Footprint;

  // Optional decomposition hints (strongly recommended)
  bands?: BandSpec[];
  depths?: DepthSpec[];

  // Global anchors
  frontEdge: EdgeDirection;
  gardenEdge?: EdgeDirection;

  defaults: OpeningDefaults;

  rooms: RoomSpec[];

  // Hard constraints
  hard: HardConstraints;

  // Access rules - control which rooms can connect to which
  // Can use a preset or custom rules (custom rules override preset)
  accessRulePreset?: AccessRulePreset;
  accessRules?: AccessRule[];

  // Soft constraints weights (tunable)
  weights?: Partial<Record<SoftConstraintKey, number>>;
}

/**
 * Validate and normalize a LayoutIntent.
 * Fills in defaults and checks for basic errors.
 */
export function normalizeIntent(intent: LayoutIntent): LayoutIntent {
  const normalized = { ...intent };

  // Default corridor width
  if (normalized.defaults.corridorWidth === undefined) {
    normalized.defaults.corridorWidth = 1.2;
  }

  // Default exterior door width
  if (normalized.defaults.exteriorDoorWidth === undefined) {
    normalized.defaults.exteriorDoorWidth = normalized.defaults.doorWidth;
  }

  // Convert cm to m if needed
  if (normalized.units === 'cm') {
    normalized.units = 'm';
    normalized.footprint = convertFootprintToMeters(normalized.footprint);
    normalized.defaults = {
      ...normalized.defaults,
      doorWidth: normalized.defaults.doorWidth / 100,
      windowWidth: normalized.defaults.windowWidth / 100,
      exteriorDoorWidth: (normalized.defaults.exteriorDoorWidth ?? normalized.defaults.doorWidth) / 100,
      corridorWidth: (normalized.defaults.corridorWidth ?? 1.2) / 100,
    };
    normalized.rooms = normalized.rooms.map(r => convertRoomSpecToMeters(r));
    normalized.bands = normalized.bands?.map(b => convertBandSpecToMeters(b));
    normalized.depths = normalized.depths?.map(d => convertDepthSpecToMeters(d));
  }

  // Resolve access rules from preset + custom
  if (normalized.accessRulePreset && !normalized.accessRules) {
    normalized.accessRules = getAccessRulePreset(normalized.accessRulePreset);
  } else if (normalized.accessRulePreset && normalized.accessRules) {
    // Merge: custom rules override preset rules for the same room type
    const presetRules = getAccessRulePreset(normalized.accessRulePreset);
    const customTypes = new Set(normalized.accessRules.map(r => r.roomType));
    const mergedRules = [
      ...presetRules.filter(r => !customTypes.has(r.roomType)),
      ...normalized.accessRules,
    ];
    normalized.accessRules = mergedRules;
  }

  // Default hard constraints
  if (normalized.hard.allRoomsReachable === undefined) {
    normalized.hard.allRoomsReachable = true; // Default to requiring reachability
  }

  // Default weights
  normalized.weights = {
    respectPreferredZones: 2,
    adjacencySatisfaction: 3,
    minimizeHallArea: 1,
    maximizeExteriorGlazing: 1,
    bathroomClustering: 1,
    compactness: 1,
    minimizeExteriorWallBreaks: 1,
    ...normalized.weights,
  };

  return normalized;
}

function convertFootprintToMeters(fp: Footprint): Footprint {
  if (fp.kind === 'rect') {
    return {
      kind: 'rect',
      min: [fp.min[0] / 100, fp.min[1] / 100],
      max: [fp.max[0] / 100, fp.max[1] / 100],
    };
  }
  return {
    kind: 'polygon',
    points: fp.points.map(([x, y]) => [x / 100, y / 100]),
  };
}

function convertRoomSpecToMeters(r: RoomSpec): RoomSpec {
  return {
    ...r,
    minArea: r.minArea / 10000,
    targetArea: r.targetArea !== undefined ? r.targetArea / 10000 : undefined,
    minWidth: r.minWidth !== undefined ? r.minWidth / 100 : undefined,
    minHeight: r.minHeight !== undefined ? r.minHeight / 100 : undefined,
    maxWidth: r.maxWidth !== undefined ? r.maxWidth / 100 : undefined,
    maxHeight: r.maxHeight !== undefined ? r.maxHeight / 100 : undefined,
  };
}

function convertBandSpecToMeters(b: BandSpec): BandSpec {
  return {
    ...b,
    minWidth: b.minWidth !== undefined ? b.minWidth / 100 : undefined,
    targetWidth: b.targetWidth !== undefined ? b.targetWidth / 100 : undefined,
    maxWidth: b.maxWidth !== undefined ? b.maxWidth / 100 : undefined,
  };
}

function convertDepthSpecToMeters(d: DepthSpec): DepthSpec {
  return {
    ...d,
    minDepth: d.minDepth !== undefined ? d.minDepth / 100 : undefined,
    targetDepth: d.targetDepth !== undefined ? d.targetDepth / 100 : undefined,
    maxDepth: d.maxDepth !== undefined ? d.maxDepth / 100 : undefined,
  };
}

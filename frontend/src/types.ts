
export enum SafetyCategory {
  COMFORTABLE = 'Comfortable',
  ACTIVE_PRESENCE = 'Active Women Presence',
  HELPFUL_LOCALS = 'Helpful Locals',
  OPEN_SHOPS = 'Open Shops',
  TRANSIT_HUB = 'Bus/Rickshaw Stand',
  TEMPLE_AREA = 'Community Area'
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface SafetyNode {
  id: string;
  type: 'shop' | 'transit' | 'community' | 'street_light' | 'report';
  label: string;
  psi: number; // Positive Safety Index 0-100
  coordinates: Coordinates;
  categories: SafetyCategory[];
  lastUpdate: string;
  description: string;
  details?: {
    lighting?: string;
    crowd?: string;
    shops?: string;
    author?: string;
  };
}

export interface User {
  id: string;
  name: string;
  isAnonymous: boolean;
  avatarUrl?: string;
}

export interface CoTraveller {
  id: string;
  name: string;
  matchScore: number; // 0-100%
  destination: string;
  timeWindow: string;
  verified: boolean;
  avatar: string;
  location?: Coordinates; // User's current location
  distance?: number; // Distance from current user in meters
}

export interface GeminiAnalysisResult {
  psiScore: number;
  reasoning: string;
  detectedSafetyFeatures: string[];
  recommendation: string;
  lighting: 'poor' | 'moderate' | 'sufficient' | 'visible';
  crowd: 'low' | 'moderate' | 'sufficient' | 'busy';
  shops: 'close' | 'open' | 'close_night' | 'open_night';
}

export interface ActiveRoute {
  start: Coordinates;
  end: Coordinates;
  startLabel: string;
  endLabel: string;
  heatmapData?: Array<{ lat: number; lng: number; psi: number }>;
}

export enum AppMode {
  MAP = 'MAP',
  SCAN = 'SCAN',
  ROUTE = 'ROUTE',
  CO_TRAVEL = 'CO_TRAVEL',
  SOS = 'SOS',
  FEEDBACK = 'FEEDBACK'
}

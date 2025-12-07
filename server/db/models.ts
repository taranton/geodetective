// Database model types for GeoDetective AI

export interface DbUser {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  credits: number;
  is_approved: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DbSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export interface DbSearchHistory {
  id: string;
  user_id: string;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  confidence_score: number | null;
  reasoning: string | null; // JSON string
  visual_cues: string | null; // JSON string
  sources: string | null; // JSON string
  cost: number;
  created_at: Date;
}

export interface DbSystemSetting {
  setting_key: string;
  setting_value: string;
  updated_at: Date;
}

export interface DbUserSetting {
  user_id: string;
  setting_key: string;
  setting_value: string;
  updated_at: Date;
}

// Premium service keys
export const PREMIUM_SERVICES = {
  CLOUD_VISION: 'cloud_vision_enabled',
} as const;

export type PremiumServiceKey = typeof PREMIUM_SERVICES[keyof typeof PREMIUM_SERVICES];

// User settings response
export interface UserSettings {
  cloudVisionEnabled: boolean;
}

// Premium service info for frontend
export interface PremiumServiceInfo {
  key: string;
  name: string;
  description: string;
  cost: number;
  enabled: boolean;
}

// API response types (без sensitive данных)

export interface UserPublic {
  id: string;
  username: string;
  role: 'admin' | 'user';
  credits: number;
  isApproved: boolean;
  registeredAt: number;
}

export interface SearchHistoryItem {
  id: string;
  userId: string;
  locationName: string | null;
  coordinates: {
    lat: number;
    lng: number;
  } | null;
  confidenceScore: number | null;
  reasoning: string[];
  visualCues: {
    signs: string;
    architecture: string;
    environment: string;
    demographics?: string;
  } | null;
  sources: Array<{ title: string; uri: string }>;
  cost: number;
  timestamp: number;
}

// Conversion helpers

export function dbUserToPublic(user: DbUser): UserPublic {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    credits: user.credits,
    isApproved: user.is_approved,
    registeredAt: user.created_at.getTime()
  };
}

// Helper to safely parse JSON - handles both string and already-parsed objects
function safeJsonParse<T>(value: string | T | null, defaultValue: T): T {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }
  return value as T;
}

export function dbHistoryToItem(history: DbSearchHistory): SearchHistoryItem {
  // MySQL DECIMAL columns return as strings - convert to numbers
  const lat = history.lat ? parseFloat(String(history.lat)) : null;
  const lng = history.lng ? parseFloat(String(history.lng)) : null;

  return {
    id: history.id,
    userId: history.user_id,
    locationName: history.location_name,
    coordinates: lat !== null && lng !== null
      ? { lat, lng }
      : null,
    confidenceScore: history.confidence_score,
    reasoning: safeJsonParse<string[]>(history.reasoning, []),
    visualCues: safeJsonParse(history.visual_cues, null),
    sources: safeJsonParse<Array<{ title: string; uri: string }>>(history.sources, []),
    cost: history.cost,
    timestamp: history.created_at.getTime()
  };
}

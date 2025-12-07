export interface EvidenceItem {
  clue: string;
  strength: 'hard' | 'medium' | 'soft';
  supports: string;
}

// A location candidate when multiple possibilities exist
export interface LocationCandidate {
  locationName: string;
  coordinates: { lat: number; lng: number } | null;
  probability: number;  // 0-100, relative probability among candidates
  reasoning: string[];  // Why this location is a candidate
  keyEvidence: string[];  // Main evidence supporting this candidate
}

export interface GeoAnalysisResult {
  // When confident (80%+), this is the definitive answer
  // When uncertain, this is the top candidate
  locationName: string;
  coordinates: {
    lat: number;
    lng: number;
  } | null;
  confidenceScore: number; // 0-100 (overall, for backward compatibility)
  confidence?: {
    region: number;  // 0-100, country/area certainty
    local: number;   // 0-100, specific location certainty
  };

  // Multi-result support: when system is uncertain, shows top candidates
  isDefinitive: boolean;  // true = high confidence single answer, false = multiple candidates
  candidates?: LocationCandidate[];  // Top 2-3 candidates when isDefinitive=false

  reasoning: string[];
  evidence?: EvidenceItem[];
  alternativeLocations?: string[];
  uncertainties?: string[];
  visualCues: {
    signs: string;
    architecture: string;
    environment: string;
    demographics?: string;
  };
  searchQueriesUsed: string[];
  sources: Array<{
    title: string;
    uri: string;
  }>;
}

export interface AnalysisState {
  status: 'idle' | 'ready' | 'uploading' | 'analyzing' | 'complete' | 'error';
  error?: string;
  result?: GeoAnalysisResult;
  imagePreviews?: string[];
  isRefining?: boolean;
}

export interface LocationHints {
  continent: string;
  country: string;
  city: string;
  additionalInfo?: string;  // User-provided context (time, date, other clues)
}

// --- New Types for Auth & Credits ---

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  passwordHash: string; // In a real app, this would be bcrypt. Here we simulate.
  role: UserRole;
  credits: number;
  isApproved: boolean;
  registeredAt: number;
}

export interface SearchHistory {
  id: string;
  userId: string;
  timestamp: number;
  locationName: string;
  coordinates: { lat: number; lng: number } | null;
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
}

export interface SystemSettings {
  searchCost: number;
}
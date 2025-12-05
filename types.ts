export interface GeoAnalysisResult {
  locationName: string;
  coordinates: {
    lat: number;
    lng: number;
  } | null;
  confidenceScore: number; // 0-100
  reasoning: string[];
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
  status: 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';
  error?: string;
  result?: GeoAnalysisResult;
  imagePreviews?: string[];
  isRefining?: boolean;
}

export interface LocationHints {
  continent: string;
  country: string;
  city: string;
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
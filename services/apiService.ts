import { User, SearchHistory, SystemSettings, GeoAnalysisResult, LocationHints } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Token management
const getToken = (): string | null => localStorage.getItem('geodetective_token');
const setToken = (token: string) => localStorage.setItem('geodetective_token', token);
const removeToken = () => localStorage.removeItem('geodetective_token');

// Cached user for quick access
let cachedUser: User | null = null;

// HTTP helpers
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error?.message || 'Request failed');
    (error as any).code = data.error?.code;
    (error as any).status = response.status;
    throw error;
  }

  return data;
}

// API Service - same interface as dbService
export const apiService = {
  // --- Auth ---
  register: async (username: string, password: string): Promise<{ message: string }> => {
    const data = await request<{ success: boolean; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return { message: data.message };
  },

  login: async (username: string, password: string): Promise<User> => {
    const data = await request<{ success: boolean; token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    cachedUser = data.user;
    return data.user;
  },

  logout: async (): Promise<void> => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignore logout errors
    }
    removeToken();
    cachedUser = null;
  },

  getCurrentUser: async (): Promise<User | null> => {
    const token = getToken();
    if (!token) {
      cachedUser = null;
      return null;
    }

    try {
      const data = await request<{ success: boolean; user: User }>('/auth/me');
      cachedUser = data.user;
      return data.user;
    } catch (e: any) {
      if (e.status === 401) {
        removeToken();
        cachedUser = null;
      }
      return null;
    }
  },

  // Synchronous getter for cached user (for UI that needs instant access)
  getCachedUser: (): User | null => cachedUser,

  // --- Admin ---
  getAllUsers: async (): Promise<User[]> => {
    const data = await request<{ success: boolean; users: User[] }>('/users');
    return data.users;
  },

  updateUser: async (userId: string, updates: Partial<User>): Promise<User> => {
    const data = await request<{ success: boolean; user: User }>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return data.user;
  },

  deleteUser: async (userId: string): Promise<void> => {
    await request(`/users/${userId}`, { method: 'DELETE' });
  },

  getSystemSettings: async (): Promise<SystemSettings> => {
    const data = await request<{ success: boolean; settings: SystemSettings }>('/settings');
    return data.settings;
  },

  updateSystemSettings: async (settings: Partial<SystemSettings>): Promise<SystemSettings> => {
    const data = await request<{ success: boolean; settings: SystemSettings }>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    return data.settings;
  },

  // --- Analysis ---
  analyzeImages: async (
    images: { base64: string; mimeType: string }[],
    hints?: LocationHints
  ): Promise<{ result: GeoAnalysisResult; creditsRemaining: number; cost: number }> => {
    const data = await request<{
      success: boolean;
      result: GeoAnalysisResult;
      creditsRemaining: number;
      cost: number;
    }>('/analyze', {
      method: 'POST',
      body: JSON.stringify({ images, hints }),
    });

    // Update cached user credits
    if (cachedUser) {
      cachedUser = { ...cachedUser, credits: data.creditsRemaining };
    }

    return data;
  },

  refineAnalysis: async (
    images: { base64: string; mimeType: string }[],
    previousResult: GeoAnalysisResult,
    userFeedback: string,
    hints?: LocationHints
  ): Promise<GeoAnalysisResult> => {
    const data = await request<{ success: boolean; result: GeoAnalysisResult }>('/analyze/refine', {
      method: 'POST',
      body: JSON.stringify({ images, previousResult, userFeedback, hints }),
    });
    return data.result;
  },

  // --- History ---
  addHistory: async (result: GeoAnalysisResult, cost: number): Promise<string> => {
    const data = await request<{ success: boolean; id: string }>('/history', {
      method: 'POST',
      body: JSON.stringify({
        locationName: result.locationName,
        coordinates: result.coordinates,
        confidenceScore: result.confidenceScore,
        reasoning: result.reasoning,
        visualCues: result.visualCues,
        sources: result.sources,
        cost,
      }),
    });
    return data.id;
  },

  getUserHistory: async (): Promise<SearchHistory[]> => {
    const data = await request<{ success: boolean; history: SearchHistory[] }>('/history');
    return data.history;
  },

  deleteHistoryItem: async (id: string): Promise<void> => {
    await request(`/history/${id}`, { method: 'DELETE' });
  },

  // --- User Settings ---
  getUserSettings: async (): Promise<{
    premiumServices: Array<{
      key: string;
      name: string;
      description: string;
      cost: number;
      enabled: boolean;
    }>;
  }> => {
    const data = await request<{
      success: boolean;
      settings: {
        premiumServices: Array<{
          key: string;
          name: string;
          description: string;
          cost: number;
          enabled: boolean;
        }>;
      };
    }>('/settings/user');
    return data.settings;
  },

  updateUserSettings: async (settings: {
    premiumServices?: Record<string, boolean>;
  }): Promise<{
    premiumServices: Array<{
      key: string;
      name: string;
      description: string;
      cost: number;
      enabled: boolean;
    }>;
  }> => {
    const data = await request<{
      success: boolean;
      settings: {
        premiumServices: Array<{
          key: string;
          name: string;
          description: string;
          cost: number;
          enabled: boolean;
        }>;
      };
    }>('/settings/user', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    return data.settings;
  },

  // --- Utilities ---
  isAuthenticated: (): boolean => {
    return !!getToken();
  },

  getToken,
};

// Export as default for easy replacement of dbService
export default apiService;

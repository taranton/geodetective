import { User, SearchHistory, SystemSettings, GeoAnalysisResult } from '../types';

const DB_KEYS = {
  USERS: 'geodetective_users',
  HISTORY: 'geodetective_history',
  SETTINGS: 'geodetective_settings',
  CURRENT_USER: 'geodetective_session'
};

// Initialize DB with default Admin if empty
const initDB = () => {
  if (!localStorage.getItem(DB_KEYS.USERS)) {
    const defaultAdmin: User = {
      id: 'admin-1',
      username: 'admin',
      passwordHash: 'admin', // In real app: bcrypt
      role: 'admin',
      credits: 999999,
      isApproved: true,
      registeredAt: Date.now()
    };
    localStorage.setItem(DB_KEYS.USERS, JSON.stringify([defaultAdmin]));
  }
  if (!localStorage.getItem(DB_KEYS.SETTINGS)) {
    const defaultSettings: SystemSettings = { searchCost: 10 };
    localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(defaultSettings));
  }
};

initDB();

// Helpers
const getUsers = (): User[] => JSON.parse(localStorage.getItem(DB_KEYS.USERS) || '[]');
const saveUsers = (users: User[]) => localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));

const getHistory = (): SearchHistory[] => JSON.parse(localStorage.getItem(DB_KEYS.HISTORY) || '[]');
const saveHistory = (hist: SearchHistory[]) => localStorage.setItem(DB_KEYS.HISTORY, JSON.stringify(hist));

const getSettings = (): SystemSettings => JSON.parse(localStorage.getItem(DB_KEYS.SETTINGS) || '{"searchCost": 10}');
const saveSettings = (s: SystemSettings) => localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(s));

// Auth Services
export const dbService = {
  // --- Auth ---
  register: (username: string, password: string): User => {
    const users = getUsers();
    if (users.find(u => u.username === username)) {
      throw new Error("Username already taken");
    }
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      passwordHash: password, // Simple storage for demo
      role: 'user',
      credits: 0, // Default 0, admin must assign
      isApproved: false, // Must be approved
      registeredAt: Date.now()
    };
    users.push(newUser);
    saveUsers(users);
    return newUser;
  },

  login: (username: string, password: string): User => {
    const users = getUsers();
    const user = users.find(u => u.username === username && u.passwordHash === password);
    if (!user) throw new Error("Invalid credentials");
    if (!user.isApproved) throw new Error("Account pending administrator approval");
    localStorage.setItem(DB_KEYS.CURRENT_USER, JSON.stringify(user));
    return user;
  },

  logout: () => {
    localStorage.removeItem(DB_KEYS.CURRENT_USER);
  },

  getCurrentUser: (): User | null => {
    const u = localStorage.getItem(DB_KEYS.CURRENT_USER);
    if (!u) return null;
    // Refresh user data from DB to get latest credits
    const parsed = JSON.parse(u);
    const fresh = getUsers().find(dbU => dbU.id === parsed.id);
    return fresh || null;
  },

  // --- Admin ---
  getAllUsers: (): User[] => getUsers(),
  
  updateUser: (userId: string, updates: Partial<User>) => {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error("User not found");
    users[idx] = { ...users[idx], ...updates };
    saveUsers(users);
  },

  getSystemSettings: () => getSettings(),
  updateSystemSettings: (s: SystemSettings) => saveSettings(s),

  // --- Credits & Transactions ---
  deductCredits: (userId: string, amount: number) => {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error("User not found");
    
    if (users[idx].credits < amount) throw new Error("Insufficient credits");
    
    users[idx].credits -= amount;
    saveUsers(users);
  },

  // --- History ---
  addHistory: (userId: string, result: GeoAnalysisResult, cost: number) => {
    const history = getHistory();
    const entry: SearchHistory = {
      id: Math.random().toString(36).substr(2, 9),
      userId,
      timestamp: Date.now(),
      locationName: result.locationName,
      coordinates: result.coordinates,
      cost,
      // In a real app we'd store the image URL on S3/Cloud Storage. 
      // Here we just skip the image to avoid localStorage limits with base64.
    };
    history.push(entry);
    saveHistory(history);
  },

  getUserHistory: (userId: string): SearchHistory[] => {
    return getHistory().filter(h => h.userId === userId).sort((a, b) => b.timestamp - a.timestamp);
  }
};
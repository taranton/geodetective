import { Router } from 'express';
import { query, queryOne, execute } from '../db/connection.js';
import { DbSystemSetting, DbUserSetting, PREMIUM_SERVICES, PremiumServiceInfo } from '../db/models.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Premium service definitions
const PREMIUM_SERVICE_DEFS = [
  {
    key: PREMIUM_SERVICES.CLOUD_VISION,
    name: 'Google Cloud Vision',
    description: 'Reverse image search to find where this photo has been published online',
    costKey: 'cloud_vision_cost',
    defaultCost: 5
  }
];

// Helper: Convert settings array to object
const settingsToObject = (settings: DbSystemSetting[]): Record<string, string> => {
  return settings.reduce((obj, s) => {
    obj[s.setting_key] = s.setting_value;
    return obj;
  }, {} as Record<string, string>);
};

// Helper: Fetch and format system settings
const fetchSystemSettings = async () => {
  const settings = await query<DbSystemSetting[]>('SELECT * FROM system_settings');
  const obj = settingsToObject(settings);
  return {
    searchCost: parseInt(obj.search_cost || '10'),
    defaultCredits: parseInt(obj.default_credits || '100'),
    premiumServices: PREMIUM_SERVICE_DEFS.map(svc => ({
      key: svc.key,
      name: svc.name,
      description: svc.description,
      cost: parseInt(obj[svc.costKey] || svc.defaultCost.toString())
    }))
  };
};

// GET /api/settings - Get system settings (public)
router.get('/', async (req, res, next) => {
  try {
    const settings = await fetchSystemSettings();
    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
});

// Helper: Upsert a system setting
const upsertSetting = async (key: string, value: number) => {
  if (typeof value === 'number' && value >= 0) {
    await execute(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?`,
      [key, value.toString(), value.toString()]
    );
  }
};

// PATCH /api/settings - Update system settings (admin only)
router.patch('/', authenticate, requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { searchCost, defaultCredits, cloudVisionCost } = req.body;

    await Promise.all([
      upsertSetting('search_cost', searchCost),
      upsertSetting('default_credits', defaultCredits),
      upsertSetting('cloud_vision_cost', cloudVisionCost),
    ]);

    const settings = await fetchSystemSettings();
    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
});

// ============ USER SETTINGS ============

// Helper: Fetch user's premium services settings
const fetchUserPremiumServices = async (userId: string): Promise<PremiumServiceInfo[]> => {
  const [userSettings, systemSettings] = await Promise.all([
    query<DbUserSetting[]>('SELECT * FROM user_settings WHERE user_id = ?', [userId]),
    query<DbSystemSetting[]>('SELECT * FROM system_settings')
  ]);

  const userObj = userSettings.reduce((o, s) => ({ ...o, [s.setting_key]: s.setting_value }), {} as Record<string, string>);
  const sysObj = settingsToObject(systemSettings);

  return PREMIUM_SERVICE_DEFS.map(svc => ({
    key: svc.key,
    name: svc.name,
    description: svc.description,
    cost: parseInt(sysObj[svc.costKey] || svc.defaultCost.toString()),
    enabled: userObj[svc.key] === 'true'
  }));
};

// GET /api/settings/user - Get current user's settings
router.get('/user', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const premiumServices = await fetchUserPremiumServices(req.userId!);
    res.json({ success: true, settings: { premiumServices } });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/settings/user - Update current user's settings
router.patch('/user', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { premiumServices } = req.body;
    const validKeys = PREMIUM_SERVICE_DEFS.map(s => s.key);

    if (premiumServices && typeof premiumServices === 'object') {
      const updates = Object.entries(premiumServices)
        .filter(([key]) => validKeys.includes(key))
        .map(([key, enabled]) =>
          execute(
            `INSERT INTO user_settings (user_id, setting_key, setting_value)
             VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?`,
            [req.userId, key, String(enabled), String(enabled)]
          )
        );
      await Promise.all(updates);
    }

    const updatedServices = await fetchUserPremiumServices(req.userId!);
    res.json({ success: true, settings: { premiumServices: updatedServices } });
  } catch (error) {
    next(error);
  }
});

export default router;

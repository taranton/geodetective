import { Router } from 'express';
import { query, execute } from '../db/connection.js';
import { DbSystemSetting } from '../db/models.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/settings - Get system settings (public)
router.get('/', async (req, res, next) => {
  try {
    const settings = await query<DbSystemSetting[]>(
      'SELECT * FROM system_settings'
    );

    const settingsObj: Record<string, string> = {};
    settings.forEach(s => {
      settingsObj[s.setting_key] = s.setting_value;
    });

    res.json({
      success: true,
      settings: {
        searchCost: parseInt(settingsObj.search_cost || '10'),
        defaultCredits: parseInt(settingsObj.default_credits || '100')
      }
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/settings - Update system settings (admin only)
router.patch('/', authenticate, requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { searchCost, defaultCredits } = req.body;

    if (typeof searchCost === 'number' && searchCost >= 0) {
      await execute(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ('search_cost', ?)
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [searchCost.toString(), searchCost.toString()]
      );
    }

    if (typeof defaultCredits === 'number' && defaultCredits >= 0) {
      await execute(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ('default_credits', ?)
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [defaultCredits.toString(), defaultCredits.toString()]
      );
    }

    // Return updated settings
    const settings = await query<DbSystemSetting[]>(
      'SELECT * FROM system_settings'
    );

    const settingsObj: Record<string, string> = {};
    settings.forEach(s => {
      settingsObj[s.setting_key] = s.setting_value;
    });

    res.json({
      success: true,
      settings: {
        searchCost: parseInt(settingsObj.search_cost || '10'),
        defaultCredits: parseInt(settingsObj.default_credits || '100')
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;

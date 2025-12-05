import { Router } from 'express';
import { queryOne, execute } from '../db/connection.js';
import { DbUser, DbSystemSetting } from '../db/models.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { analyzeImageLocation, refineImageLocation } from '../services/geminiService.js';

const router = Router();

router.use(authenticate);

// POST /api/analyze - Analyze image(s) for geolocation
router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { images, hints } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      throw createError('At least one image is required', 400, 'NO_IMAGES');
    }

    if (images.length > 4) {
      throw createError('Maximum 4 images allowed', 400, 'TOO_MANY_IMAGES');
    }

    // Get search cost
    const costSetting = await queryOne<DbSystemSetting>(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['search_cost']
    );
    const searchCost = costSetting ? parseInt(costSetting.setting_value) : 10;

    // Check user credits
    const user = await queryOne<DbUser>(
      'SELECT * FROM users WHERE id = ?',
      [req.userId]
    );

    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.credits < searchCost) {
      throw createError(
        `Insufficient credits. Need ${searchCost}, have ${user.credits}`,
        402,
        'INSUFFICIENT_CREDITS'
      );
    }

    // Deduct credits
    await execute(
      'UPDATE users SET credits = credits - ? WHERE id = ?',
      [searchCost, req.userId]
    );

    // Perform analysis
    const result = await analyzeImageLocation(images, hints);

    // Return result with updated credits
    const updatedUser = await queryOne<DbUser>(
      'SELECT credits FROM users WHERE id = ?',
      [req.userId]
    );

    res.json({
      success: true,
      result,
      creditsRemaining: updatedUser?.credits || 0,
      cost: searchCost
    });
  } catch (error: any) {
    // Refund credits on error (if already deducted)
    if (error.code !== 'INSUFFICIENT_CREDITS' && req.userId) {
      try {
        const costSetting = await queryOne<DbSystemSetting>(
          'SELECT setting_value FROM system_settings WHERE setting_key = ?',
          ['search_cost']
        );
        const searchCost = costSetting ? parseInt(costSetting.setting_value) : 10;
        await execute(
          'UPDATE users SET credits = credits + ? WHERE id = ?',
          [searchCost, req.userId]
        );
      } catch (refundError) {
        console.error('Failed to refund credits:', refundError);
      }
    }
    next(error);
  }
});

// POST /api/analyze/refine - Refine analysis with user feedback
router.post('/refine', async (req: AuthRequest, res, next) => {
  try {
    const { images, previousResult, userFeedback, hints } = req.body;

    if (!previousResult || !userFeedback) {
      throw createError('Previous result and feedback required', 400, 'MISSING_DATA');
    }

    // Refinement is free (credits already spent on initial analysis)
    const result = await refineImageLocation(images, previousResult, userFeedback, hints);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    next(error);
  }
});

export default router;

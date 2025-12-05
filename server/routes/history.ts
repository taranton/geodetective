import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, execute } from '../db/connection.js';
import { DbSearchHistory, dbHistoryToItem } from '../db/models.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// GET /api/history - Get user's search history
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Note: LIMIT and OFFSET are interpolated directly (safe - they're validated integers)
    const history = await query<DbSearchHistory[]>(
      `SELECT * FROM search_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [req.userId]
    );

    res.json({
      success: true,
      history: history.map(dbHistoryToItem)
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/history/:id - Delete a history item
router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    // Verify the item belongs to the user
    const [item] = await query<DbSearchHistory[]>(
      'SELECT id FROM search_history WHERE id = ? AND user_id = ?',
      [id, req.userId]
    );

    if (!item) {
      return next(createError('History item not found', 404));
    }

    await execute('DELETE FROM search_history WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/history - Add new search to history
router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const {
      locationName,
      coordinates,
      confidenceScore,
      reasoning,
      visualCues,
      sources,
      cost
    } = req.body;

    const id = uuidv4();

    await execute(
      `INSERT INTO search_history
       (id, user_id, location_name, lat, lng, confidence_score, reasoning, visual_cues, sources, cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.userId,
        locationName || null,
        coordinates?.lat || null,
        coordinates?.lng || null,
        confidenceScore || null,
        reasoning ? JSON.stringify(reasoning) : null,
        visualCues ? JSON.stringify(visualCues) : null,
        sources ? JSON.stringify(sources) : null,
        cost || 10
      ]
    );

    res.status(201).json({
      success: true,
      id
    });
  } catch (error) {
    next(error);
  }
});

export default router;

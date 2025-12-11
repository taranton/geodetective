import { Router } from 'express';
import { query, queryOne, execute } from '../db/connection.js';
import { DbUser, DbSystemSetting, DbUserSetting, PREMIUM_SERVICES } from '../db/models.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { analyzeImageLocation, refineImageLocation } from '../services/geminiService.js';
import {
  extractExifFromMultiple,
  validateGpsCoordinates,
  formatGpsForPrompt,
  ExifResult
} from '../services/exifService.js';
import {
  performWebDetection,
  formatVisionResultForPrompt,
  CloudVisionResult
} from '../services/cloudVisionService.js';
import {
  saveTempImage,
  deleteTempImage,
  getTempImageUrl,
  performGoogleLensSearch,
  formatSerpApiResultForPrompt,
  SerpApiResult
} from '../services/serpApiService.js';

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

    // === STEP 1: Extract EXIF data ===
    let exifData: { index: number; result: ExifResult } | null = null;
    let exifHint: string | null = null;

    try {
      exifData = await extractExifFromMultiple(images);
      if (exifData?.result.hasGps && exifData.result.gps) {
        const { latitude, longitude } = exifData.result.gps;
        if (validateGpsCoordinates(latitude, longitude)) {
          exifHint = formatGpsForPrompt(exifData.result.gps);
        }
      }
    } catch {
      // EXIF extraction is non-critical, continue without it
    }

    // === STEP 1.5: Check user's premium service settings ===
    const userSettings = await query<DbUserSetting[]>(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [req.userId]
    );
    const userSettingsMap: Record<string, string> = {};
    userSettings.forEach(s => {
      userSettingsMap[s.setting_key] = s.setting_value;
    });

    const cloudVisionEnabled = userSettingsMap[PREMIUM_SERVICES.CLOUD_VISION] === 'true';
    const serpApiEnabled = userSettingsMap[PREMIUM_SERVICES.SERP_API] === 'true';

    // === STEP 1.6: Perform Cloud Vision if enabled ===
    let cloudVisionResult: CloudVisionResult | null = null;
    let cloudVisionHint: string | null = null;

    if (cloudVisionEnabled) {
      console.log('[CloudVision] Cloud Vision enabled, performing web detection...');
      try {
        cloudVisionResult = await performWebDetection(images[0].base64);
        cloudVisionHint = formatVisionResultForPrompt(cloudVisionResult);
        console.log('[CloudVision] Success! Found:');
        console.log(`  Best guess: ${cloudVisionResult.bestGuessLabels.join(', ') || '(none)'}`);
        console.log(`  Location hints: ${cloudVisionResult.locationHints.join(', ') || '(none)'}`);
        console.log(`  Pages with matches: ${cloudVisionResult.pagesWithMatchingImages.length}`);
        console.log(`  Web entities: ${cloudVisionResult.webEntities.slice(0, 5).map(e => e.description).join(', ')}`);
      } catch (err: any) {
        console.error('Cloud Vision API error:', err.message || err);
        // Cloud Vision is non-critical, continue without it
      }
    } else {
      console.log('[CloudVision] Cloud Vision not enabled for this user');
    }

    // === STEP 1.7: Perform SerpAPI Google Lens if enabled ===
    let serpApiResult: SerpApiResult | null = null;
    let serpApiHint: string | null = null;
    let tempImageFilename: string | null = null;

    if (serpApiEnabled) {
      console.log('[SerpAPI] Google Lens enabled, performing reverse image search...');
      try {
        // Save image temporarily
        tempImageFilename = saveTempImage(images[0].base64);

        // Get server base URL (from env or construct from request)
        const serverBaseUrl = process.env.SERVER_PUBLIC_URL || `http://${req.headers.host}`;
        const imageUrl = getTempImageUrl(tempImageFilename, serverBaseUrl);

        console.log('[SerpAPI] Temp image URL:', imageUrl);

        // Perform Google Lens search
        serpApiResult = await performGoogleLensSearch(imageUrl);
        serpApiHint = formatSerpApiResultForPrompt(serpApiResult);

        console.log('[SerpAPI] Success! Found:');
        console.log(`  Visual matches: ${serpApiResult.visualMatches.length}`);
        console.log(`  Knowledge graph: ${serpApiResult.knowledgeGraph?.title || '(none)'}`);
        console.log(`  Location hints: ${serpApiResult.locationHints.slice(0, 5).join(', ') || '(none)'}`);

        // Clean up temp image
        if (tempImageFilename) {
          deleteTempImage(tempImageFilename);
          tempImageFilename = null;
        }
      } catch (err: any) {
        console.error('[SerpAPI] Error:', err.message || err);
        // Clean up on error
        if (tempImageFilename) {
          deleteTempImage(tempImageFilename);
        }
        // SerpAPI is non-critical, continue without it
      }
    } else {
      console.log('[SerpAPI] Google Lens not enabled for this user');
    }

    // Get search cost
    const costSetting = await queryOne<DbSystemSetting>(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['search_cost']
    );
    const searchCost = costSetting ? parseInt(costSetting.setting_value) : 10;

    // Get Cloud Vision cost if enabled
    let cloudVisionCost = 0;
    if (cloudVisionEnabled) {
      const visionCostSetting = await queryOne<DbSystemSetting>(
        'SELECT setting_value FROM system_settings WHERE setting_key = ?',
        ['cloud_vision_cost']
      );
      cloudVisionCost = visionCostSetting ? parseInt(visionCostSetting.setting_value) : 5;
    }

    // Get SerpAPI cost if enabled
    let serpApiCost = 0;
    if (serpApiEnabled) {
      const serpApiCostSetting = await queryOne<DbSystemSetting>(
        'SELECT setting_value FROM system_settings WHERE setting_key = ?',
        ['serp_api_cost']
      );
      serpApiCost = serpApiCostSetting ? parseInt(serpApiCostSetting.setting_value) : 10;
    }

    const totalCost = searchCost + cloudVisionCost + serpApiCost;

    // Check user credits
    const user = await queryOne<DbUser>(
      'SELECT * FROM users WHERE id = ?',
      [req.userId]
    );

    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.credits < totalCost) {
      throw createError(
        `Insufficient credits. Need ${totalCost}, have ${user.credits}`,
        402,
        'INSUFFICIENT_CREDITS'
      );
    }

    // Deduct credits
    await execute(
      'UPDATE users SET credits = credits - ? WHERE id = ?',
      [totalCost, req.userId]
    );

    // === STEP 2: Perform AI analysis (with EXIF and reverse image search hints if available) ===
    // Prefer SerpAPI (Google Lens) over Cloud Vision as it provides actual reverse image search
    const reverseSearchHint = serpApiHint || cloudVisionHint;

    const enhancedHints = {
      ...hints,
      exifGps: exifHint, // Pass EXIF data to Gemini
      reverseImageSearch: reverseSearchHint // Pass reverse image search results to Gemini
    };
    const result = await analyzeImageLocation(images, enhancedHints);

    // If EXIF had coordinates but AI didn't use them, add them
    if (exifData?.result.hasGps && exifData.result.gps && !result.coordinates) {
      result.coordinates = {
        lat: exifData.result.gps.latitude,
        lng: exifData.result.gps.longitude
      };
      result.reasoning.unshift('Location coordinates extracted from image EXIF metadata.');
      result.confidenceScore = Math.max(result.confidenceScore, 85);
    }

    // Return result with updated credits
    const updatedUser = await queryOne<DbUser>(
      'SELECT credits FROM users WHERE id = ?',
      [req.userId]
    );

    res.json({
      success: true,
      result,
      exifData: exifData?.result || null,
      cloudVisionData: cloudVisionResult,
      serpApiData: serpApiResult,
      creditsRemaining: updatedUser?.credits || 0,
      cost: totalCost
    });
  } catch (error: any) {
    // Refund credits on error (if already deducted)
    // Note: We try to refund the total cost that was charged
    if (error.code !== 'INSUFFICIENT_CREDITS' && req.userId) {
      try {
        // Get costs to calculate refund amount
        const [searchCostSetting, visionCostSetting, serpApiCostSetting] = await Promise.all([
          queryOne<DbSystemSetting>('SELECT setting_value FROM system_settings WHERE setting_key = ?', ['search_cost']),
          queryOne<DbSystemSetting>('SELECT setting_value FROM system_settings WHERE setting_key = ?', ['cloud_vision_cost']),
          queryOne<DbSystemSetting>('SELECT setting_value FROM system_settings WHERE setting_key = ?', ['serp_api_cost'])
        ]);
        const userSettings = await query<DbUserSetting[]>('SELECT * FROM user_settings WHERE user_id = ?', [req.userId]);
        const visionEnabled = userSettings.some(s => s.setting_key === PREMIUM_SERVICES.CLOUD_VISION && s.setting_value === 'true');
        const serpEnabled = userSettings.some(s => s.setting_key === PREMIUM_SERVICES.SERP_API && s.setting_value === 'true');

        const searchCost = searchCostSetting ? parseInt(searchCostSetting.setting_value) : 10;
        const visionCost = visionEnabled && visionCostSetting ? parseInt(visionCostSetting.setting_value) : 0;
        const serpCost = serpEnabled && serpApiCostSetting ? parseInt(serpApiCostSetting.setting_value) : 0;
        const refundAmount = searchCost + visionCost + serpCost;

        await execute(
          'UPDATE users SET credits = credits + ? WHERE id = ?',
          [refundAmount, req.userId]
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

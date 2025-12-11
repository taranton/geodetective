/**
 * Route for serving temporary images for SerpAPI
 * These images are short-lived and auto-deleted
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const TEMP_DIR = path.join(__dirname, '..', 'temp-images');

// Serve temp images (no auth required - SerpAPI needs to access them)
router.get('/:filename', (req, res) => {
  const { filename } = req.params;

  // Security: only allow specific file patterns
  if (!/^[a-f0-9]{32}\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filepath = path.join(TEMP_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

  // Set appropriate content type
  const ext = path.extname(filename).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  };

  res.setHeader('Content-Type', contentTypes[ext] || 'image/jpeg');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const stream = fs.createReadStream(filepath);
  stream.pipe(res);
});

export default router;

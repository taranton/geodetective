/**
 * SerpAPI Google Lens Service
 * Performs real reverse image search using Google Lens via SerpAPI
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory for temporary images
const TEMP_DIR = path.join(__dirname, '..', 'temp-images');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export interface SerpApiVisualMatch {
  position: number;
  title: string;
  link: string;
  source: string;
  sourceIcon?: string;
  thumbnail?: string;
}

export interface SerpApiKnowledgeGraph {
  title?: string;
  subtitle?: string;
  description?: string;
  moreInfo?: Array<{
    label: string;
    value: string;
  }>;
}

export interface SerpApiResult {
  visualMatches: SerpApiVisualMatch[];
  knowledgeGraph?: SerpApiKnowledgeGraph;
  relatedSearches: string[];
  textResults: string[];  // Extracted text from the image
  locationHints: string[];  // Location-related info extracted from results
  rawTitle?: string;  // Main title from search results
}

const SERPAPI_URL = 'https://serpapi.com/search';

/**
 * Save base64 image to temp file and return filename
 */
export function saveTempImage(base64Image: string): string {
  const id = crypto.randomBytes(16).toString('hex');
  const filename = `${id}.jpg`;
  const filepath = path.join(TEMP_DIR, filename);

  // Remove data URL prefix if present
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

  fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));

  return filename;
}

/**
 * Delete temp image file
 */
export function deleteTempImage(filename: string): void {
  const filepath = path.join(TEMP_DIR, filename);
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch (err) {
    console.error('Failed to delete temp image:', err);
  }
}

/**
 * Get the public URL for a temp image
 */
export function getTempImageUrl(filename: string, serverBaseUrl: string): string {
  return `${serverBaseUrl}/api/temp-images/${filename}`;
}

// List of known countries (for pattern matching)
const KNOWN_COUNTRIES = new Set([
  'poland', 'germany', 'france', 'italy', 'spain', 'russia', 'ukraine', 'uk', 'england',
  'usa', 'canada', 'china', 'japan', 'india', 'brazil', 'australia', 'mexico', 'netherlands',
  'belgium', 'austria', 'switzerland', 'sweden', 'norway', 'denmark', 'finland', 'czech',
  'czechia', 'slovakia', 'hungary', 'romania', 'bulgaria', 'greece', 'turkey', 'portugal',
  'ireland', 'scotland', 'wales', 'croatia', 'serbia', 'slovenia', 'estonia', 'latvia',
  'lithuania', 'belarus', 'moldova', 'georgia', 'armenia', 'azerbaijan', 'kazakhstan',
  'argentina', 'chile', 'colombia', 'peru', 'venezuela', 'egypt', 'morocco', 'south africa',
  'kenya', 'nigeria', 'thailand', 'vietnam', 'indonesia', 'malaysia', 'singapore', 'philippines',
  'south korea', 'korea', 'taiwan', 'hong kong', 'israel', 'iran', 'iraq', 'saudi arabia',
  'uae', 'emirates', 'qatar', 'pakistan', 'bangladesh', 'sri lanka', 'new zealand'
]);

// Common non-location words to filter out
const NOISE_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'at', 'on', 'for', 'to', 'with', 'by', 'from', 'and', 'or',
  'stock', 'photo', 'image', 'picture', 'alamy', 'getty', 'shutterstock', 'dreamstime',
  'free', 'high', 'low', 'resolution', 'quality', 'hd', 'download', 'royalty', 'editorial',
  'vector', 'illustration', 'background', 'wallpaper', 'beautiful', 'amazing', 'stunning',
  'view', 'scene', 'night', 'day', 'summer', 'winter', 'spring', 'autumn', 'fall',
  'old', 'new', 'ancient', 'modern', 'historic', 'historical', 'famous', 'popular',
  'red', 'blue', 'green', 'white', 'black', 'yellow', 'orange', 'pink', 'purple',
  'very', 'best', 'top', 'great', 'nice', 'good', 'big', 'small', 'large', 'little'
]);

/**
 * Extract location hints from visual matches - improved version
 */
function extractLocationHints(matches: SerpApiVisualMatch[]): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const title = match.title;

    // Pattern 1: "X, Country" or "X Country" (e.g., "Szczecin, Poland", "Szczecin Poland")
    for (const country of KNOWN_COUNTRIES) {
      const countryPatterns = [
        new RegExp(`([A-Z][a-zA-Zа-яёА-ЯЁ\\s-]+),?\\s+${country}`, 'i'),
        new RegExp(`${country},?\\s+([A-Z][a-zA-Zа-яёА-ЯЁ\\s-]+)`, 'i'),
      ];

      for (const pattern of countryPatterns) {
        const m = title.match(pattern);
        if (m && m[1]) {
          const city = m[1].trim().replace(/[,\s]+$/, '');
          const cityLower = city.toLowerCase();
          if (city.length > 2 && !NOISE_WORDS.has(cityLower) && !seen.has(cityLower)) {
            seen.add(cityLower);
            hints.push(city);
          }
        }
      }

      // Also add the country if mentioned
      if (title.toLowerCase().includes(country) && !seen.has(country)) {
        seen.add(country);
        hints.push(country.charAt(0).toUpperCase() + country.slice(1));
      }
    }

    // Pattern 2: "in [City]" or "at [City]"
    const inAtPattern = /(?:in|at|near)\s+([A-Z][a-zA-Zа-яёА-ЯЁ]+(?:\s+[A-Z][a-zA-Zа-яёА-ЯЁ]+)?)/gi;
    let m;
    while ((m = inAtPattern.exec(title)) !== null) {
      const loc = m[1].trim();
      const locLower = loc.toLowerCase();
      if (loc.length > 2 && !NOISE_WORDS.has(locLower) && !seen.has(locLower)) {
        seen.add(locLower);
        hints.push(loc);
      }
    }
  }

  return hints.slice(0, 10);
}


/**
 * Perform reverse image search using SerpAPI Google Lens
 */
export async function performGoogleLensSearch(
  imageUrl: string,
  apiKey?: string
): Promise<SerpApiResult> {
  const key = apiKey || process.env.SERPAPI_KEY;

  if (!key) {
    throw new Error('SerpAPI key not configured');
  }

  console.log('[SerpAPI] Calling Google Lens with URL:', imageUrl);

  const params = new URLSearchParams({
    engine: 'google_lens',
    url: imageUrl,
    api_key: key
  });

  const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);

  if (!response.ok) {
    const error = await response.text();
    console.error('[SerpAPI] Error:', error);
    throw new Error(`SerpAPI error: ${response.status}`);
  }

  const data = await response.json();

  // Parse visual matches
  const visualMatches: SerpApiVisualMatch[] = (data.visual_matches || []).map((m: any, i: number) => ({
    position: i + 1,
    title: m.title || '',
    link: m.link || '',
    source: m.source || '',
    sourceIcon: m.source_icon || '',
    thumbnail: m.thumbnail || ''
  }));

  // Parse knowledge graph
  let knowledgeGraph: SerpApiKnowledgeGraph | undefined;
  if (data.knowledge_graph) {
    knowledgeGraph = {
      title: data.knowledge_graph.title,
      subtitle: data.knowledge_graph.subtitle,
      description: data.knowledge_graph.description,
      moreInfo: data.knowledge_graph.more_info?.map((info: any) => ({
        label: info.label || '',
        value: info.value || ''
      }))
    };
  }

  // Parse related searches
  const relatedSearches: string[] = (data.related_searches || [])
    .map((s: any) => s.query || '')
    .filter((q: string) => q.length > 0);

  // Parse text results (OCR)
  const textResults: string[] = [];
  if (data.text_results) {
    for (const t of data.text_results) {
      if (t.text) textResults.push(t.text);
    }
  }

  // Extract location hints from all data
  const locationHints = extractLocationHints(visualMatches);

  // Add knowledge graph title if present
  if (knowledgeGraph?.title && !locationHints.includes(knowledgeGraph.title)) {
    locationHints.unshift(knowledgeGraph.title);
  }

  // Log results
  console.log('[SerpAPI] Results:');
  console.log(`  Visual matches: ${visualMatches.length}`);
  console.log(`  Knowledge graph: ${knowledgeGraph?.title || '(none)'}`);
  console.log(`  Related searches: ${relatedSearches.slice(0, 3).join(', ')}`);
  console.log(`  Location hints: ${locationHints.slice(0, 5).join(', ')}`);

  return {
    visualMatches,
    knowledgeGraph,
    relatedSearches,
    textResults,
    locationHints,
    rawTitle: knowledgeGraph?.title || visualMatches[0]?.title
  };
}

/**
 * Format SerpAPI results as a hint string for Gemini
 */
export function formatSerpApiResultForPrompt(result: SerpApiResult): string {
  const parts: string[] = [];

  // Add strong priority indicator
  const matchCount = result.visualMatches.length;
  if (matchCount > 10) {
    parts.push(`**IMPORTANT: This exact image was found ${matchCount} times online. The locations mentioned in these matches are HIGHLY RELIABLE.**`);
  }

  // Knowledge graph is the most reliable
  if (result.knowledgeGraph?.title) {
    parts.push(`**IDENTIFIED SUBJECT (HIGH CONFIDENCE)**: ${result.knowledgeGraph.title}`);
    if (result.knowledgeGraph.subtitle) {
      parts.push(`**Details**: ${result.knowledgeGraph.subtitle}`);
    }
    if (result.knowledgeGraph.description) {
      parts.push(`**Description**: ${result.knowledgeGraph.description}`);
    }
  }

  // Visual matches are crucial for location identification
  if (result.visualMatches.length > 0) {
    const topMatches = result.visualMatches
      .slice(0, 10)
      .map(m => `- ${m.title} (${m.source})`)
      .join('\n');
    parts.push(`**EXACT VISUAL MATCHES FOUND ONLINE (these pages contain THIS image)**:\n${topMatches}`);
  }

  // Location hints - extracted locations
  if (result.locationHints.length > 0) {
    parts.push(`**LOCATIONS MENTIONED IN MATCHES**: ${result.locationHints.join(', ')}`);
  }

  // Related searches give context
  if (result.relatedSearches.length > 0) {
    parts.push(`**Related Searches**: ${result.relatedSearches.slice(0, 5).join(', ')}`);
  }

  // Text found in image
  if (result.textResults.length > 0) {
    parts.push(`**Text Detected in Image**: ${result.textResults.slice(0, 5).join(', ')}`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `\n\n**=== GOOGLE LENS REVERSE IMAGE SEARCH - AUTHORITATIVE RESULTS ===**\n${parts.join('\n\n')}`;
}

/**
 * Cleanup old temp images (older than 10 minutes)
 */
export function cleanupOldTempImages(): void {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes

  try {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const filepath = path.join(TEMP_DIR, file);
      const stat = fs.statSync(filepath);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filepath);
        console.log('[SerpAPI] Cleaned up old temp image:', file);
      }
    }
  } catch (err) {
    console.error('[SerpAPI] Error cleaning up temp images:', err);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldTempImages, 5 * 60 * 1000);

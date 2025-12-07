/**
 * Google Cloud Vision API Service
 * Performs reverse image search using Web Detection
 */

export interface WebEntity {
  entityId: string;
  score: number;
  description: string;
}

export interface WebPage {
  url: string;
  pageTitle?: string;
  score?: number;
}

export interface WebImage {
  url: string;
  score?: number;
}

export interface CloudVisionResult {
  webEntities: WebEntity[];
  pagesWithMatchingImages: WebPage[];
  visuallySimilarImages: WebImage[];
  bestGuessLabels: string[];
  locationHints: string[];  // Extracted location-related entities
}

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

/**
 * Perform web detection on an image using Google Cloud Vision API
 */
export async function performWebDetection(
  base64Image: string,
  apiKey?: string
): Promise<CloudVisionResult> {
  const key = apiKey || process.env.GOOGLE_CLOUD_VISION_API_KEY || process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error('Google Cloud Vision API key not configured');
  }

  const requestBody = {
    requests: [
      {
        image: {
          content: base64Image
        },
        features: [
          {
            type: 'WEB_DETECTION',
            maxResults: 20
          }
        ]
      }
    ]
  };

  const response = await fetch(`${VISION_API_URL}?key=${key}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Cloud Vision API error:', error);
    throw new Error(`Cloud Vision API error: ${response.status}`);
  }

  const data = await response.json();
  const webDetection = data.responses?.[0]?.webDetection;

  if (!webDetection) {
    return {
      webEntities: [],
      pagesWithMatchingImages: [],
      visuallySimilarImages: [],
      bestGuessLabels: [],
      locationHints: []
    };
  }

  // Extract web entities
  const webEntities: WebEntity[] = (webDetection.webEntities || []).map((e: any) => ({
    entityId: e.entityId || '',
    score: e.score || 0,
    description: e.description || ''
  }));

  // Extract pages with matching images
  const pagesWithMatchingImages: WebPage[] = (webDetection.pagesWithMatchingImages || []).map((p: any) => ({
    url: p.url || '',
    pageTitle: p.pageTitle || '',
    score: p.score || 0
  }));

  // Extract visually similar images
  const visuallySimilarImages: WebImage[] = (webDetection.visuallySimilarImages || []).map((i: any) => ({
    url: i.url || '',
    score: i.score || 0
  }));

  // Extract best guess labels
  const bestGuessLabels: string[] = (webDetection.bestGuessLabels || []).map((l: any) => l.label || '');

  // Extract location-related hints from entities and labels
  const locationKeywords = [
    'city', 'town', 'village', 'country', 'state', 'province', 'region',
    'street', 'avenue', 'road', 'boulevard', 'square', 'plaza',
    'monument', 'landmark', 'building', 'tower', 'bridge', 'station',
    'park', 'beach', 'mountain', 'river', 'lake'
  ];

  const locationHints: string[] = [];

  // Check entities for location-like descriptions
  for (const entity of webEntities) {
    if (entity.description && entity.score > 0.3) {
      const desc = entity.description.toLowerCase();
      // Check if it looks like a place name (capitalized, contains location keywords)
      if (locationKeywords.some(kw => desc.includes(kw)) ||
          /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(entity.description)) {
        locationHints.push(entity.description);
      }
    }
  }

  // Add best guess labels that look like locations
  for (const label of bestGuessLabels) {
    if (!locationHints.includes(label)) {
      locationHints.push(label);
    }
  }

  return {
    webEntities,
    pagesWithMatchingImages,
    visuallySimilarImages,
    bestGuessLabels,
    locationHints: locationHints.slice(0, 10)  // Limit to top 10
  };
}

/**
 * Format Cloud Vision results as a hint string for Gemini
 */
export function formatVisionResultForPrompt(result: CloudVisionResult): string {
  const parts: string[] = [];

  if (result.bestGuessLabels.length > 0) {
    parts.push(`**Best Guess**: ${result.bestGuessLabels.join(', ')}`);
  }

  if (result.locationHints.length > 0) {
    parts.push(`**Location-related entities**: ${result.locationHints.join(', ')}`);
  }

  if (result.pagesWithMatchingImages.length > 0) {
    const pageInfo = result.pagesWithMatchingImages
      .slice(0, 5)
      .map(p => p.pageTitle || new URL(p.url).hostname)
      .join('; ');
    parts.push(`**Found on pages**: ${pageInfo}`);
  }

  if (result.webEntities.length > 0) {
    const topEntities = result.webEntities
      .filter(e => e.score > 0.5 && e.description)
      .slice(0, 10)
      .map(e => e.description)
      .join(', ');
    if (topEntities) {
      parts.push(`**Related entities**: ${topEntities}`);
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return `\n\n**REVERSE IMAGE SEARCH RESULTS (Google Cloud Vision)**:\n${parts.join('\n')}`;
}

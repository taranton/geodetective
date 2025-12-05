import exifr from 'exifr';

export interface ExifGpsData {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp?: Date;
  make?: string;      // Camera manufacturer
  model?: string;     // Camera model
  software?: string;  // Software used
}

export interface ExifResult {
  hasGps: boolean;
  gps: ExifGpsData | null;
  allMetadata: Record<string, any> | null;
  warning?: string;
}

/**
 * Extract EXIF data from base64-encoded image
 * Returns GPS coordinates if available
 */
export async function extractExifData(base64Data: string, mimeType: string): Promise<ExifResult> {
  try {
    // Convert base64 to Buffer
    const buffer = Buffer.from(base64Data, 'base64');

    console.log(`[EXIF] Processing image: ${mimeType}, size: ${buffer.length} bytes`);

    // Parse EXIF data - enable HEIC support
    const exif = await exifr.parse(buffer, {
      gps: true,
      tiff: true,
      exif: true,
      icc: false,
      iptc: false,
      xmp: false,
      // Don't pick - get all GPS-related tags
      // HEIC files store GPS differently sometimes
    });

    if (!exif) {
      console.log('[EXIF] No EXIF metadata found');
      return {
        hasGps: false,
        gps: null,
        allMetadata: null,
        warning: 'No EXIF metadata found in image'
      };
    }

    console.log('[EXIF] Metadata found:', Object.keys(exif));

    // Check for GPS data - HEIC might use different property names
    const lat = exif.latitude ?? exif.GPSLatitude;
    const lng = exif.longitude ?? exif.GPSLongitude;
    const hasGps = lat !== undefined && lng !== undefined;

    console.log(`[EXIF] GPS check: lat=${lat}, lng=${lng}, hasGps=${hasGps}`);

    if (hasGps) {
      return {
        hasGps: true,
        gps: {
          latitude: lat,
          longitude: lng,
          altitude: exif.GPSAltitude ?? exif.altitude,
          timestamp: exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate,
          make: exif.Make,
          model: exif.Model,
          software: exif.Software
        },
        allMetadata: exif
      };
    }

    return {
      hasGps: false,
      gps: null,
      allMetadata: exif,
      warning: 'Image has EXIF data but no GPS coordinates'
    };

  } catch (error) {
    console.error('EXIF extraction error:', error);
    return {
      hasGps: false,
      gps: null,
      allMetadata: null,
      warning: `Failed to extract EXIF: ${(error as Error).message}`
    };
  }
}

/**
 * Extract EXIF from multiple images
 * Returns the first image that has GPS data, or null
 */
export async function extractExifFromMultiple(
  images: { base64: string; mimeType: string }[]
): Promise<{ index: number; result: ExifResult } | null> {

  for (let i = 0; i < images.length; i++) {
    const result = await extractExifData(images[i].base64, images[i].mimeType);
    if (result.hasGps) {
      return { index: i, result };
    }
  }

  return null;
}

/**
 * Check if GPS coordinates look legitimate (not 0,0 or other suspicious values)
 */
export function validateGpsCoordinates(lat: number, lng: number): boolean {
  // Check for null island (0,0) - common placeholder
  if (lat === 0 && lng === 0) return false;

  // Check valid ranges
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;

  return true;
}

/**
 * Get reverse geocoding info hint from coordinates (for prompts)
 */
export function formatGpsForPrompt(gps: ExifGpsData): string {
  let info = `EXIF GPS found: ${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`;

  if (gps.altitude) {
    info += ` at ${gps.altitude.toFixed(0)}m altitude`;
  }

  if (gps.timestamp) {
    info += `. Photo taken: ${gps.timestamp.toISOString()}`;
  }

  if (gps.make || gps.model) {
    info += `. Camera: ${[gps.make, gps.model].filter(Boolean).join(' ')}`;
  }

  return info;
}

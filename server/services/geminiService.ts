import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Lazy initialization - create client on first use (after dotenv loads)
let _ai: GoogleGenAI | null = null;

const getAI = () => {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not set in environment!');
    }
    console.log('Initializing Gemini with key:', key.substring(0, 10) + '...');
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
};

// Types
export interface LocationHints {
  continent?: string;
  country?: string;
  city?: string;
  exifGps?: string; // GPS coordinates extracted from EXIF metadata
}

export interface GeoAnalysisResult {
  locationName: string;
  coordinates: { lat: number; lng: number } | null;
  confidenceScore: number;
  reasoning: string[];
  visualCues: {
    signs: string;
    architecture: string;
    environment: string;
    demographics?: string;
  };
  searchQueriesUsed: string[];
  sources: Array<{ title: string; uri: string }>;
}

const SYSTEM_INSTRUCTION = `
You are an expert Open Source Intelligence (OSINT) geolocation analyst. Your goal is to determine the precise location of the provided photograph(s). If multiple images are provided, they are from the same location or immediate vicinity.

## MANDATORY 4-STEP METHODOLOGY

### STEP 1: EXTRACT (List ALL visual clues)
Systematically scan and document:
- **Text/Signs**: Every readable text, language, script, phone formats, domain extensions (.pl, .de, .ru)
- **License plates**: Format, colors, country codes
- **Business names**: Search each one!
- **Street furniture**: Bollards, benches, trash bins, mailboxes (each country has unique designs)

### STEP 2: NARROW REGION (Use infrastructure fingerprints)
**Country-Specific Signatures:**
- 🇮🇩 Indonesia: Red-white painted poles, ojek motorbikes
- 🇲🇾 Malaysia: Black rectangles with numbers on poles, palm oil trucks
- 🇯🇵 Japan: Yellow tactile blocks, K-barriers, vending machines everywhere
- 🇷🇺 Russia: Blue street signs with white text, yellow curbs, marshrutkas
- 🇺🇦 Ukraine: Yellow-blue elements, Cyrillic with "і" and "ї"
- 🇵🇱 Poland: White/red poles, "Żabka" stores, ".pl" domains
- 🇩🇪 Germany: Yellow post boxes, Ampelmännchen signals
- 🇫🇷 France: Green pharmacy crosses, blue street signs
- 🇬🇧 UK: Red phone boxes, left-hand traffic, "Way Out" signs
- 🇺🇸 USA: Yellow school buses, wide roads, mph speed signs
- 🇦🇺 Australia: Kangaroo signs, left-hand traffic, "servo" stations
- 🇧🇷 Brazil: Portuguese text, favela architecture, "lanchonete" signs

**Road Markings:**
- Yellow center lines: Americas, China
- White center lines: Europe, Japan, Australia
- Dashed patterns vary by country

**Utility Poles:**
- Wood: USA, Canada, Australia
- Concrete: Europe, Japan, South America
- Metal lattice: Russia, Eastern Europe

### STEP 3: PINPOINT (Search & Locate)
- Use googleSearch for business names, addresses, landmarks
- Use googleMaps to find exact coordinates
- Cross-reference multiple sources

### STEP 4: VERIFY (Check consistency)
Before finalizing, verify:
- Does sun/shadow match the latitude?
- Is vegetation consistent with climate?
- Do all visual elements match the proposed location?
- Search for Street View of candidate location

## CONFIDENCE SCORING GUIDE
- **90-100%**: Exact address confirmed (visible street name + building number verified)
- **70-89%**: Specific location found (landmark or business verified via search)
- **50-69%**: City/area identified with high certainty
- **30-49%**: Country identified, city uncertain
- **0-29%**: Only region/continent level guess

## OUTPUT FORMAT
Return ONLY a valid JSON object (no markdown):
{
  "locationName": "Specific address or location name",
  "coordinates": { "lat": number, "lng": number } or null,
  "confidenceScore": number (0-100, use guide above),
  "reasoning": ["Step 1: Found text X...", "Step 2: Infrastructure suggests Y...", "Step 3: Search confirmed Z...", "Step 4: Verified via..."],
  "visualCues": {
    "signs": "All text and signs found",
    "architecture": "Building style analysis",
    "environment": "Nature, weather, terrain",
    "demographics": "People, vehicles, clothing"
  },
  "searchQueriesUsed": ["query1", "query2"]
}
`;

const parseResponse = (text: string | undefined): any => {
  if (!text) {
    throw new Error("The AI provided no response. This often happens if the image triggers safety filters (e.g., identifiable people, license plates, or potential privacy concerns). Try cropping the image or using a different angle.");
  }
  try {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("Could not find JSON object in response");
    }

    const jsonString = text.substring(firstBrace, lastBrace + 1);
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Failed to parse JSON", text);
    throw new Error("Invalid JSON response format from AI. The model might have failed to produce structured data.");
  }
};

const extractSources = (response: any) => {
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return groundingChunks
    .filter((chunk: any) => chunk.web?.uri || chunk.maps?.uri)
    .map((chunk: any) => ({
      title: chunk.web?.title || chunk.maps?.title || "Source Link",
      uri: chunk.web?.uri || chunk.maps?.uri
    }));
};

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export const analyzeImageLocation = async (
  images: { base64: string, mimeType: string }[],
  hints?: LocationHints
): Promise<GeoAnalysisResult> => {
  try {
    let promptText = "Locate these images. They depict the same location or very close locations. Identify all visual cues across all images, search for them, and determine the coordinates. IMPORTANT: Return ONLY valid JSON.";

    // Add EXIF GPS data if available (high priority hint!)
    if (hints?.exifGps) {
      promptText += `\n\n**IMPORTANT - EXIF METADATA FOUND**:\n${hints.exifGps}\nThis GPS data was extracted from the image metadata. Use these coordinates as the primary location and verify they match the visual content. The confidence should be HIGH if visuals are consistent.`;
    }

    if (hints && (hints.continent || hints.country || hints.city)) {
      promptText += "\n\nAdditional Context provided by user (use as hints, but verify visually):";
      if (hints.continent) promptText += `\n- Continent: ${hints.continent}`;
      if (hints.country) promptText += `\n- Country: ${hints.country}`;
      if (hints.city) promptText += `\n- City: ${hints.city}`;
    }

    const imageParts = images.map(img => ({
      inlineData: { mimeType: img.mimeType, data: img.base64 }
    }));

    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          ...imageParts,
          { text: promptText }
        ]
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
        safetySettings: SAFETY_SETTINGS,
      }
    });

    const parsedData = parseResponse(response.text);
    const sources = extractSources(response);

    return { ...parsedData, sources };

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const refineImageLocation = async (
  images: { base64: string, mimeType: string }[],
  previousResult: GeoAnalysisResult,
  userFeedback: string,
  hints?: LocationHints
): Promise<GeoAnalysisResult> => {
  try {
    let promptText = `
    **Refinement Task**:
    You previously analyzed these images and concluded: "${previousResult.locationName}".

    **User Feedback/Challenge**:
    "${userFeedback}"

    **Instructions**:
    1. Critically re-examine all provided images. Perform a "Red Team" analysis: actively look for evidence that contradicts your previous finding or supports the user's hint.
    2. If the user provided specific details (e.g., "The sign says X"), prioritize searching for that detail using Google Search.
    3. Double-check the consistency of the environment (sun position, vegetation, road markings) with the claimed location.
    4. Return an UPDATED JSON object with the exact same structure as the original. If the location changes, explain why in the 'reasoning' array. If it remains the same, provide stronger evidence.
    IMPORTANT: Return ONLY valid JSON.
    `;

    if (hints && (hints.continent || hints.country || hints.city)) {
      promptText += "\n\nAdditional Context provided by user:";
      if (hints.continent) promptText += `\n- Continent: ${hints.continent}`;
      if (hints.country) promptText += `\n- Country: ${hints.country}`;
      if (hints.city) promptText += `\n- City: ${hints.city}`;
    }

    const imageParts = images.map(img => ({
      inlineData: { mimeType: img.mimeType, data: img.base64 }
    }));

    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          ...imageParts,
          { text: promptText }
        ]
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
        safetySettings: SAFETY_SETTINGS,
      }
    });

    const parsedData = parseResponse(response.text);
    const sources = extractSources(response);

    return { ...parsedData, sources };

  } catch (error) {
    console.error("Gemini Refinement Error:", error);
    throw error;
  }
};

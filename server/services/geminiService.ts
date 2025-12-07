import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Lazy initialization - create client on first use (after dotenv loads)
let _ai: GoogleGenAI | null = null;

const getAI = () => {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not set in environment!');
    }
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
};

// Types
export interface LocationHints {
  continent?: string;
  country?: string;
  city?: string;
  additionalInfo?: string; // User-provided context (time, date, other clues)
  exifGps?: string; // GPS coordinates extracted from EXIF metadata
  reverseImageSearch?: string; // Results from Cloud Vision reverse image search
}

export interface EvidenceItem {
  clue: string;
  strength: 'hard' | 'medium' | 'soft';  // hard = text/signs, medium = infrastructure, soft = general appearance
  supports: string;  // what location this evidence supports
}

// A location candidate when multiple possibilities exist
export interface LocationCandidate {
  locationName: string;
  coordinates: { lat: number; lng: number } | null;
  probability: number;  // 0-100, relative probability among candidates
  reasoning: string[];  // Why this location is a candidate
  keyEvidence: string[];  // Main evidence supporting this candidate
}

export interface GeoAnalysisResult {
  locationName: string;
  coordinates: { lat: number; lng: number } | null;
  confidenceScore: number;  // overall score for backward compatibility
  confidence: {
    region: number;  // confidence in country/region (0-100)
    local: number;   // confidence in specific location (0-100)
  };

  // Multi-result support
  isDefinitive: boolean;  // true = high confidence single answer, false = multiple candidates
  candidates?: LocationCandidate[];  // Top 2-3 candidates when isDefinitive=false

  reasoning: string[];
  evidence: EvidenceItem[];  // categorized evidence
  alternativeLocations?: string[];  // other possible locations
  uncertainties?: string[];  // what could disprove this conclusion
  visualCues: {
    signs: string;
    architecture: string;
    environment: string;
    demographics?: string;
  };
  searchQueriesUsed: string[];
  sources: Array<{ title: string; uri: string }>;
}

// Phase 1 output: Evidence + Multiple Hypotheses (no search yet)
interface Hypothesis {
  location: string;
  region: string;  // country/area
  supportingClues: string[];
  contradictingClues: string[];
  initialConfidence: number;  // 0-100, before verification
}

interface Phase1Result {
  allClues: EvidenceItem[];
  visualCues: {
    signs: string;
    architecture: string;
    environment: string;
    demographics: string;
  };
  hypotheses: Hypothesis[];  // 3 competing hypotheses
}

// ============ MULTI-EXPERT SYSTEM ============

// Expert analysis output
interface ExpertAnalysis {
  expertType: string;
  observations: string[];  // what the expert observed
  possibleRegions: Array<{
    region: string;  // country or area
    confidence: number;  // 0-100
    reasoning: string;
  }>;
  impossibleRegions?: string[];  // regions this evidence rules OUT
}

// Aggregated result from all experts
interface ExpertConsensus {
  allObservations: Record<string, string[]>;  // by expert type
  regionScores: Record<string, { score: number; supporters: string[]; contradictors: string[] }>;
  topRegions: Array<{ region: string; score: number; evidence: string[] }>;
  conflicts: string[];  // conflicting evidence
}

// ============ CLUE-FOCUSED EXPERT PROMPTS ============
// Experts focus on finding SEARCHABLE clues, not just regions

const CLUE_EXPERT_TEXT = `You are an OSINT text analyst specializing in extracting searchable information from images.

## YOUR MISSION
Find ALL text, signs, and written elements that could help identify the EXACT location. Focus on things that can be SEARCHED online.

## PRIORITY CLUES (most valuable):
1. **Business names** - exact names of shops, restaurants, hotels
2. **Street names** - any visible street or road names
3. **Phone numbers** - with country/area codes
4. **Addresses** - any visible address fragments
5. **Domain names** - websites, emails (.fr, .de, .ru, etc.)
6. **License plates** - format and visible characters
7. **Brand names** - local brands, store chains
8. **Landmarks** - named monuments, stations, squares

## OUTPUT FORMAT (JSON only):
{
  "expertType": "text",
  "searchableClues": [
    {"clue": "Restaurant 'Le Petit Marseillais'", "type": "business_name", "searchQuery": "Le Petit Marseillais restaurant"},
    {"clue": "Street sign 'Rue de la République'", "type": "street_name", "searchQuery": "Rue de la République"},
    {"clue": "Phone +33 4 91 XX XX XX", "type": "phone", "searchQuery": null}
  ],
  "languageClues": ["French text", "PHARMACIE sign"],
  "transcribedText": ["PHARMACIE", "Le Petit", "Rue de la..."]
}`;

const CLUE_EXPERT_BUILT = `You are an OSINT analyst specializing in architecture, infrastructure, and man-made environment analysis.

## YOUR MISSION
Find architectural and infrastructure elements that help narrow down the SPECIFIC location. Focus on UNIQUE identifiers.

## PRIORITY CLUES:
1. **Unique buildings** - distinctive towers, monuments, recognizable structures
2. **Building styles** - specific architectural periods/styles (Art Deco, Brutalist, etc.)
3. **Road infrastructure** - specific road markings, sign styles, pole types
4. **Transport** - metro stations, tram lines, bus stops with names
5. **Landmarks** - churches, stadiums, bridges, squares
6. **Street furniture** - country-specific benches, bollards, trash cans

## KEY COUNTRY INDICATORS:
- Yellow center lines = Americas, China
- White center lines = Europe, Japan, Australia
- Driving on left = UK, Japan, Australia, India
- Blue street signs = France, Germany
- Green street signs = USA, UK

## OUTPUT FORMAT (JSON only):
{
  "expertType": "built_environment",
  "searchableClues": [
    {"clue": "Gothic cathedral with twin spires", "type": "landmark", "searchQuery": "gothic cathedral twin spires"},
    {"clue": "Metro station entrance 'M' logo", "type": "transport", "searchQuery": null}
  ],
  "infrastructureClues": ["White road markings", "Concrete utility poles", "Right-hand traffic"],
  "architectureStyle": "Mediterranean modernist, 1970s apartment blocks"
}`;

const CLUE_EXPERT_NATURAL = `You are an OSINT analyst specializing in natural environment, geography, and climate indicators.

## YOUR MISSION
Analyze natural elements to help narrow down the location. Focus on DISTINCTIVE features.

## PRIORITY CLUES:
1. **Mountains/Hills** - recognizable peaks, mountain ranges
2. **Water bodies** - coastline shape, rivers, lakes
3. **Vegetation** - specific tree species, unique plants
4. **Climate indicators** - sun angle, shadows, weather
5. **Terrain** - soil color, rock formations, landscape type

## OUTPUT FORMAT (JSON only):
{
  "expertType": "natural_environment",
  "searchableClues": [
    {"clue": "Volcanic mountain with snow cap in background", "type": "landmark", "searchQuery": "snow capped volcano"},
    {"clue": "Mediterranean coastline with rocky coves", "type": "geography", "searchQuery": null}
  ],
  "vegetationClues": ["Mediterranean pine trees", "Palm trees (Phoenix species)", "Dry summer grass"],
  "climateIndicators": ["Strong sunlight", "Low humidity", "Summer season"]
}`;

const CLUE_EXPERTS = [
  { name: 'text', prompt: CLUE_EXPERT_TEXT },
  { name: 'built_environment', prompt: CLUE_EXPERT_BUILT },
  { name: 'natural_environment', prompt: CLUE_EXPERT_NATURAL },
];

// ============ CLUE EXPERT OUTPUT TYPES ============

interface SearchableClue {
  clue: string;
  type: string;  // business_name, street_name, phone, landmark, etc.
  searchQuery: string | null;  // What to search for (null if not searchable)
}

interface ClueExpertOutput {
  expertType: string;
  searchableClues: SearchableClue[];
  languageClues?: string[];  // For text expert
  transcribedText?: string[];  // For text expert
  infrastructureClues?: string[];  // For built expert
  architectureStyle?: string;  // For built expert
  vegetationClues?: string[];  // For natural expert
  climateIndicators?: string[];  // For natural expert
}

interface AggregatedClues {
  searchableClues: SearchableClue[];  // All searchable clues from all experts
  allText: string[];  // All transcribed text
  allInfrastructure: string[];  // Infrastructure observations
  allNature: string[];  // Nature/vegetation observations
  suggestedSearchQueries: string[];  // Pre-built search queries
}

// ============ FINAL SEARCH PROMPT ============
// This prompt gets ALL clues from experts and must find the SPECIFIC location

const FINAL_SEARCH_PROMPT = `You are an expert OSINT geolocation analyst. Your mission is to find the EXACT, SPECIFIC location shown in the image(s).

## CRITICAL: FOCUS ON SPECIFIC LOCATION
Your goal is NOT to identify a country or city. Your goal is to find the SPECIFIC place:
- A specific street corner, address, or intersection
- A specific business, landmark, or building
- Exact coordinates that can be verified on Google Maps

## YOU HAVE RECEIVED CLUES FROM 3 EXPERT ANALYSTS:
These experts have already analyzed the image and extracted searchable clues. USE THEM!

## YOUR TASK:
1. Take the searchable clues and SEARCH FOR THEM using Google Search
2. Cross-reference findings to narrow down to ONE specific location
3. Verify by searching for Street View or photos of the candidate location
4. If you find the exact location, provide precise coordinates

## SEARCH STRATEGY:
1. Start with the MOST specific clues (business names, addresses, phone numbers)
2. Combine clues: "Restaurant ABC near X landmark" or "Street Y in city Z"
3. Look for photo matches or Street View that shows the same scene
4. If first search doesn't work, try variations

## CONFIDENCE SCORING:
- 90-100%: Found EXACT match (Street View confirms, same buildings visible)
- 70-89%: Found the specific area, high certainty about general location
- 50-69%: Found likely location but couldn't verify visually
- 30-49%: Best educated guess based on clues
- 0-29%: Speculation only

## OUTPUT FORMAT (JSON only):
{
  "locationName": "Specific address or landmark name",
  "coordinates": { "lat": number, "lng": number } or null,
  "confidenceScore": number (0-100),
  "confidence": {
    "region": number,
    "local": number
  },
  "reasoning": ["Step-by-step what you searched and found"],
  "evidence": [
    { "clue": "what you found", "strength": "hard|medium|soft", "supports": "location" }
  ],
  "alternativeLocations": ["Other possible locations if uncertain"],
  "uncertainties": ["What you couldn't verify"],
  "visualCues": {
    "signs": "All text found",
    "architecture": "Building styles",
    "environment": "Nature/climate",
    "demographics": "People/vehicles if visible"
  },
  "searchQueriesUsed": ["actual queries you used"]
}`;

// Legacy experts (kept for backward compatibility, but not used in new flow)
const EXPERT_VEGETATION = CLUE_EXPERT_NATURAL;
const EXPERT_ARCHITECTURE = CLUE_EXPERT_BUILT;
const EXPERT_TEXT = CLUE_EXPERT_TEXT;
const EXPERT_INFRASTRUCTURE = CLUE_EXPERT_BUILT;
const EXPERT_CULTURAL = CLUE_EXPERT_TEXT;

const EXPERTS = [
  { name: 'vegetation', prompt: EXPERT_VEGETATION },
  { name: 'architecture', prompt: EXPERT_ARCHITECTURE },
  { name: 'text_signs', prompt: EXPERT_TEXT },
  { name: 'infrastructure', prompt: EXPERT_INFRASTRUCTURE },
  { name: 'cultural', prompt: EXPERT_CULTURAL },
];

// ============ PHASE 1: Evidence Collection (NO search) ============
const PHASE1_INSTRUCTION = `
You are an expert OSINT geolocation analyst performing PHASE 1: EVIDENCE COLLECTION.

## CRITICAL RULES FOR THIS PHASE
1. DO NOT form any conclusions yet
2. DO NOT favor any single location
3. List ALL possible interpretations for each clue
4. Be exhaustive - miss nothing

## YOUR TASK
Analyze the image(s) and:
1. Extract EVERY visual clue you can find
2. Categorize each clue by strength (hard/medium/soft)
3. For each clue, list ALL locations it could support (not just one!)
4. Generate exactly 3 COMPETING hypotheses based on the evidence
5. For each hypothesis, honestly list both supporting AND contradicting clues

## CLUE CATEGORIES
- **hard**: Readable text, signs, license plates, business names, phone numbers, domain extensions
- **medium**: Infrastructure (poles, road markings, traffic lights), architectural style, driving side
- **soft**: Vegetation, weather, general appearance, clothing styles

## IMPORTANT: AVOID CONFIRMATION BIAS
- A clue that "looks Russian" might also fit Ukraine, Belarus, or Kazakhstan
- Cyrillic text appears in 10+ countries
- Similar architecture exists in many post-Soviet states
- Always consider MULTIPLE interpretations

## OUTPUT FORMAT (JSON only, no markdown):
{
  "allClues": [
    { "clue": "description", "strength": "hard|medium|soft", "supports": "Location A, Location B, Location C" }
  ],
  "visualCues": {
    "signs": "All text/signs found (exact transcription)",
    "architecture": "Building styles observed",
    "environment": "Climate, vegetation, terrain",
    "demographics": "People, vehicles, clothing if visible"
  },
  "hypotheses": [
    {
      "location": "Specific location guess",
      "region": "Country/Area",
      "supportingClues": ["clue 1", "clue 2"],
      "contradictingClues": ["clue that doesn't fit"],
      "initialConfidence": 0-100
    },
    { ... hypothesis 2 ... },
    { ... hypothesis 3 ... }
  ]
}
`;

// ============ PHASE 2: Verification with Search ============
const PHASE2_INSTRUCTION = `
You are an expert OSINT geolocation analyst performing PHASE 2: HYPOTHESIS VERIFICATION.

## YOUR TASK
You received evidence and 3 hypotheses from Phase 1. Now you must:
1. Use Google Search to verify EACH hypothesis
2. Actively search for CONTRADICTING evidence, not just confirming
3. Be willing to REJECT your top hypothesis if evidence doesn't support it
4. Select the best hypothesis OR conclude "insufficient evidence"

## VERIFICATION PROCESS FOR EACH HYPOTHESIS
1. Search for specific text/business names found in images
2. Look for Street View or photos of the candidate location
3. Verify infrastructure matches (road markings, poles, signs)
4. Check if ALL clues are consistent, not just some

## ANTI-CONFIRMATION BIAS RULES
- If you find 1 strong contradicting clue, reduce confidence significantly
- Don't ignore evidence just because it doesn't fit your preferred hypothesis
- "I couldn't verify" is NOT the same as "verified"
- Be honest if two locations are equally plausible

## CONFIDENCE CALIBRATION
- 90-100%: Found EXACT match (street view, unique landmark verified)
- 70-89%: Multiple hard clues verified, no contradictions
- 50-69%: Some verification, but gaps remain
- 30-49%: Best guess, couldn't verify key elements
- 0-29%: Pure speculation

## OUTPUT FORMAT (JSON only):
{
  "locationName": "Final location (most likely)",
  "coordinates": { "lat": number, "lng": number } or null,
  "confidenceScore": number,
  "confidence": { "region": number, "local": number },
  "reasoning": ["Step-by-step verification process"],
  "evidence": [categorized evidence array],
  "alternativeLocations": ["Hypothesis 2 if still plausible", "Hypothesis 3"],
  "uncertainties": ["What we couldn't verify", "Contradicting clues"],
  "visualCues": { from phase 1 },
  "searchQueriesUsed": ["what you searched for"],
  "verificationResults": {
    "hypothesis1": { "verified": true/false, "confidence": number, "notes": "..." },
    "hypothesis2": { "verified": true/false, "confidence": number, "notes": "..." },
    "hypothesis3": { "verified": true/false, "confidence": number, "notes": "..." }
  }
}
`;

// ============ LEGACY: Single-phase instruction (kept for refine) ============
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
- Use googleSearch for business names, addresses, landmarks, street names
- Use googleMaps to find and verify locations by NAME (not coordinates!)
- Search for specific text you found (e.g., "ABC Restaurant Tokyo")
- **IMPORTANT**: NEVER pass raw coordinates (lat/lng numbers) to search tools - they will fail!
  - WRONG: searching "48.8584, 2.2945"
  - CORRECT: searching "Eiffel Tower Paris"
- Cross-reference multiple sources to verify

### STEP 4: VERIFY (Check consistency)
Before finalizing, verify:
- Does sun/shadow match the latitude?
- Is vegetation consistent with climate?
- Do all visual elements match the proposed location?
- Search for Street View of candidate location

## CONFIDENCE SCORING GUIDE
Use SEPARATE scores for region vs local precision:
- **Region confidence** (country/area): How sure are you about the country/region?
- **Local confidence** (specific spot): How sure are you about the exact coordinates?

Example: You might be 95% sure it's Japan but only 40% sure it's this specific street in Tokyo.

Score meanings:
- **90-100%**: Verified with hard evidence (readable text confirmed via search)
- **70-89%**: Strong indicators verified (landmark/business found)
- **50-69%**: Multiple consistent soft clues
- **30-49%**: Educated guess based on patterns
- **0-29%**: Speculation only

## EVIDENCE CATEGORIZATION
Categorize each clue by strength:
- **hard**: Readable text, signs, license plates, verified business names
- **medium**: Infrastructure patterns, road markings, architectural style
- **soft**: Vegetation, weather, general "vibe", unverified assumptions

## SELF-CRITIQUE (Important!)
Before finalizing, ask yourself:
- What OTHER locations could match these clues?
- What evidence would DISPROVE my conclusion?
- Am I being overconfident without hard evidence?

Be honest about uncertainty. "Possibly Tokyo" is better than a wrong confident answer.

## OUTPUT FORMAT
Return ONLY a valid JSON object (no markdown):
{
  "locationName": "Specific address or location name",
  "coordinates": { "lat": number, "lng": number } or null,
  "confidenceScore": number (0-100, overall for backward compatibility),
  "confidence": {
    "region": number (0-100, country/area certainty),
    "local": number (0-100, specific location certainty)
  },
  "reasoning": ["Step 1: Found X...", "Step 2: Y suggests...", "Step 3: Search confirmed...", "Step 4: Verified..."],
  "evidence": [
    { "clue": "Sign reads 'ABC Store'", "strength": "hard", "supports": "Tokyo, Japan" },
    { "clue": "Yellow tactile blocks on sidewalk", "strength": "medium", "supports": "Japan" }
  ],
  "alternativeLocations": ["Other possible location 1", "Could also be..."],
  "uncertainties": ["Could not verify X", "Sign partially obscured"],
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

// Normalize evidence items to ensure all fields exist
const normalizeEvidence = (evidence: any[]): EvidenceItem[] => {
  if (!Array.isArray(evidence)) return [];
  return evidence.map(item => ({
    clue: item.clue || item.description || 'Unknown clue',
    strength: item.strength || 'soft',
    supports: item.supports || item.location || 'Unknown'
  }));
};

// Normalize response to ensure all fields exist (backward compatibility)
const normalizeResult = (data: any): GeoAnalysisResult => {
  const score = data.confidenceScore ?? 50;

  return {
    locationName: data.locationName || 'Unknown location',
    coordinates: data.coordinates || null,
    confidenceScore: score,
    confidence: data.confidence || {
      region: score,
      local: Math.round(score * 0.7)  // default: local is less certain than region
    },
    isDefinitive: score >= 80,  // Will be recalculated based on candidates
    candidates: undefined,  // Will be populated if needed
    reasoning: Array.isArray(data.reasoning) ? data.reasoning : [],
    evidence: normalizeEvidence(data.evidence),
    alternativeLocations: Array.isArray(data.alternativeLocations) ? data.alternativeLocations : [],
    uncertainties: Array.isArray(data.uncertainties) ? data.uncertainties : [],
    visualCues: data.visualCues || {
      signs: '',
      architecture: '',
      environment: '',
      demographics: ''
    },
    searchQueriesUsed: Array.isArray(data.searchQueriesUsed) ? data.searchQueriesUsed : [],
    sources: []  // filled separately
  };
};

// Constants for multi-result logic
const DEFINITIVE_THRESHOLD = 75;  // If top candidate has >75%, it's definitive
const MIN_CANDIDATE_THRESHOLD = 15;  // Candidate must have >15% to be shown
const GAP_THRESHOLD = 40;  // If top > second by 40+ points, it's definitive

// Build location candidates from expert consensus
const buildCandidatesFromConsensus = (
  consensus: ExpertConsensus,
  expertResults: ExpertAnalysis[]
): { isDefinitive: boolean; candidates: LocationCandidate[] } => {
  const topRegions = consensus.topRegions.slice(0, 5);

  if (topRegions.length === 0) {
    return { isDefinitive: false, candidates: [] };
  }

  // Calculate total score for normalization
  const totalScore = topRegions.reduce((sum, r) => sum + Math.max(0, r.score), 0);
  if (totalScore === 0) {
    return { isDefinitive: false, candidates: [] };
  }

  // Calculate probabilities as percentages of total
  const candidatesWithProb = topRegions.map(region => {
    const probability = Math.round((Math.max(0, region.score) / totalScore) * 100);
    return {
      locationName: region.region.charAt(0).toUpperCase() + region.region.slice(1),  // Capitalize
      coordinates: null,  // Will be filled by Phase 2 if possible
      probability,
      reasoning: region.evidence.slice(0, 3),
      keyEvidence: region.evidence.slice(0, 2).map(e => e.split(':')[1]?.trim() || e)
    };
  });

  // Sort by probability
  candidatesWithProb.sort((a, b) => b.probability - a.probability);

  const top = candidatesWithProb[0];
  const second = candidatesWithProb[1];

  // Determine if definitive
  // Case 1: Top candidate has very high probability (>75%)
  // Case 2: Big gap between top and second (>40 points)
  const isDefinitive = top.probability >= DEFINITIVE_THRESHOLD ||
    (second && (top.probability - second.probability) >= GAP_THRESHOLD);

  if (isDefinitive) {
    // Still return top 1-2 alternatives for context
    return {
      isDefinitive: true,
      candidates: candidatesWithProb.slice(0, 1)
    };
  }

  // Filter out low-probability candidates
  const viableCandidates = candidatesWithProb.filter(c => c.probability >= MIN_CANDIDATE_THRESHOLD);

  // Limit to max 3 candidates
  const finalCandidates = viableCandidates.slice(0, 3);

  console.log(`[MultiResult] Top probabilities: ${finalCandidates.map(c => `${c.locationName}(${c.probability}%)`).join(', ')}`);
  console.log(`[MultiResult] isDefinitive: ${isDefinitive}, showing ${finalCandidates.length} candidates`);

  return {
    isDefinitive: false,
    candidates: finalCandidates
  };
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

// Helper: Call Gemini API with automatic retry on googleMaps coordinate errors
const callGeminiWithRetry = async (
  imageParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  promptText: string
) => {
  try {
    return await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [...imageParts, { text: promptText }] },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
        safetySettings: SAFETY_SETTINGS,
      }
    });
  } catch (err: any) {
    // googleMaps tool fails when model passes raw coordinates - retry without it
    if (err.message?.includes('Coordinates are not a valid input')) {
      return await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [...imageParts, { text: promptText }] },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
          safetySettings: SAFETY_SETTINGS,
        }
      });
    }
    throw err;
  }
};

// Helper: Build prompt with hints
const buildPromptWithHints = (basePrompt: string, hints?: LocationHints): string => {
  let prompt = basePrompt;

  if (hints?.exifGps) {
    prompt += `\n\n**EXIF METADATA FOUND**:\n${hints.exifGps}\nThis GPS data was extracted from the image metadata. DO NOT search for these coordinates - just use them directly in your final answer if the visual content is consistent with this location. Set confidence HIGH if visuals match.`;
  }

  if (hints?.reverseImageSearch) {
    prompt += hints.reverseImageSearch;
    prompt += `\nUse these reverse image search results to help identify the location. If the image was found on specific pages or associated with specific locations, this is valuable evidence.`;
  }

  if (hints?.continent || hints?.country || hints?.city) {
    prompt += "\n\nAdditional Context provided by user (use as hints, but verify visually):";
    if (hints.continent) prompt += `\n- Continent: ${hints.continent}`;
    if (hints.country) prompt += `\n- Country: ${hints.country}`;
    if (hints.city) prompt += `\n- City: ${hints.city}`;
  }

  return prompt;
};

// Helper: Process Gemini response into result
const processGeminiResponse = (response: any): GeoAnalysisResult => {
  const parsedData = parseResponse(response.text);
  const sources = extractSources(response);
  const result = normalizeResult(parsedData);
  result.sources = sources;
  return result;
};

// ============ NEW CLUE-FOCUSED EXPERT SYSTEM ============

// Run a single clue expert (no search tools - just observation)
const runClueExpert = async (
  expertPrompt: string,
  expertName: string,
  imageParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  hints?: LocationHints
): Promise<ClueExpertOutput | null> => {
  try {
    let promptText = 'Analyze this image from your expert perspective. Extract ALL searchable clues.\n';

    // Add hints context
    if (hints?.continent || hints?.country || hints?.city || hints?.additionalInfo) {
      promptText += '\n**USER HINTS (focus your search):**\n';
      if (hints.continent) promptText += `- Continent: ${hints.continent}\n`;
      if (hints.country) promptText += `- Country: ${hints.country}\n`;
      if (hints.city) promptText += `- City/Region: ${hints.city}\n`;
      if (hints.additionalInfo) promptText += `- Additional context: ${hints.additionalInfo}\n`;
    }

    promptText += '\nReturn ONLY valid JSON in the format specified.';

    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [...imageParts, { text: promptText }] },
      config: {
        systemInstruction: expertPrompt,
        safetySettings: SAFETY_SETTINGS,
      }
    });

    const parsed = parseResponse(response.text);

    return {
      expertType: expertName,
      searchableClues: parsed.searchableClues || [],
      languageClues: parsed.languageClues || [],
      transcribedText: parsed.transcribedText || [],
      infrastructureClues: parsed.infrastructureClues || [],
      architectureStyle: parsed.architectureStyle || '',
      vegetationClues: parsed.vegetationClues || [],
      climateIndicators: parsed.climateIndicators || []
    };
  } catch (err: any) {
    console.log(`[ClueExpert:${expertName}] Error: ${err.message}`);
    return null;
  }
};

// Run all 3 clue experts in parallel
const runAllClueExperts = async (
  imageParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  hints?: LocationHints
): Promise<ClueExpertOutput[]> => {
  console.log('[ClueExperts] Running 3 clue experts in parallel...');

  const expertPromises = CLUE_EXPERTS.map(expert =>
    runClueExpert(expert.prompt, expert.name, imageParts, hints)
  );

  const results = await Promise.all(expertPromises);
  const validResults = results.filter((r): r is ClueExpertOutput => r !== null);

  console.log(`[ClueExperts] ${validResults.length}/${CLUE_EXPERTS.length} experts returned results`);

  return validResults;
};

// Aggregate all clues from experts into a single structure
const aggregateClues = (expertResults: ClueExpertOutput[]): AggregatedClues => {
  const allSearchable: SearchableClue[] = [];
  const allText: string[] = [];
  const allInfra: string[] = [];
  const allNature: string[] = [];
  const queries: string[] = [];

  for (const expert of expertResults) {
    // Collect searchable clues
    for (const clue of expert.searchableClues || []) {
      allSearchable.push(clue);
      if (clue.searchQuery) {
        queries.push(clue.searchQuery);
      }
    }

    // Collect text clues
    if (expert.transcribedText) {
      allText.push(...expert.transcribedText);
    }
    if (expert.languageClues) {
      allText.push(...expert.languageClues);
    }

    // Collect infrastructure clues
    if (expert.infrastructureClues) {
      allInfra.push(...expert.infrastructureClues);
    }
    if (expert.architectureStyle) {
      allInfra.push(expert.architectureStyle);
    }

    // Collect nature clues
    if (expert.vegetationClues) {
      allNature.push(...expert.vegetationClues);
    }
    if (expert.climateIndicators) {
      allNature.push(...expert.climateIndicators);
    }
  }

  // Remove duplicates and empty strings
  const uniqueQueries = [...new Set(queries.filter(q => q))];

  console.log(`[ClueAggregator] Collected ${allSearchable.length} searchable clues`);
  console.log(`[ClueAggregator] Suggested queries: ${uniqueQueries.slice(0, 5).join(', ')}`);

  return {
    searchableClues: allSearchable,
    allText: [...new Set(allText.filter(t => t))],
    allInfrastructure: [...new Set(allInfra.filter(i => i))],
    allNature: [...new Set(allNature.filter(n => n))],
    suggestedSearchQueries: uniqueQueries
  };
};

// Run the final search using all collected clues
const runFinalSearch = async (
  imageParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  clues: AggregatedClues,
  hints?: LocationHints
): Promise<GeoAnalysisResult> => {
  // Build the clues summary for the prompt
  const cluesSummary = clues.searchableClues.map(c =>
    `- ${c.clue} (type: ${c.type})${c.searchQuery ? ` → Search: "${c.searchQuery}"` : ''}`
  ).join('\n');

  const textSummary = clues.allText.length > 0
    ? `\n### Transcribed Text:\n${clues.allText.join(', ')}`
    : '';

  const infraSummary = clues.allInfrastructure.length > 0
    ? `\n### Infrastructure Observations:\n${clues.allInfrastructure.join(', ')}`
    : '';

  const natureSummary = clues.allNature.length > 0
    ? `\n### Natural Environment:\n${clues.allNature.join(', ')}`
    : '';

  const queriesSummary = clues.suggestedSearchQueries.length > 0
    ? `\n### Suggested Search Queries (start with these!):\n${clues.suggestedSearchQueries.map(q => `- "${q}"`).join('\n')}`
    : '';

  // Build hints section
  let hintsSection = '';
  if (hints?.continent || hints?.country || hints?.city || hints?.additionalInfo) {
    hintsSection = '\n\n## USER-PROVIDED HINTS (use to focus your search):\n';
    if (hints.continent) hintsSection += `- Continent: ${hints.continent}\n`;
    if (hints.country) hintsSection += `- Country: ${hints.country}\n`;
    if (hints.city) hintsSection += `- City/Region: ${hints.city}\n`;
    if (hints.additionalInfo) hintsSection += `- Additional context: ${hints.additionalInfo}\n`;
  }
  if (hints?.exifGps) {
    hintsSection += `\n## EXIF GPS DATA (high value!):\n${hints.exifGps}\n`;
  }

  const prompt = `## CLUES COLLECTED BY EXPERT ANALYSTS:
${hintsSection}
### Searchable Clues:
${cluesSummary || 'No specific searchable clues found'}
${textSummary}
${infraSummary}
${natureSummary}
${queriesSummary}

## YOUR MISSION:
Use Google Search to find the EXACT, SPECIFIC location. Not just a country or city - find the SPECIFIC place!

1. Search for the most specific clues first (business names, addresses)
2. Combine clues in searches (e.g., "Restaurant ABC Lyon France")
3. Look for photo matches or Street View confirmation
4. Return precise coordinates if possible

IMPORTANT: Return ONLY valid JSON.`;

  console.log('[FinalSearch] Searching with collected clues...');
  console.log(`[FinalSearch] ${clues.searchableClues.length} clues, ${clues.suggestedSearchQueries.length} queries`);

  // Helper to fill visual cues from collected clues
  const fillVisualCues = (result: GeoAnalysisResult) => {
    result.visualCues = {
      signs: clues.allText.join('; '),
      architecture: clues.allInfrastructure.filter(i => i.toLowerCase().includes('architect') || i.toLowerCase().includes('style')).join('; '),
      environment: clues.allNature.join('; '),
      demographics: clues.allInfrastructure.filter(i => !i.toLowerCase().includes('architect')).join('; ')
    };
    return result;
  };

  // Helper to run text-only search (fallback when image is blocked by safety filter)
  const runTextOnlySearch = async (): Promise<GeoAnalysisResult> => {
    console.log('[FinalSearch] Running text-only search (image blocked by safety filter)...');

    const textOnlyPrompt = `## IMAGE WAS BLOCKED BY SAFETY FILTER
The image could not be analyzed directly (it may contain license plates, people, or other blocked content).
However, expert analysts have already extracted these clues from the image:

${prompt}

Based ONLY on these clues (without seeing the image), search and determine the most likely location.`;

    const textResponse = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: textOnlyPrompt }] },
      config: {
        systemInstruction: FINAL_SEARCH_PROMPT,
        tools: [{ googleSearch: {} }],
        safetySettings: SAFETY_SETTINGS,
      }
    });

    const parsedData = parseResponse(textResponse.text);
    const sources = extractSources(textResponse);
    const result = normalizeResult(parsedData);
    result.sources = sources;
    result.reasoning.unshift('⚠️ Note: Image was blocked by safety filter. Analysis based on extracted clues only.');
    return fillVisualCues(result);
  };

  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [...imageParts, { text: prompt }] },
      config: {
        systemInstruction: FINAL_SEARCH_PROMPT,
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
        safetySettings: SAFETY_SETTINGS,
      }
    });

    // Check if response is empty (safety filter blocked)
    if (!response.text) {
      console.log('[FinalSearch] Empty response - likely safety filter. Trying text-only...');
      return await runTextOnlySearch();
    }

    const parsedData = parseResponse(response.text);
    const sources = extractSources(response);
    const result = normalizeResult(parsedData);
    result.sources = sources;

    return fillVisualCues(result);
  } catch (err: any) {
    console.log(`[FinalSearch] Error: ${err.message}`);

    // Retry without googleMaps if coordinate error
    if (err.message?.includes('Coordinates are not a valid input')) {
      console.log('[FinalSearch] Retrying without googleMaps...');
      try {
        const response = await getAI().models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts: [...imageParts, { text: prompt }] },
          config: {
            systemInstruction: FINAL_SEARCH_PROMPT,
            tools: [{ googleSearch: {} }],
            safetySettings: SAFETY_SETTINGS,
          }
        });

        if (!response.text) {
          console.log('[FinalSearch] Empty response after retry - trying text-only...');
          return await runTextOnlySearch();
        }

        const parsedData = parseResponse(response.text);
        const sources = extractSources(response);
        const result = normalizeResult(parsedData);
        result.sources = sources;
        return fillVisualCues(result);
      } catch (retryErr: any) {
        // If retry also fails with no response, try text-only
        if (retryErr.message?.includes('no response') || retryErr.message?.includes('no text')) {
          return await runTextOnlySearch();
        }
        throw retryErr;
      }
    }

    // If error mentions no response or safety, try text-only search
    if (err.message?.includes('no response') || err.message?.includes('no text') ||
        err.message?.includes('safety') || err.message?.includes('blocked')) {
      return await runTextOnlySearch();
    }

    throw err;
  }
};

// ============ TWO-PHASE ANALYSIS ============

// Phase 1: Evidence collection WITHOUT search tools (prevents confirmation bias)
const runPhase1 = async (
  imageParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  hints?: LocationHints
): Promise<Phase1Result> => {
  let prompt = "Analyze these images and extract ALL visual evidence. Generate 3 competing location hypotheses. DO NOT form conclusions yet - just gather evidence. IMPORTANT: Return ONLY valid JSON.";

  // Add hints but remind model not to anchor on them
  if (hints?.exifGps) {
    prompt += `\n\n**EXIF METADATA FOUND**: ${hints.exifGps}\nNote: This is metadata, not visual evidence. Include it as one data point but don't let it bias your hypothesis generation.`;
  }
  if (hints?.reverseImageSearch) {
    prompt += `\n\n**REVERSE IMAGE SEARCH RESULTS**:${hints.reverseImageSearch}\nNote: These are search hints. Generate hypotheses that INCLUDE and EXCLUDE these possibilities.`;
  }
  if (hints?.continent || hints?.country || hints?.city) {
    prompt += "\n\n**USER HINTS** (treat as one hypothesis, not the answer):";
    if (hints.continent) prompt += `\n- Continent: ${hints.continent}`;
    if (hints.country) prompt += `\n- Country: ${hints.country}`;
    if (hints.city) prompt += `\n- City: ${hints.city}`;
  }

  // Phase 1: NO tools - pure visual analysis
  const response = await getAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [...imageParts, { text: prompt }] },
    config: {
      systemInstruction: PHASE1_INSTRUCTION,
      // NO tools in Phase 1 - prevents model from "cheating" by searching to confirm
      safetySettings: SAFETY_SETTINGS,
    }
  });

  const parsed = parseResponse(response.text);

  // Validate Phase 1 output structure
  return {
    allClues: parsed.allClues || [],
    visualCues: parsed.visualCues || { signs: '', architecture: '', environment: '', demographics: '' },
    hypotheses: parsed.hypotheses || []
  };
};

// Phase 2: Verify ALL hypotheses WITH search tools
const runPhase2 = async (
  imageParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  phase1Result: Phase1Result,
  hints?: LocationHints
): Promise<GeoAnalysisResult> => {
  // Build prompt with Phase 1 findings
  const hypothesesSummary = phase1Result.hypotheses.map((h, i) =>
    `Hypothesis ${i + 1}: ${h.location} (${h.region})
     - Supporting: ${h.supportingClues.join(', ')}
     - Contradicting: ${h.contradictingClues.join(', ')}
     - Initial confidence: ${h.initialConfidence}%`
  ).join('\n\n');

  const cluesSummary = phase1Result.allClues.map(c =>
    `[${c.strength.toUpperCase()}] ${c.clue} → supports: ${c.supports}`
  ).join('\n');

  // Build hints section
  let hintsSection = '';
  if (hints?.continent || hints?.country || hints?.city || hints?.additionalInfo) {
    hintsSection = '\n\n### USER-PROVIDED HINTS (prioritize verification):\n';
    if (hints.continent) hintsSection += `- Continent: ${hints.continent}\n`;
    if (hints.country) hintsSection += `- Country: ${hints.country}\n`;
    if (hints.city) hintsSection += `- City/Region: ${hints.city}\n`;
    if (hints.additionalInfo) hintsSection += `- Additional context: ${hints.additionalInfo}\n`;
    hintsSection += '\n**IMPORTANT:** If user provided location hints, you MUST specifically verify these. If the hinted location matches visual evidence, prioritize it in your final answer.';
  }
  if (hints?.exifGps) {
    hintsSection += `\n\n### EXIF GPS DATA:\n${hints.exifGps}\nThis is metadata from the image. Use it directly if visual evidence is consistent.`;
  }

  const prompt = `## PHASE 1 EVIDENCE (already extracted):${hintsSection}

### Visual Cues Found:
- Signs/Text: ${phase1Result.visualCues.signs || 'None found'}
- Architecture: ${phase1Result.visualCues.architecture || 'Not noted'}
- Environment: ${phase1Result.visualCues.environment || 'Not noted'}
- Demographics: ${phase1Result.visualCues.demographics || 'Not noted'}

### All Clues:
${cluesSummary || 'No clues extracted'}

### Competing Hypotheses to Verify:
${hypothesesSummary}

## YOUR TASK:
1. Use Google Search to verify EACH hypothesis
2. Search for contradicting evidence, not just confirming
3. Be willing to reject the top hypothesis if evidence doesn't support it
4. Return final JSON with the most likely location

IMPORTANT: Return ONLY valid JSON.`;

  // Helper to process Phase 2 response with detailed logging
  const processPhase2Response = (response: any): GeoAnalysisResult => {
    console.log('[Phase2] Response text length:', response.text?.length || 0);
    console.log('[Phase2] Response text preview:', response.text?.substring(0, 200) || 'EMPTY');

    // Check for candidates if text is empty
    if (!response.text && response.candidates) {
      console.log('[Phase2] Checking candidates...');
      const candidate = response.candidates[0];
      if (candidate?.content?.parts) {
        const textPart = candidate.content.parts.find((p: any) => p.text);
        if (textPart) {
          console.log('[Phase2] Found text in candidates');
          response.text = textPart.text;
        }
      }
    }

    const parsedData = parseResponse(response.text);
    const sources = extractSources(response);
    const result = normalizeResult(parsedData);
    result.sources = sources;
    result.visualCues = phase1Result.visualCues;
    return result;
  };

  try {
    // First try with images (for visual verification)
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [...imageParts, { text: prompt }] },
      config: {
        systemInstruction: PHASE2_INSTRUCTION,
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
        safetySettings: SAFETY_SETTINGS,
      }
    });

    return processPhase2Response(response);
  } catch (err: any) {
    console.log('[Phase2] Error:', err.message);

    // Retry without googleMaps if it fails with coordinate error
    if (err.message?.includes('Coordinates are not a valid input')) {
      console.log('[Phase2] Retrying without googleMaps...');
      const response = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [...imageParts, { text: prompt }] },
        config: {
          systemInstruction: PHASE2_INSTRUCTION,
          tools: [{ googleSearch: {} }],
          safetySettings: SAFETY_SETTINGS,
        }
      });

      return processPhase2Response(response);
    }

    // If "no response" error, try without images (text-only verification)
    if (err.message?.includes('no response') || err.message?.includes('no text')) {
      console.log('[Phase2] Retrying without images (text-only)...');
      const response = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: {
          systemInstruction: PHASE2_INSTRUCTION,
          tools: [{ googleSearch: {} }],
          safetySettings: SAFETY_SETTINGS,
        }
      });

      return processPhase2Response(response);
    }

    throw err;
  }
};

// ============ MULTI-EXPERT EXECUTION ============

// Build user hints string for expert prompts
const buildHintsForExpert = (hints?: LocationHints): string => {
  if (!hints) return '';

  const parts: string[] = [];
  if (hints.continent) parts.push(`Continent: ${hints.continent}`);
  if (hints.country) parts.push(`Country: ${hints.country}`);
  if (hints.city) parts.push(`City/Region: ${hints.city}`);
  if (hints.additionalInfo) parts.push(`Additional context: ${hints.additionalInfo}`);

  if (parts.length === 0) return '';

  return `\n\n**USER HINTS (prioritize checking these regions):**\n${parts.join('\n')}\n\nIMPORTANT: If user provided hints, you MUST include these regions in your possibleRegions analysis with honest confidence scores. If visual evidence contradicts the hints, note that but still analyze the hinted region.`;
};

// Run a single expert analysis
const runExpert = async (
  expertPrompt: string,
  expertName: string,
  imageParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  hints?: LocationHints
): Promise<ExpertAnalysis | null> => {
  try {
    const hintsText = buildHintsForExpert(hints);
    const promptText = `Analyze this image from your expert perspective.${hintsText}\n\nReturn ONLY valid JSON.`;

    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [...imageParts, { text: promptText }] },
      config: {
        systemInstruction: expertPrompt,
        safetySettings: SAFETY_SETTINGS,
      }
    });

    const parsed = parseResponse(response.text);
    return {
      expertType: expertName,
      observations: parsed.observations || [],
      possibleRegions: parsed.possibleRegions || [],
      impossibleRegions: parsed.impossibleRegions || []
    };
  } catch (err: any) {
    console.log(`[Expert:${expertName}] Error: ${err.message}`);
    return null;
  }
};

// Run all experts in parallel
const runAllExperts = async (
  imageParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  hints?: LocationHints
): Promise<ExpertAnalysis[]> => {
  console.log('[MultiExpert] Running 5 experts in parallel...');
  if (hints?.continent || hints?.country || hints?.city) {
    console.log(`[MultiExpert] User hints: continent=${hints.continent}, country=${hints.country}, city=${hints.city}`);
  }
  if (hints?.additionalInfo) {
    console.log(`[MultiExpert] Additional info: ${hints.additionalInfo}`);
  }

  const expertPromises = EXPERTS.map(expert =>
    runExpert(expert.prompt, expert.name, imageParts, hints)
  );

  const results = await Promise.all(expertPromises);

  // Filter out failed experts
  const validResults = results.filter((r): r is ExpertAnalysis => r !== null);
  console.log(`[MultiExpert] ${validResults.length}/${EXPERTS.length} experts returned results`);

  return validResults;
};

// Normalize region names for comparison
const normalizeRegion = (region: any): string => {
  // Handle non-string inputs safely
  if (!region) return 'unknown';
  if (typeof region !== 'string') {
    // If it's an object with a name property, use that
    if (typeof region === 'object' && region.name) {
      region = String(region.name);
    } else {
      region = String(region);
    }
  }
  return region
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')  // Remove parenthetical info
    .replace(/,.*$/, '')  // Remove everything after comma
    .replace(/southern |northern |eastern |western |coastal |central /g, '')
    .trim() || 'unknown';
};

// Aggregate results from all experts
const aggregateExpertResults = (expertResults: ExpertAnalysis[]): ExpertConsensus => {
  const allObservations: Record<string, string[]> = {};
  const regionScores: Record<string, { score: number; supporters: string[]; contradictors: string[] }> = {};
  const conflicts: string[] = [];

  // Collect observations
  for (const expert of expertResults) {
    allObservations[expert.expertType] = expert.observations;

    // Add positive scores from possibleRegions
    for (const region of expert.possibleRegions) {
      const normalized = normalizeRegion(region.region);

      if (!regionScores[normalized]) {
        regionScores[normalized] = { score: 0, supporters: [], contradictors: [] };
      }

      regionScores[normalized].score += region.confidence;
      regionScores[normalized].supporters.push(
        `${expert.expertType}: ${region.reasoning} (${region.confidence}%)`
      );
    }

    // Add negative scores from impossibleRegions
    for (const impossible of expert.impossibleRegions || []) {
      const normalized = normalizeRegion(impossible);

      if (!regionScores[normalized]) {
        regionScores[normalized] = { score: 0, supporters: [], contradictors: [] };
      }

      regionScores[normalized].score -= 50;  // Penalty for contradiction
      regionScores[normalized].contradictors.push(`${expert.expertType} rules out this region`);
    }
  }

  // Detect conflicts (same region has both high support and contradictions)
  for (const [region, data] of Object.entries(regionScores)) {
    if (data.supporters.length > 0 && data.contradictors.length > 0) {
      conflicts.push(`${region}: supported by ${data.supporters.length} experts, but contradicted by ${data.contradictors.length}`);
    }
  }

  // Sort regions by score
  const sortedRegions = Object.entries(regionScores)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([region, data]) => ({
      region,
      score: data.score,
      evidence: data.supporters
    }));

  return {
    allObservations,
    regionScores,
    topRegions: sortedRegions.slice(0, 10),  // Top 10 regions
    conflicts
  };
};

// Convert expert consensus to hypotheses for verification
const consensusToHypotheses = (consensus: ExpertConsensus): Hypothesis[] => {
  // Get max score for normalization
  const maxScore = consensus.topRegions[0]?.score || 100;

  return consensus.topRegions.slice(0, 5).map((region, index) => {
    // Calculate confidence based on:
    // - Position (1st place gets bonus)
    // - Score relative to max
    // - Number of supporting experts
    const relativeScore = (region.score / maxScore) * 100;
    const expertCount = region.evidence.length;
    const positionBonus = index === 0 ? 10 : 0;

    // Base confidence: relative score, adjusted by expert agreement
    const confidence = Math.min(95, Math.max(20,
      Math.round(relativeScore * 0.6 + expertCount * 10 + positionBonus)
    ));

    return {
      location: region.region,
      region: region.region,
      supportingClues: region.evidence.slice(0, 3),
      contradictingClues: consensus.regionScores[normalizeRegion(region.region)]?.contradictors || [],
      initialConfidence: confidence
    };
  });
};

// Build Phase1Result from expert consensus
const expertConsensusToPhase1 = (
  consensus: ExpertConsensus,
  expertResults: ExpertAnalysis[]
): Phase1Result => {
  // Collect all clues from experts
  const allClues: EvidenceItem[] = [];

  for (const expert of expertResults) {
    for (const obs of expert.observations) {
      const regions = expert.possibleRegions.map(r => r.region).join(', ');
      allClues.push({
        clue: obs,
        strength: expert.expertType === 'text_signs' ? 'hard' :
                  expert.expertType === 'infrastructure' ? 'medium' : 'soft',
        supports: regions || 'Unknown'
      });
    }
  }

  // Build visual cues from expert observations
  const vegetationExpert = expertResults.find(e => e.expertType === 'vegetation');
  const archExpert = expertResults.find(e => e.expertType === 'architecture');
  const textExpert = expertResults.find(e => e.expertType === 'text_signs');
  const culturalExpert = expertResults.find(e => e.expertType === 'cultural');

  return {
    allClues,
    visualCues: {
      signs: textExpert?.observations.join('; ') || '',
      architecture: archExpert?.observations.join('; ') || '',
      environment: vegetationExpert?.observations.join('; ') || '',
      demographics: culturalExpert?.observations.join('; ') || ''
    },
    hypotheses: consensusToHypotheses(consensus)
  };
};

// Convert Phase 1 result to final result (fallback when Phase 2 fails)
const phase1ToResult = (phase1: Phase1Result): GeoAnalysisResult => {
  const topHypothesis = phase1.hypotheses[0];
  const alternatives = phase1.hypotheses.slice(1).map(h => `${h.location} (${h.region})`);
  const confidence = topHypothesis?.initialConfidence || 30;

  return {
    locationName: topHypothesis ? `${topHypothesis.location} (${topHypothesis.region})` : 'Unknown location',
    coordinates: null,  // Can't get coords without search
    confidenceScore: confidence,
    confidence: {
      region: confidence,
      local: Math.round(confidence * 0.5)  // Lower for specific location
    },
    isDefinitive: false,  // Fallback is never definitive
    candidates: undefined,  // Will be set by caller
    reasoning: [
      'Analysis based on visual evidence only (verification unavailable)',
      ...phase1.allClues.map(c => `[${c.strength}] ${c.clue} → ${c.supports}`)
    ],
    evidence: phase1.allClues,
    alternativeLocations: alternatives,
    uncertainties: [
      'Could not verify with web search',
      ...(topHypothesis?.contradictingClues || [])
    ],
    visualCues: phase1.visualCues,
    searchQueriesUsed: [],
    sources: []
  };
};

// Main analysis function - Clue-Focused Expert approach
// NEW FLOW: 3 experts collect CLUES → aggregate → ONE final search for SPECIFIC location
export const analyzeImageLocation = async (
  images: { base64: string, mimeType: string }[],
  hints?: LocationHints
): Promise<GeoAnalysisResult> => {
  const imageParts = images.map(img => ({
    inlineData: { mimeType: img.mimeType, data: img.base64 }
  }));

  console.log('[GeoAnalysis] === CLUE-FOCUSED ANALYSIS ===');
  if (hints) {
    console.log('[GeoAnalysis] User hints provided:', {
      continent: hints.continent || '(none)',
      country: hints.country || '(none)',
      city: hints.city || '(none)',
      additionalInfo: hints.additionalInfo ? hints.additionalInfo.substring(0, 50) + '...' : '(none)'
    });
  }

  // ============ PHASE 1: COLLECT CLUES ============
  // Run 3 clue experts in parallel (text, built environment, natural environment)
  console.log('[GeoAnalysis] Phase 1: Running 3 clue experts...');
  const clueExperts = await runAllClueExperts(imageParts, hints);

  if (clueExperts.length === 0) {
    throw new Error('All expert analyses failed. Please try again.');
  }

  // Log what each expert found
  for (const expert of clueExperts) {
    console.log(`[ClueExpert:${expert.expertType}] Found ${expert.searchableClues?.length || 0} searchable clues`);
    if (expert.searchableClues && expert.searchableClues.length > 0) {
      const topClues = expert.searchableClues.slice(0, 3).map(c => c.clue).join(', ');
      console.log(`  Top clues: ${topClues}`);
    }
  }

  // ============ PHASE 2: AGGREGATE CLUES ============
  console.log('[GeoAnalysis] Phase 2: Aggregating clues from all experts...');
  const aggregatedClues = aggregateClues(clueExperts);

  console.log(`[GeoAnalysis] Total: ${aggregatedClues.searchableClues.length} searchable clues`);
  console.log(`[GeoAnalysis] Text found: ${aggregatedClues.allText.slice(0, 5).join(', ')}`);
  console.log(`[GeoAnalysis] Queries to try: ${aggregatedClues.suggestedSearchQueries.slice(0, 5).join(', ')}`);

  // ============ PHASE 3: FINAL SEARCH FOR SPECIFIC LOCATION ============
  console.log('[GeoAnalysis] Phase 3: Searching for SPECIFIC location...');

  try {
    const result = await runFinalSearch(imageParts, aggregatedClues, hints);

    console.log(`[GeoAnalysis] Final result: ${result.locationName}`);
    console.log(`[GeoAnalysis] Confidence: ${result.confidenceScore}% (region: ${result.confidence?.region}%, local: ${result.confidence?.local}%)`);

    // Always mark as definitive - we focus on ONE location
    // Alternatives are saved as notes only
    result.isDefinitive = true;
    result.candidates = undefined;  // No multi-candidate display

    // Convert uncertainties into alternative locations if not enough alternatives
    if ((!result.alternativeLocations || result.alternativeLocations.length === 0) && result.uncertainties) {
      // Extract any location mentions from uncertainties
      result.alternativeLocations = result.uncertainties
        .filter(u => u.toLowerCase().includes('could be') || u.toLowerCase().includes('also possible'))
        .slice(0, 3);
    }

    return result;
  } catch (searchError: any) {
    console.log(`[GeoAnalysis] Final search failed: ${searchError.message}`);

    // Fallback: return basic result from clues without search
    const fallbackResult: GeoAnalysisResult = {
      locationName: 'Location could not be determined',
      coordinates: null,
      confidenceScore: 20,
      confidence: { region: 20, local: 5 },
      isDefinitive: true,
      candidates: undefined,
      reasoning: [
        'Analysis based on visual clues only (search failed)',
        `Found ${aggregatedClues.searchableClues.length} clues but could not verify via search`,
        ...aggregatedClues.suggestedSearchQueries.slice(0, 3).map(q => `Suggested search: "${q}"`)
      ],
      evidence: aggregatedClues.searchableClues.map(c => ({
        clue: c.clue,
        strength: c.type === 'business_name' || c.type === 'street_name' ? 'hard' as const : 'medium' as const,
        supports: 'Unknown - search failed'
      })),
      alternativeLocations: [],
      uncertainties: ['Could not perform web search to verify location'],
      visualCues: {
        signs: aggregatedClues.allText.join('; '),
        architecture: aggregatedClues.allInfrastructure.join('; '),
        environment: aggregatedClues.allNature.join('; '),
        demographics: ''
      },
      searchQueriesUsed: aggregatedClues.suggestedSearchQueries,
      sources: []
    };

    console.log(`[GeoAnalysis] Returning fallback with ${aggregatedClues.searchableClues.length} clues`);
    return fallbackResult;
  }
};

export const refineImageLocation = async (
  images: { base64: string, mimeType: string }[],
  previousResult: GeoAnalysisResult,
  userFeedback: string,
  hints?: LocationHints
): Promise<GeoAnalysisResult> => {
  const basePrompt = `**Refinement Task**:
You previously analyzed these images and concluded: "${previousResult.locationName}".

**User Feedback/Challenge**:
"${userFeedback}"

**Instructions**:
1. Critically re-examine all provided images. Perform a "Red Team" analysis: actively look for evidence that contradicts your previous finding or supports the user's hint.
2. If the user provided specific details (e.g., "The sign says X"), prioritize searching for that detail using Google Search.
3. Double-check the consistency of the environment (sun position, vegetation, road markings) with the claimed location.
4. Return an UPDATED JSON object with the exact same structure as the original. If the location changes, explain why in the 'reasoning' array. If it remains the same, provide stronger evidence.
IMPORTANT: Return ONLY valid JSON.`;

  const promptText = buildPromptWithHints(basePrompt, hints);
  const imageParts = images.map(img => ({
    inlineData: { mimeType: img.mimeType, data: img.base64 }
  }));

  const response = await callGeminiWithRetry(imageParts, promptText);
  return processGeminiResponse(response);
};

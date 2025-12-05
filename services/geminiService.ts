import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { GeoAnalysisResult, LocationHints } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are an expert Open Source Intelligence (OSINT) geolocation analyst. Your goal is to determine the precise location of the provided photograph(s). If multiple images are provided, they are from the same location or immediate vicinity (e.g., different angles, close-ups).

### OSINT METHODOLOGY & BEST PRACTICES
1.  **Visual Analysis (The "CSI" Approach)**:
    *   **Text/Signs**: Language, fonts, specific business names (search them!), street names, license plate formats/colors.
    *   **Architecture**: Building styles, roof types, window shapes, materials (brick vs. siding).
    *   **Infrastructure Fingerprinting**:
        *   **Roads**: Lane markings (white vs. yellow), dashed line patterns, pedestrian crossing styles.
        *   **Utility Poles**: Material (wood/concrete/metal), insulator shapes, grounding wire guards.
        *   **Traffic Lights**: Orientation (vertical vs. horizontal), housing color (yellow/black).
    *   **Biogeography**: Identify specific tree species (e.g., Stone Pines vs. Norfolk Pines), soil color (red clay, sandy), topography.
    *   **Solar/Shadow Analysis**: Use shadow direction/length to estimate approximate latitude or cardinal direction relative to time (if inferable).
    *   **Context**: Weather, clothing styles, vehicle makes (and driving side - LHT vs RHT).

2.  **Verification (Grounding)**:
    *   Use 'googleSearch' and 'googleMaps' to verify visual clues.
    *   **Crucial**: Search for exact strings found in the image (e.g., "Cafe de la Gare" + city candidate).
    *   Look for repetitions in search results to statistically validate the location.

3.  **Output Formatting**:
    *   You MUST return the response as a VALID JSON OBJECT.
    *   Do NOT include Markdown formatting (like \`\`\`json).
    *   The JSON must follow this exact structure:
    {
      "locationName": "The specific address, city, or region identified.",
      "coordinates": { "lat": number, "lng": number } or null,
      "confidenceScore": number (0-100),
      "reasoning": ["List of logical steps and evidence used..."],
      "visualCues": {
        "signs": "Analysis of text...",
        "architecture": "Analysis of buildings...",
        "environment": "Analysis of nature...",
        "demographics": "Analysis of people..."
      },
      "searchQueriesUsed": ["Search query 1", "Search query 2"]
    }
`;

const parseResponse = (text: string | undefined): any => {
    if (!text) {
         throw new Error("The AI provided no response. This often happens if the image triggers safety filters (e.g., identifiable people, license plates, or potential privacy concerns). Try cropping the image or using a different angle.");
    }
    try {
        // Find the first opening brace and the last closing brace to extract JSON
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

    if (hints && (hints.continent || hints.country || hints.city)) {
      promptText += "\n\nAdditional Context provided by user (use as hints, but verify visually):";
      if (hints.continent) promptText += `\n- Continent: ${hints.continent}`;
      if (hints.country) promptText += `\n- Country: ${hints.country}`;
      if (hints.city) promptText += `\n- City: ${hints.city}`;
    }

    const imageParts = images.map(img => ({
        inlineData: { mimeType: img.mimeType, data: img.base64 }
    }));

    const response = await ai.models.generateContent({
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
    userFeedback: string
): Promise<GeoAnalysisResult> => {
    try {
        const promptText = `
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

        const imageParts = images.map(img => ({
            inlineData: { mimeType: img.mimeType, data: img.base64 }
        }));

        const response = await ai.models.generateContent({
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

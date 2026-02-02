import { GoogleGenAI, Type } from "@google/genai";

/**
 * Generate a face embedding/descriptor from a base64 image
 * Uses Gemini AI to extract facial features for matching
 */
export async function generateFaceEmbedding(base64Image: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        {
          text: `Analyze this face and extract detailed facial features for biometric identification. 
          Return a comprehensive descriptor including: face shape, eye characteristics, nose structure, 
          mouth features, facial proportions, and any distinctive markers. 
          Be extremely detailed and precise for accurate matching.`
        }
      ]
    }
  });

  return response.text || '';
}

/**
 * Match a captured face against a stored face embedding
 * Returns confidence score (0-100)
 */
export async function matchFaceEmbedding(
  capturedBase64: string,
  storedEmbedding: string
): Promise<{ match: boolean; confidence: number }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: capturedBase64 } },
        {
          text: `Compare this face with the following stored facial descriptor and determine if they match the same person.
          
Stored descriptor: ${storedEmbedding}

Analyze facial features, proportions, and unique characteristics. Return JSON only with match confidence.
Consider lighting, angle, and expression variations but focus on permanent facial structure.

Return format: { "match": boolean, "confidence": number (0-100), "reasoning": string }`
        }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          match: { type: Type.BOOLEAN },
          confidence: { type: Type.NUMBER },
          reasoning: { type: Type.STRING }
        },
        required: ["match", "confidence", "reasoning"]
      }
    }
  });

  const result = JSON.parse(response.text || '{"match": false, "confidence": 0}');
  return {
    match: result.confidence >= 85, // High threshold for security
    confidence: result.confidence
  };
}

/**
 * Verify gender from face image
 */
export async function verifyGender(base64Image: string): Promise<{
  faceDetected: boolean;
  isFemale: boolean;
  confidence: number;
}> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        {
          text: `Identity Protocol: This app is strictly for women's safety. 
          1. Confirm face detection. 
          2. Verify if the person is female. 
          Return JSON only: { "faceDetected": boolean, "isFemale": boolean, "confidence": number }.`
        }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          faceDetected: { type: Type.BOOLEAN },
          isFemale: { type: Type.BOOLEAN },
          confidence: { type: Type.NUMBER }
        },
        required: ["faceDetected", "isFemale", "confidence"]
      }
    }
  });

  return JSON.parse(response.text || '{"faceDetected": false, "isFemale": false, "confidence": 0}');
}

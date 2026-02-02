
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { GeminiAnalysisResult } from "../types";

export const analyzeSafetyImage = async (base64Image: string): Promise<GeminiAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          { text: "Analyze this image for women's safety in an Indian urban context. Focus on 3 aspects: 1. Lighting, 2. Crowd, 3. Shops. Return a JSON response." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            psiScore: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            detectedSafetyFeatures: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendation: { type: Type.STRING },
            lighting: { type: Type.STRING },
            crowd: { type: Type.STRING },
            shops: { type: Type.STRING }
          },
          required: ["psiScore", "reasoning", "detectedSafetyFeatures", "recommendation", "lighting", "crowd", "shops"]
        }
      }
    });
    return JSON.parse(response.text || '{}') as GeminiAnalysisResult;
  } catch (error) {
    console.error("Gemini Image Analysis Failed:", error);
    return {
      psiScore: 50,
      reasoning: "Safety analysis unavailable.",
      detectedSafetyFeatures: ["Manual Review Needed"],
      recommendation: "Stay in well-lit areas.",
      lighting: 'moderate',
      crowd: 'moderate',
      shops: 'open'
    };
  }
};

export interface RouteSafetyAnalysis {
  safetyScore: number;
  summary: string;
  riskFactors: string[];
  safeZones: string[];
  sources: any[];
  heatmapData?: Array<{ lat: number; lng: number; psi: number }>;
}

export const getRouteSafetyAdviceWithSearch = async (start: string, end: string, time: string): Promise<RouteSafetyAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Assess travel safety for a woman going from ${start} to ${end} at ${time}.
      Identify potential risks (unlit roads, isolated areas, recent crime reports) and safe spots (police stations, busy markets, 24/7 shops).
      Use Google Search to check for recent safety incidents in these areas.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safetyScore: { type: Type.NUMBER, description: "Safety score 0-100 based on lighting, crowd, and incidents" },
            summary: { type: Type.STRING, description: "Brief executive summary of the route safety in 15 words." },
            riskFactors: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of 3 specific risks like 'Poor lighting on Main St' or 'Isolated stretch'." },
            safeZones: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of 3 safe landmarks like 'City Mall' or 'Police Chowki'." }
          },
          required: ["safetyScore", "summary", "riskFactors", "safeZones"]
        }
      }
    });

    const json = JSON.parse(response.text || '{}');
    return {
      safetyScore: json.safetyScore || 75,
      summary: json.summary || "Exercise standard caution. Stick to main roads.",
      riskFactors: json.riskFactors || ["Avoid unlit shortcuts."],
      safeZones: json.safeZones || ["Busy intersections"],
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error: any) {
    if (error?.message?.includes('429')) {
      console.warn("Gemini Quota Exceeded (429). Using mock safety data for demo.");
    } else {
      console.error("Gemini Route Search Failed:", error);
    }
    return {
      safetyScore: 85,
      summary: "Demo Mode: Standard safety patterns applied. Main roads are well-lit.",
      riskFactors: ["Stick to main brightly lit corridors.", "Avoid isolated shortcuts after 9 PM."],
      safeZones: ["Police Stations", "24/7 Pharmacies", "Open Supermarkets"],
      sources: []
    };
  }
};

export const generateSafetyReel = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `A realistic 5-second street view video of a safe, well-lit Indian urban street at night with ${prompt}. High quality, cinematic, security camera style.`,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  return `${downloadLink}&key=${process.env.API_KEY}`;
};

export const speakSafetyAdvice = async (text: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Safety Advisory: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const dataInt16 = new Int16Array(bytes.buffer);
      const buffer = audioContext.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
    }
  } catch (e) {
    console.error("TTS Failed", e);
  }
};

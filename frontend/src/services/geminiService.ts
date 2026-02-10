
import { GoogleGenAI, Type } from "@google/genai";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const askDetailedAssistant = async (question: string, contextData: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "Error: API Key not configured. Please set your Gemini API key.";

  try {
    const systemPrompt = `
      You are an elite UK Tax and Business Performance Consultant for self-employed delivery drivers.
      Provide detailed, HMRC-compliant advice. 
      You now have access to the user's Work Log (Revenue, Hours, MPG) in addition to Miles and Expenses.
      
      Context of User's Current Records:
      ${contextData}

      Rules:
      1. Reference HMRC manuals for taxes.
      2. Provide productivity advice if requested (e.g. how to improve earnings per mile/hour).
      3. Use British English.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: question,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      }
    });

    return response.text || "I couldn't generate a response.";
  } catch (error) {
    return "The assistant is currently unavailable.";
  }
};

export const getQuickAdvice = async (prompt: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "";
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        systemInstruction: "You are a helpful tax assistant. Provide a very short (1 sentence) response.",
        temperature: 0.2,
      }
    });
    return response.text?.trim() || "";
  } catch (error) {
    return "";
  }
};

export const analyzeReceipt = async (base64Data: string, mimeType: string): Promise<any> => {
  const ai = getAiClient();
  if (!ai) return null;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Data.split(',')[1] || base64Data, mimeType } },
          { text: `Analyze this UK receipt. Extract Total, Date (YYYY-MM-DD), Category, and Vendor. Return JSON.` },
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            date: { type: Type.STRING },
            category: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ["amount", "date", "description"]
        }
      }
    });
    return response.text ? JSON.parse(response.text) : null;
  } catch (error) {
    return null;
  }
};

declare module '@google/genai' {
  export const Type: {
    OBJECT: string;
    NUMBER: string;
    STRING: string;
  };

  export class GoogleGenAI {
    constructor(config: { apiKey: string });
    models: {
      generateContent(args: unknown): Promise<{ text?: string }>;
    };
  }
}

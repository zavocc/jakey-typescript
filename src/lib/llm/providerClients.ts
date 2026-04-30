import { GoogleGenAI } from '@google/genai';

export const GoogleClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

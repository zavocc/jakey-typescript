import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// genai
export const GoogleClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// openai
export const OpenRouterClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

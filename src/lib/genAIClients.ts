import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// genai
export const GoogleClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// openai
export const OpenAIClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_PROVIDER_CUSTOM_BASEURL
});

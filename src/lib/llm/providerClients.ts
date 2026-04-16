import { getConfigJsonKeySync } from '../../lib/configuratorJSON';
import OpenAI from 'openai';

export const GoogleClient = new OpenAI({
  apiKey: getConfigJsonKeySync("api_keys")?.google ?? "",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

export const OpenRouterClient = new OpenAI({
  apiKey: getConfigJsonKeySync("api_keys")?.openrouter ?? "",
  baseURL: "https://openrouter.ai/api/v1"
});

export const OpenAIClient = new OpenAI({
  apiKey: getConfigJsonKeySync("api_keys")?.openai ?? "",
});

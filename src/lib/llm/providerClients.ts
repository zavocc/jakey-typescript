import { getConfigJsonKeySync } from "../../lib/configuratorJSON.js";
import { GoogleGenAI } from '@google/genai';

export const GoogleClient = new GoogleGenAI({
  apiKey: getConfigJsonKeySync("api_keys")?.google ?? ""
});

import { getConfigJsonKeySync } from '../../lib/configuratorJSON';
import { GoogleGenAI } from '@google/genai';

export const GoogleClient = new GoogleGenAI({
  apiKey: getConfigJsonKeySync("api_keys")?.google ?? ""
});
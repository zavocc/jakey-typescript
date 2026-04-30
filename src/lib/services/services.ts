import { startDB, stopDB } from "./mongodb/index.js";
import { GoogleGenAI } from '@google/genai';

export async function startServices(): Promise<void> {
  // database
  await startDB();
  console.log("All services started successfully.");
}

export async function stopServices(): Promise<void> {
  // database
  await stopDB();
  console.log("All services stopped successfully.");
}

// genai
export const GoogleClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

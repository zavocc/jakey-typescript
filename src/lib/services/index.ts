import logger from "../pinoLogger.js";
import { startDB, stopDB } from "./mongodb/index.js";
import { GoogleGenAI } from '@google/genai';

const childLogger = logger.child({ module: "lib.services" });

export async function startServices(): Promise<void> {
  // database
  await startDB();
  childLogger.info("All services started successfully.");
}

export async function stopServices(): Promise<void> {
  // database
  await stopDB();
  childLogger.info("All services stopped successfully.");
}

// genai
export const GoogleClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

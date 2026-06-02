import { createModuleLogger } from "../pinoLogger.js";
import { startDB, stopDB } from "./mongodb/index.js";
const childLogger = createModuleLogger(import.meta.url);

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

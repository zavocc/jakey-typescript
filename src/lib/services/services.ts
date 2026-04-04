import { startDB, stopDB } from "./mongodb";

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
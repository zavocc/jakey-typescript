import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createModuleLogger } from "../lib/pinoLogger.js";
import type { Message } from "discord.js";
import type { ModelProps } from "../types/schemas.js";
import type { FileMetadata } from "./types.js";

const childLogger = createModuleLogger(import.meta.url);

export type LLMExecuteFn = (
  prompt: string,
  model_props: ModelProps,
  discord_user_id: string,
  discord_interaction: Message,
  attachment_urls?: Array<FileMetadata>
) => Promise<void>;

// Detect the current runtime extension (.ts during tsx development, or .js in production)
const runtimeExtension = path.extname(fileURLToPath(import.meta.url));

export async function pullAgent(provider: "google" | "openai"): Promise<LLMExecuteFn> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const agentPath = path.join(currentDir, "providers", provider, `agent${runtimeExtension}`);

  // Check if the agent file exists
  if (!fs.existsSync(agentPath)) {
    throw new Error(`Agent file for provider '${provider}' does not exist at path: ${agentPath}`);
  }

  // Get the file URL for dynamic ESM import
  const agentUrl = pathToFileURL(agentPath).href;
  const module = await import(agentUrl);

  // Validate the presence of llmExecute
  if (typeof module.llmExecute !== "function") {
    throw new Error(`Agent for provider '${provider}' is missing the exported 'llmExecute' function.`);
  }

  childLogger.info({ agent_path: agentPath }, "Loaded agent...")
  return module.llmExecute as LLMExecuteFn;
}

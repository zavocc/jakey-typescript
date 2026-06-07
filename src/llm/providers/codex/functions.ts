import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createModuleLogger } from "../../../lib/pinoLogger.js";
import type {
  CodexDynamicToolSpec,
  CodexGeneratedImage,
  CodexReasoningEffort,
  CodexThreadResponse,
  CodexTokenUsage,
  CodexTurnStartResponse,
  JsonValue,
} from "./types.js";

const childLogger = createModuleLogger(import.meta.url);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readStoredThreadId(context: unknown): string | null {
  if (!Array.isArray(context)) {
    return null;
  }

  const firstItem = context.at(0);
  if (!isRecord(firstItem) || typeof firstItem.threadId !== "string") {
    return null;
  }

  return firstItem.threadId;
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

export function toCodexDynamicTools(schemas: unknown[]): CodexDynamicToolSpec[] {
  const dynamicTools: CodexDynamicToolSpec[] = [];

  for (const schema of schemas) {
    if (!isRecord(schema) || typeof schema.name !== "string" || typeof schema.description !== "string") {
      continue;
    }

    dynamicTools.push({
      namespace: "jakey",
      name: schema.name,
      description: schema.description,
      inputSchema: isJsonValue(schema.parameters) ? schema.parameters : {
        type: "object",
        properties: {},
      },
    });
  }

  return dynamicTools;
}

export function jsonRecordOrEmpty(value: JsonValue): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function stringifyToolResult(toolResult: unknown): string {
  if (typeof toolResult === "string") {
    return toolResult;
  }

  if (typeof toolResult === "bigint") {
    return `${toolResult}`;
  }

  return JSON.stringify(toolResult);
}

export function parseReasoningEffort(additionalProperties: Record<string, unknown> | undefined): CodexReasoningEffort | undefined {
  if (!additionalProperties || typeof additionalProperties.reasoning_effort !== "string") {
    return undefined;
  }

  if (
    additionalProperties.reasoning_effort === "none" ||
    additionalProperties.reasoning_effort === "minimal" ||
    additionalProperties.reasoning_effort === "low" ||
    additionalProperties.reasoning_effort === "medium" ||
    additionalProperties.reasoning_effort === "high" ||
    additionalProperties.reasoning_effort === "xhigh"
  ) {
    return additionalProperties.reasoning_effort;
  }

  throw new Error(`Unsupported Codex reasoning effort: ${additionalProperties.reasoning_effort}`);
}

export function formatContextUsage(tokenUsage: CodexTokenUsage | null): string {
  if (!tokenUsage) {
    return "Context: unavailable";
  }

  if (tokenUsage.modelContextWindow) {
    return `Context: ${tokenUsage.totalTokens}/${tokenUsage.modelContextWindow} tokens`;
  }

  return `Context: ${tokenUsage.totalTokens} tokens`;
}

export function imageFileName(mimeType: string, index: number): string {
  if (mimeType === "image/jpeg") {
    return `codex-image-${index}.jpg`;
  }

  if (mimeType === "image/webp") {
    return `codex-image-${index}.webp`;
  }

  return `codex-image-${index}.png`;
}

export function extractAgentMessagesFromTurn(turn: unknown): string[] {
  if (!isRecord(turn) || !Array.isArray(turn.items)) {
    return [];
  }

  const agentMessages: string[] = [];
  for (const item of turn.items) {
    if (!isRecord(item) || item.type !== "agentMessage" || typeof item.text !== "string") {
      continue;
    }
    agentMessages.push(item.text);
  }

  return agentMessages;
}

export function parseThreadResponse(value: unknown): CodexThreadResponse {
  if (!isRecord(value) || !isRecord(value.thread) || typeof value.thread.id !== "string" || typeof value.model !== "string") {
    throw new Error("Invalid Codex thread response.");
  }

  return {
    thread: {
      id: value.thread.id,
    },
    model: value.model,
  };
}

export function parseTurnStartResponse(value: unknown): CodexTurnStartResponse {
  if (!isRecord(value) || !isRecord(value.turn) || typeof value.turn.id !== "string") {
    throw new Error("Invalid Codex turn response.");
  }

  return {
    turn: {
      id: value.turn.id,
    },
  };
}

export function parseTokenUsage(value: unknown): CodexTokenUsage | null {
  if (!isRecord(value) || !isRecord(value.tokenUsage) || !isRecord(value.tokenUsage.total)) {
    return null;
  }

  const total = value.tokenUsage.total;
  if (
    typeof total.totalTokens !== "number" ||
    typeof total.inputTokens !== "number" ||
    typeof total.cachedInputTokens !== "number" ||
    typeof total.outputTokens !== "number" ||
    typeof total.reasoningOutputTokens !== "number"
  ) {
    return null;
  }

  return {
    totalTokens: total.totalTokens,
    inputTokens: total.inputTokens,
    cachedInputTokens: total.cachedInputTokens,
    outputTokens: total.outputTokens,
    reasoningOutputTokens: total.reasoningOutputTokens,
    modelContextWindow: typeof value.tokenUsage.modelContextWindow === "number" ? value.tokenUsage.modelContextWindow : null,
  };
}

export function parseDataUrlImage(value: string): { buffer: Buffer; mimeType: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(value);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export function imageMimeTypeFromPath(imagePath: string): string {
  const extension = path.extname(imagePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/png";
}

export async function parseGeneratedImageItem(item: unknown): Promise<CodexGeneratedImage | null> {
  if (!isRecord(item) || item.type !== "imageGeneration") {
    return null;
  }

  const revisedPrompt = typeof item.revisedPrompt === "string" ? item.revisedPrompt : null;

  if (typeof item.savedPath === "string" && item.savedPath.trim() !== "") {
    return {
      buffer: await readFile(item.savedPath),
      mimeType: imageMimeTypeFromPath(item.savedPath),
      revisedPrompt,
    };
  }

  if (typeof item.result !== "string" || item.result.trim() === "") {
    return null;
  }

  const dataUrlImage = parseDataUrlImage(item.result);
  if (dataUrlImage) {
    return {
      ...dataUrlImage,
      revisedPrompt,
    };
  }

  return {
    buffer: Buffer.from(item.result, "base64"),
    mimeType: "image/png",
    revisedPrompt,
  };
}

export function resolveCodexLauncher(): { command: string; argsPrefix: string[] } {
  if (process.env.CODEX_CLI_PATH) {
    return { command: process.env.CODEX_CLI_PATH, argsPrefix: [] };
  }

  const require = createRequire(import.meta.url);
  const candidatePackageJsons: string[] = [];

  try {
    candidatePackageJsons.push(require.resolve("@openai/codex/package.json"));
  } catch {
    childLogger.debug("Direct @openai/codex package is not resolvable; checking codex-sdk nested dependency.");
  }

  try {
    const codexSdkPackageJson = require.resolve("@openai/codex-sdk/package.json");
    candidatePackageJsons.push(path.join(path.dirname(codexSdkPackageJson), "node_modules", "@openai", "codex", "package.json"));
  } catch {
    childLogger.debug("@openai/codex-sdk package is not resolvable for Codex CLI fallback.");
  }

  for (const packageJsonPath of candidatePackageJsons) {
    const codexEntrypoint = path.join(path.dirname(packageJsonPath), "bin", "codex.js");
    if (existsSync(codexEntrypoint)) {
      return { command: process.execPath, argsPrefix: [codexEntrypoint] };
    }
  }

  return { command: "codex", argsPrefix: [] };
}

export async function getCodexWorkingDirectory(): Promise<string> {
  const workingDirectory = path.join(process.cwd(), "codex_workspace");
  await mkdir(workingDirectory, { recursive: true });
  return workingDirectory;
}

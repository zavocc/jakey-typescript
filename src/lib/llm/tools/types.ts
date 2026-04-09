import type { Message } from "discord.js";

export type LocalToolHandler = (
  discord_interaction: Message,
  params: any,
) => Promise<string>;

type LoadedToolBase = {
  name: string;
  interstitialLabel: string;
};

export type McpTransportPreference = "auto" | "streamable-http" | "sse";

export type LocalLoadedTool = LoadedToolBase & {
  sourceType: "builtin" | "api";
  execute: LocalToolHandler;
};

export type McpLoadedTool = LoadedToolBase & {
  sourceType: "mcp";
  mcpServerName: string;
  mcpToolName: string;
  mcpServerUrl: string;
  headers?: Record<string, string>;
  transport?: McpTransportPreference;
};

export type LoadedTool = LocalLoadedTool | McpLoadedTool;

export type ToolPack = {
  schemas: unknown[];
  tools: Record<string, LoadedTool>;
};

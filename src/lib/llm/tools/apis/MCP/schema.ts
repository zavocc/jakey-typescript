import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { listMcpToolsForServer, loadMcpServerConfigs } from "./client";
import type { LoadedTool, McpLoadedTool, ToolPack } from "../../types";

export const TOOL_HUMAN_NAME = "MCP";

type OpenAIToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

function sanitizeFunctionSegment(value: string): string {
  const sanitizedValue = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitizedValue || "tool";
}

function createExposedToolName(serverName: string, toolName: string): string {
  return `mcp_${sanitizeFunctionSegment(serverName)}__${sanitizeFunctionSegment(toolName)}`;
}

function createOpenAIToolSchema(
  serverName: string,
  tool: Tool,
): OpenAIToolSchema {
  return {
    type: "function",
    function: {
      name: createExposedToolName(serverName, tool.name),
      description: `[MCP:${serverName}] ${tool.description ?? "Remote MCP tool"}`,
      parameters: tool.inputSchema ?? {
        type: "object",
        properties: {},
      },
    },
  };
}

function createLoadedMcpTool(serverName: string, tool: Tool): McpLoadedTool {
  return {
    sourceType: "mcp",
    name: createExposedToolName(serverName, tool.name),
    interstitialLabel: `MCP: ${serverName}.${tool.name}`,
    mcpServerName: serverName,
    mcpToolName: tool.name,
    mcpServerUrl: "",
  };
}

export async function isToolAvailable(): Promise<boolean> {
  const mcpServers = await loadMcpServerConfigs();
  return Object.keys(mcpServers).length > 0;
}

export async function getDynamicToolPack(): Promise<Pick<ToolPack, "schemas" | "tools">> {
  const mcpServers = await loadMcpServerConfigs();
  const schemas: OpenAIToolSchema[] = [];
  const tools: Record<string, LoadedTool> = {};

  for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
    try {
      const serverTools = await listMcpToolsForServer(serverName);

      for (const tool of serverTools) {
        const exposedToolName = createExposedToolName(serverName, tool.name);

        schemas.push(createOpenAIToolSchema(serverName, tool));
        tools[exposedToolName] = {
          ...createLoadedMcpTool(serverName, tool),
          mcpServerUrl: serverConfig.url,
          headers: serverConfig.headers,
          transport: serverConfig.transport,
        };
      }
    } catch (error) {
      console.error(`Failed to load MCP tools from server "${serverName}":`, error);
    }
  }

  return {
    schemas,
    tools,
  };
}

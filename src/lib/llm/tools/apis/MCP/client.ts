import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpTransportPreference } from "../../types";

const MCP_CLIENT_INFO = {
  name: "jakey-typescript",
  version: "2.0.0",
};

const McpServerConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  transport: z.enum(["auto", "streamable-http", "sse"]).optional(),
});

const McpConfigSchema = z.object({
  mcpServers: z.record(z.string(), McpServerConfigSchema),
});

type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

type NamedMcpServerConfig = McpServerConfig & {
  name: string;
};

type ConnectedMcpClient = {
  client: Client;
  transport: SSEClientTransport | StreamableHTTPClientTransport;
};

const MCP_JSON_CANDIDATE_PATHS = [
  path.resolve(process.cwd(), "src/lib/llm/tools/mcp.json"),
  path.resolve(process.cwd(), "dist/lib/llm/tools/mcp.json"),
  path.resolve(__dirname, "../../mcp.json"),
];

async function resolveMcpJsonPath(): Promise<string | null> {
  for (const candidatePath of MCP_JSON_CANDIDATE_PATHS) {
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      continue;
    }
  }

  return null;
}

export async function hasMcpConfig(): Promise<boolean> {
  return (await resolveMcpJsonPath()) !== null;
}

export async function loadMcpServerConfigs(): Promise<Record<string, McpServerConfig>> {
  const mcpJsonPath = await resolveMcpJsonPath();

  if (!mcpJsonPath) {
    return {};
  }

  const fileContent = await readFile(mcpJsonPath, "utf-8");
  const parsedConfig = McpConfigSchema.parse(JSON.parse(fileContent));

  return parsedConfig.mcpServers;
}

async function getNamedServerConfig(serverName: string): Promise<NamedMcpServerConfig> {
  const serverConfigs = await loadMcpServerConfigs();
  const serverConfig = serverConfigs[serverName];

  if (!serverConfig) {
    throw new Error(`MCP server "${serverName}" was not found in mcp.json.`);
  }

  return {
    ...serverConfig,
    name: serverName,
  };
}

function createClient(): Client {
  return new Client(MCP_CLIENT_INFO, {
    capabilities: {},
  });
}

function buildRequestInit(
  headers?: Record<string, string>,
): RequestInit | undefined {
  if (!headers || Object.keys(headers).length === 0) {
    return undefined;
  }

  return {
    headers,
  };
}

function mergeHeaders(
  existingHeaders: HeadersInit | undefined,
  nextHeaders: Record<string, string>,
): Headers {
  const mergedHeaders = new Headers(existingHeaders);

  for (const [headerName, headerValue] of Object.entries(nextHeaders)) {
    mergedHeaders.set(headerName, headerValue);
  }

  return mergedHeaders;
}

function buildEventSourceInit(
  headers?: Record<string, string>,
): { fetch?: typeof fetch } | undefined {
  if (!headers || Object.keys(headers).length === 0) {
    return undefined;
  }

  return {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        headers: mergeHeaders(init?.headers, headers),
      }),
  };
}

async function connectWithTransport(
  server: NamedMcpServerConfig,
  transportPreference: Exclude<McpTransportPreference, "auto">,
): Promise<ConnectedMcpClient> {
  const serverUrl = new URL(server.url);
  const client = createClient();
  const requestInit = buildRequestInit(server.headers);

  const transport = transportPreference === "sse"
    ? new SSEClientTransport(serverUrl, {
        eventSourceInit: buildEventSourceInit(server.headers),
        requestInit,
      })
    : new StreamableHTTPClientTransport(serverUrl, {
        requestInit,
      });

  await client.connect(transport);

  return {
    client,
    transport,
  };
}

function shouldFallbackToLegacySse(error: unknown): boolean {
  if (error instanceof StreamableHTTPError) {
    return error.code === 400 || error.code === 404 || error.code === 405;
  }

  if (error instanceof Error) {
    return /400|404|405/.test(error.message);
  }

  return false;
}

async function connectMcpClient(
  server: NamedMcpServerConfig,
): Promise<ConnectedMcpClient> {
  const configuredTransport = server.transport ?? "auto";

  if (configuredTransport === "sse") {
    return connectWithTransport(server, "sse");
  }

  if (configuredTransport === "streamable-http") {
    return connectWithTransport(server, "streamable-http");
  }

  try {
    return await connectWithTransport(server, "streamable-http");
  } catch (error) {
    if (!shouldFallbackToLegacySse(error)) {
      throw error;
    }

    return connectWithTransport(server, "sse");
  }
}

async function disconnectMcpClient(connection: ConnectedMcpClient): Promise<void> {
  if (connection.transport instanceof StreamableHTTPClientTransport) {
    try {
      await connection.transport.terminateSession();
    } catch {
      // Some servers do not allow client-initiated session termination.
    }
  }

  await connection.client.close();
}

async function withMcpClient<T>(
  serverName: string,
  runner: (client: Client) => Promise<T>,
): Promise<T> {
  const server = await getNamedServerConfig(serverName);
  const connection = await connectMcpClient(server);

  try {
    return await runner(connection.client);
  } finally {
    await disconnectMcpClient(connection);
  }
}

export async function listMcpToolsForServer(serverName: string): Promise<Tool[]> {
  return withMcpClient(serverName, async (client) => {
    const tools: Tool[] = [];
    let cursor: string | undefined;

    do {
      const response = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...response.tools);
      cursor = response.nextCursor;
    } while (cursor);

    return tools;
  });
}

function normalizeToolArguments(params: unknown): Record<string, unknown> {
  if (params === undefined || params === null) {
    return {};
  }

  if (typeof params !== "object" || Array.isArray(params)) {
    throw new Error("MCP tool arguments must be a JSON object.");
  }

  return params as Record<string, unknown>;
}

export async function callMcpTool(
  serverName: string,
  toolName: string,
  params: unknown,
): Promise<string> {
  return withMcpClient(serverName, async (client) => {
    const result = await client.callTool({
      name: toolName,
      arguments: normalizeToolArguments(params),
    });

    return JSON.stringify(result, null, 2);
  });
}

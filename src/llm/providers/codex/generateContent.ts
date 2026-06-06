import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { createModuleLogger } from "../../../lib/pinoLogger.js";

const childLogger = createModuleLogger(import.meta.url);

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type CodexUserInput =
  | { type: "text"; text: string; text_elements: [] }
  | { type: "image"; url: string; detail?: "low" | "high" | "auto" };

export type CodexDynamicToolSpec = {
  namespace?: string;
  name: string;
  description: string;
  inputSchema: JsonValue;
  deferLoading?: boolean;
};

export type CodexReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type CodexDynamicToolCallParams = {
  threadId: string;
  turnId: string;
  callId: string;
  namespace: string | null;
  tool: string;
  arguments: JsonValue;
};

export type CodexDynamicToolCallResponse = {
  contentItems: Array<{ type: "inputText"; text: string } | { type: "inputImage"; imageUrl: string }>;
  success: boolean;
};

type CodexDynamicToolHandler = (params: CodexDynamicToolCallParams) => Promise<CodexDynamicToolCallResponse>;

type JsonRpcPending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type TurnResult = {
  finalResponse: string;
};

type TurnWaiter = {
  resolve: (value: TurnResult) => void;
  reject: (error: Error) => void;
};

type CodexThreadResponse = {
  thread: {
    id: string;
  };
  model: string;
};

type CodexTurnStartResponse = {
  turn: {
    id: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractAgentMessagesFromTurn(turn: unknown): string[] {
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

function parseThreadResponse(value: unknown): CodexThreadResponse {
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

function parseTurnStartResponse(value: unknown): CodexTurnStartResponse {
  if (!isRecord(value) || !isRecord(value.turn) || typeof value.turn.id !== "string") {
    throw new Error("Invalid Codex turn response.");
  }

  return {
    turn: {
      id: value.turn.id,
    },
  };
}

function resolveCodexLauncher(): { command: string; argsPrefix: string[] } {
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

async function getCodexWorkingDirectory(): Promise<string> {
  const workingDirectory = path.join(process.cwd(), "codex_workspace");
  await mkdir(workingDirectory, { recursive: true });
  return workingDirectory;
}

class CodexAppServerClient {
  private readonly childProcess: ChildProcessWithoutNullStreams;
  private readonly pendingRequests = new Map<string, JsonRpcPending>();
  private readonly turnWaiters = new Map<string, TurnWaiter>();
  private readonly completedTurns = new Map<string, TurnResult>();
  private readonly agentMessagesByTurn = new Map<string, string[]>();
  private nextRequestId = 1;

  public constructor(private readonly dynamicToolHandler: CodexDynamicToolHandler) {
    const launcher = resolveCodexLauncher();
    this.childProcess = spawn(launcher.command, [...launcher.argsPrefix, "app-server", "--stdio"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdoutLines = readline.createInterface({ input: this.childProcess.stdout });
    stdoutLines.on("line", (line) => this.handleLine(line));

    this.childProcess.stderr.on("data", (chunk: Buffer) => {
      childLogger.debug({ stderr: chunk.toString("utf8") }, "Codex app-server stderr");
    });

    this.childProcess.on("error", (error) => {
      this.rejectAll(new Error(`Codex app-server process error: ${error.message}`, { cause: error }));
    });

    this.childProcess.on("exit", (code, signal) => {
      this.rejectAll(new Error(`Codex app-server exited with code ${code ?? "null"} and signal ${signal ?? "null"}.`));
    });
  }

  public async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "jakey_discord_bot",
        title: "Jakey Discord Bot",
        version: "2.0.0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    });
    this.notify("initialized");
  }

  public async startThread(params: {
    model: string;
    cwd: string;
    baseInstructions: string;
    dynamicTools: CodexDynamicToolSpec[];
  }): Promise<CodexThreadResponse> {
    const response = await this.request("thread/start", {
      model: params.model,
      cwd: params.cwd,
      runtimeWorkspaceRoots: [],
      approvalPolicy: "never",
      sandbox: "read-only",
      baseInstructions: params.baseInstructions,
      dynamicTools: params.dynamicTools,
      environments: [],
      ephemeral: false,
    });
    return parseThreadResponse(response);
  }

  public async resumeThread(params: {
    threadId: string;
    model: string;
    cwd: string;
    baseInstructions: string;
  }): Promise<CodexThreadResponse> {
    const response = await this.request("thread/resume", {
      threadId: params.threadId,
      model: params.model,
      cwd: params.cwd,
      runtimeWorkspaceRoots: [],
      approvalPolicy: "never",
      sandbox: "read-only",
      baseInstructions: params.baseInstructions,
      environments: [],
      excludeTurns: true,
    });
    return parseThreadResponse(response);
  }

  public async runTurn(params: {
    threadId: string;
    model: string;
    cwd: string;
    reasoningEffort?: CodexReasoningEffort;
    input: CodexUserInput[];
  }): Promise<TurnResult> {
    const response = parseTurnStartResponse(await this.request("turn/start", {
      threadId: params.threadId,
      input: params.input,
      model: params.model,
      effort: params.reasoningEffort,
      cwd: params.cwd,
      runtimeWorkspaceRoots: [],
      environments: [],
      approvalPolicy: "never",
      sandboxPolicy: {
        type: "readOnly",
        networkAccess: false,
      },
    }));

    const completedTurn = this.completedTurns.get(response.turn.id);
    if (completedTurn) {
      return completedTurn;
    }

    return new Promise<TurnResult>((resolve, reject) => {
      this.turnWaiters.set(response.turn.id, { resolve, reject });
    });
  }

  public close(): void {
    if (!this.childProcess.killed) {
      this.childProcess.kill();
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const payload = { method, id, params };
    const serialized = `${JSON.stringify(payload)}\n`;

    return new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(String(id), { resolve, reject });
      this.childProcess.stdin.write(serialized, (error) => {
        if (error) {
          this.pendingRequests.delete(String(id));
          reject(new Error(`Failed to write Codex app-server request ${method}.`, { cause: error }));
        }
      });
    });
  }

  private notify(method: string): void {
    this.childProcess.stdin.write(`${JSON.stringify({ method })}\n`);
  }

  private handleLine(line: string): void {
    if (line.trim() === "") {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch (error) {
      childLogger.warn({ line, cause: error }, "Failed to parse Codex app-server JSON-RPC line.");
      return;
    }

    if (!isRecord(message)) {
      return;
    }

    if ("id" in message && ("result" in message || "error" in message)) {
      this.handleResponse(message);
      return;
    }

    if (typeof message.method === "string" && "id" in message) {
      void this.handleServerRequest(message);
      return;
    }

    if (typeof message.method === "string") {
      this.handleNotification(message);
    }
  }

  private handleResponse(message: Record<string, unknown>): void {
    const requestId = String(message.id);
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      return;
    }

    this.pendingRequests.delete(requestId);
    if (isRecord(message.error)) {
      pendingRequest.reject(new Error(typeof message.error.message === "string" ? message.error.message : "Codex app-server request failed."));
      return;
    }

    pendingRequest.resolve(message.result);
  }

  private async handleServerRequest(message: Record<string, unknown>): Promise<void> {
    if (message.method === "item/tool/call") {
      try {
        const params = this.parseDynamicToolCallParams(message.params);
        const result = await this.dynamicToolHandler(params);
        this.sendResult(message.id, result);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        this.sendResult(message.id, {
          contentItems: [{ type: "inputText", text: `Tool call failed: ${messageText}` }],
          success: false,
        });
      }
      return;
    }

    if (message.method === "item/commandExecution/requestApproval" || message.method === "execCommandApproval") {
      this.sendResult(message.id, { decision: "decline" });
      return;
    }

    if (message.method === "item/fileChange/requestApproval" || message.method === "applyPatchApproval") {
      this.sendResult(message.id, { decision: "decline" });
      return;
    }

    if (message.method === "item/permissions/requestApproval") {
      this.sendResult(message.id, { permissions: {}, scope: "turn" });
      return;
    }

    this.sendError(message.id, -32601, `Unsupported Codex app-server request: ${message.method}`);
  }

  private parseDynamicToolCallParams(value: unknown): CodexDynamicToolCallParams {
    if (
      !isRecord(value) ||
      typeof value.threadId !== "string" ||
      typeof value.turnId !== "string" ||
      typeof value.callId !== "string" ||
      typeof value.tool !== "string"
    ) {
      throw new Error("Invalid dynamic tool call payload.");
    }

    return {
      threadId: value.threadId,
      turnId: value.turnId,
      callId: value.callId,
      namespace: typeof value.namespace === "string" ? value.namespace : null,
      tool: value.tool,
      arguments: this.isJsonValue(value.arguments) ? value.arguments : {},
    };
  }

  private handleNotification(message: Record<string, unknown>): void {
    if (message.method === "item/completed" && isRecord(message.params)) {
      this.handleItemCompleted(message.params);
      return;
    }

    if (message.method === "turn/completed" && isRecord(message.params)) {
      this.handleTurnCompleted(message.params);
      return;
    }

    if (message.method === "error" && isRecord(message.params)) {
      const errorMessage = isRecord(message.params.error) && typeof message.params.error.message === "string"
        ? message.params.error.message
        : "Codex app-server emitted an error notification.";
      for (const waiter of this.turnWaiters.values()) {
        waiter.reject(new Error(errorMessage));
      }
      this.turnWaiters.clear();
    }
  }

  private handleItemCompleted(params: Record<string, unknown>): void {
    if (typeof params.turnId !== "string" || !isRecord(params.item) || params.item.type !== "agentMessage" || typeof params.item.text !== "string") {
      return;
    }

    const messages = this.agentMessagesByTurn.get(params.turnId) ?? [];
    messages.push(params.item.text);
    this.agentMessagesByTurn.set(params.turnId, messages);
  }

  private handleTurnCompleted(params: Record<string, unknown>): void {
    if (!isRecord(params.turn) || typeof params.turn.id !== "string") {
      return;
    }

    const turnId = params.turn.id;
    const agentMessages = this.agentMessagesByTurn.get(turnId) ?? extractAgentMessagesFromTurn(params.turn);
    const result = { finalResponse: agentMessages.join("\n\n").trim() };
    this.completedTurns.set(turnId, result);

    const waiter = this.turnWaiters.get(turnId);
    if (waiter) {
      this.turnWaiters.delete(turnId);
      waiter.resolve(result);
    }
  }

  private sendResult(id: unknown, result: unknown): void {
    this.childProcess.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  private sendError(id: unknown, code: number, message: string): void {
    this.childProcess.stdin.write(`${JSON.stringify({ id, error: { code, message } })}\n`);
  }

  private rejectAll(error: Error): void {
    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(error);
    }
    this.pendingRequests.clear();

    for (const waiter of this.turnWaiters.values()) {
      waiter.reject(error);
    }
    this.turnWaiters.clear();
  }

  private isJsonValue(value: unknown): value is JsonValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return true;
    }

    if (typeof value === "number") {
      return Number.isFinite(value);
    }

    if (Array.isArray(value)) {
      return value.every((item) => this.isJsonValue(item));
    }

    if (isRecord(value)) {
      return Object.values(value).every((item) => this.isJsonValue(item));
    }

    return false;
  }
}

export async function runCodexTurn(params: {
  model: string;
  threadId: string | null;
  input: CodexUserInput[];
  baseInstructions: string;
  dynamicTools: CodexDynamicToolSpec[];
  dynamicToolHandler: CodexDynamicToolHandler;
  reasoningEffort?: CodexReasoningEffort;
}): Promise<{
  finalResponse: string;
  threadId: string;
  model_used: string;
}> {
  const client = new CodexAppServerClient(params.dynamicToolHandler);
  const workingDirectory = await getCodexWorkingDirectory();

  try {
    await client.initialize();

    const threadResponse = params.threadId
      ? await client.resumeThread({
        threadId: params.threadId,
        model: params.model,
        cwd: workingDirectory,
        baseInstructions: params.baseInstructions,
      })
      : await client.startThread({
        model: params.model,
        cwd: workingDirectory,
        baseInstructions: params.baseInstructions,
        dynamicTools: params.dynamicTools,
      });

    const turn = await client.runTurn({
      threadId: threadResponse.thread.id,
      model: params.model,
      cwd: workingDirectory,
      reasoningEffort: params.reasoningEffort,
      input: params.input,
    });

    return {
      finalResponse: turn.finalResponse,
      threadId: threadResponse.thread.id,
      model_used: threadResponse.model,
    };
  } finally {
    client.close();
  }
}

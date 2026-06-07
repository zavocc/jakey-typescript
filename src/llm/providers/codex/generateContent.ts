import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { createModuleLogger } from "../../../lib/pinoLogger.js";
import { extractAgentMessagesFromTurn, getCodexWorkingDirectory, isJsonValue, isRecord, parseGeneratedImageItem, parseThreadResponse, parseTokenUsage, parseTurnStartResponse, resolveCodexLauncher } from "./functions.js";
import type {
  CodexCompactionHandler,
  CodexDynamicToolCallParams,
  CodexDynamicToolHandler,
  CodexDynamicToolSpec,
  CodexGeneratedImage,
  CodexReasoningEffort,
  CodexThreadResponse,
  CodexTokenUsage,
  CodexTurnResult,
  CodexUserInput,
  JsonRpcPending,
  RunCodexTurnResult,
  TurnWaiter,
} from "./types.js";

const childLogger = createModuleLogger(import.meta.url);

class CodexAppServerClient {
  private readonly childProcess: ChildProcessWithoutNullStreams;
  private readonly pendingRequests = new Map<string, JsonRpcPending>();
  private readonly turnWaiters = new Map<string, TurnWaiter>();
  private readonly completedTurns = new Map<string, CodexTurnResult>();
  private readonly agentMessagesByTurn = new Map<string, string[]>();
  private readonly tokenUsageByTurn = new Map<string, CodexTokenUsage>();
  private readonly compactedTurns = new Set<string>();
  private readonly generatedImagesByTurn = new Map<string, CodexGeneratedImage[]>();
  private nextRequestId = 1;

  public constructor(
    private readonly dynamicToolHandler: CodexDynamicToolHandler,
    private readonly compactionHandler: CodexCompactionHandler,
  ) {
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
  }): Promise<CodexTurnResult> {
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

    return new Promise<CodexTurnResult>((resolve, reject) => {
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
      arguments: isJsonValue(value.arguments) ? value.arguments : {},
    };
  }

  private handleNotification(message: Record<string, unknown>): void {
    if (message.method === "item/completed" && isRecord(message.params)) {
      void this.handleItemCompleted(message.params);
      return;
    }

    if (message.method === "thread/compacted" && isRecord(message.params)) {
      void this.handleCompaction(message.params);
      return;
    }

    if (message.method === "thread/tokenUsage/updated" && isRecord(message.params)) {
      this.handleTokenUsageUpdated(message.params);
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

  private async handleItemCompleted(params: Record<string, unknown>): Promise<void> {
    if (typeof params.turnId === "string" && isRecord(params.item) && params.item.type === "contextCompaction") {
      void this.handleCompaction(params);
    }

    if (typeof params.turnId === "string") {
      const generatedImage = await parseGeneratedImageItem(params.item);
      if (generatedImage) {
        const generatedImages = this.generatedImagesByTurn.get(params.turnId) ?? [];
        generatedImages.push(generatedImage);
        this.generatedImagesByTurn.set(params.turnId, generatedImages);
      }
    }

    if (typeof params.turnId !== "string" || !isRecord(params.item) || params.item.type !== "agentMessage" || typeof params.item.text !== "string") {
      return;
    }

    const messages = this.agentMessagesByTurn.get(params.turnId) ?? [];
    messages.push(params.item.text);
    this.agentMessagesByTurn.set(params.turnId, messages);
  }

  private async handleCompaction(params: Record<string, unknown>): Promise<void> {
    const turnId = typeof params.turnId === "string" ? params.turnId : null;
    if (turnId && this.compactedTurns.has(turnId)) {
      return;
    }

    if (turnId) {
      this.compactedTurns.add(turnId);
    }

    try {
      await this.compactionHandler();
    } catch (error) {
      childLogger.warn({ cause: error }, "Failed to send Codex compaction interstitial.");
    }
  }

  private handleTokenUsageUpdated(params: Record<string, unknown>): void {
    if (typeof params.turnId !== "string") {
      return;
    }

    const tokenUsage = parseTokenUsage(params);
    if (tokenUsage) {
      this.tokenUsageByTurn.set(params.turnId, tokenUsage);
    }
  }

  private handleTurnCompleted(params: Record<string, unknown>): void {
    if (!isRecord(params.turn) || typeof params.turn.id !== "string") {
      return;
    }

    const turnId = params.turn.id;
    const agentMessages = this.agentMessagesByTurn.get(turnId) ?? extractAgentMessagesFromTurn(params.turn);
    const result = {
      finalResponse: agentMessages.join("\n\n").trim(),
      tokenUsage: this.tokenUsageByTurn.get(turnId) ?? null,
      generatedImages: this.generatedImagesByTurn.get(turnId) ?? [],
    };
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
}

export async function runCodexTurn(params: {
  model: string;
  threadId: string | null;
  input: CodexUserInput[];
  baseInstructions: string;
  dynamicTools: CodexDynamicToolSpec[];
  dynamicToolHandler: CodexDynamicToolHandler;
  onCompaction: CodexCompactionHandler;
  reasoningEffort?: CodexReasoningEffort;
}): Promise<RunCodexTurnResult> {
  const client = new CodexAppServerClient(params.dynamicToolHandler, params.onCompaction);
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
      tokenUsage: turn.tokenUsage,
      generatedImages: turn.generatedImages,
    };
  } finally {
    client.close();
  }
}

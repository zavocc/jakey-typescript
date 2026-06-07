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

export type CodexTokenUsage = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  modelContextWindow: number | null;
};

export type CodexGeneratedImage = {
  buffer: Buffer;
  mimeType: string;
  revisedPrompt: string | null;
};

export type CodexDynamicToolHandler = (params: CodexDynamicToolCallParams) => Promise<CodexDynamicToolCallResponse>;

export type CodexCompactionHandler = () => Promise<void>;

export type CodexThreadContext = {
  threadId: string;
};

export type JsonRpcPending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export type CodexTurnResult = {
  finalResponse: string;
  tokenUsage: CodexTokenUsage | null;
  generatedImages: CodexGeneratedImage[];
};

export type TurnWaiter = {
  resolve: (value: CodexTurnResult) => void;
  reject: (error: Error) => void;
};

export type CodexThreadResponse = {
  thread: {
    id: string;
  };
  model: string;
};

export type CodexTurnStartResponse = {
  turn: {
    id: string;
  };
};

export type RunCodexTurnResult = {
  finalResponse: string;
  threadId: string;
  model_used: string;
  tokenUsage: CodexTokenUsage | null;
  generatedImages: CodexGeneratedImage[];
};

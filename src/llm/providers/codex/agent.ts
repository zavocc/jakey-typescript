import { createModuleLogger } from "../../../lib/pinoLogger.js";
import { sendChunkedMessage } from "../../chat/message.js";
import { loadContext, saveContext } from "../../chat/contextMemory.js";
import { constructUserPrompt } from "./promptTools.js";
import { JAKEY_SYSTEM_PROMPT } from "../../../constants.js";
import { runCodexTurn, type CodexDynamicToolCallParams, type CodexDynamicToolSpec, type CodexReasoningEffort, type JsonValue } from "./generateContent.js";
import { loadPreferences } from "../../../lib/preferencesDBLoader.js";
import { isSupportableCitations, linkBtnAggregator, queryBtnAggregator, sendBtns } from "../../chat/btnCitationSend.js";
import { assertAgentProviderExclusive } from "../../tools/agentProviderExclusive.js";
import { fetchToolPack } from "../../tools/utils.js";
import type { SupportableCitation } from "../../chat/btnCitationSend.js";
import type { FileMetadata } from "../../types.js";
import type { Message, SendableChannels } from "discord.js";
import type { ModelProps } from "../../../types/schemas.js";

const childLogger = createModuleLogger(import.meta.url);

type CodexThreadContext = {
  threadId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStoredThreadId(context: unknown): string | null {
  if (!Array.isArray(context)) {
    return null;
  }

  const firstItem = context.at(0);
  if (!isRecord(firstItem) || typeof firstItem.threadId !== "string") {
    return null;
  }

  return firstItem.threadId;
}

function isJsonValue(value: unknown): value is JsonValue {
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

function toCodexDynamicTools(schemas: unknown[]): CodexDynamicToolSpec[] {
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

function jsonRecordOrEmpty(value: JsonValue): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringifyToolResult(toolResult: unknown): string {
  if (typeof toolResult === "string") {
    return toolResult;
  }

  if (typeof toolResult === "bigint") {
    return `${toolResult}`;
  }

  return JSON.stringify(toolResult);
}

function parseReasoningEffort(additionalProperties: Record<string, unknown> | undefined): CodexReasoningEffort | undefined {
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

export async function llmExecute(
  prompt: string,
  model_props: ModelProps,
  discord_user_id: string,
  discord_interaction: Message,
  attachment_urls?: Array<FileMetadata>,
): Promise<void> {
  const messageChannel: SendableChannels | null = discord_interaction.channel?.isSendable() ? discord_interaction.channel : null;
  if (!messageChannel) {
    throw new Error("Message channel is not available.");
  }

  const application = await discord_interaction.client.application.fetch();
  const applicationOwner = application.owner;
  const botOwnerId = applicationOwner && "ownerId" in applicationOwner
    ? applicationOwner.ownerId
    : applicationOwner?.id;

  if (!botOwnerId) {
    throw new Error("Codex owner access is not configured.");
  }

  if (discord_interaction.author.id !== botOwnerId) {
    throw new Error("Only the bot owner can use Codex models.");
  }

  if (attachment_urls && attachment_urls.length > 0 && !model_props.enable_files) {
    throw new Error("Sorry, the current model does not support file attachments.");
  }

  const contextThreadName = model_props.thread_name ?? model_props.provider;
  const storedContext: unknown = await loadContext(discord_user_id, contextThreadName);
  const storedThreadId = readStoredThreadId(storedContext);
  const constructedPrompt = await constructUserPrompt(prompt, attachment_urls);

  const toolSelection = await loadPreferences(discord_user_id, "user_choice_tool");
  const loadedToolPack = await fetchToolPack(toolSelection ?? "Disabled");

  assertAgentProviderExclusive(toolSelection, loadedToolPack.agentProviderExclusive, model_props.provider);

  if (loadedToolPack.hasServerTools && model_props.enable_tools) {
    throw new Error("The selected tool is not available for Codex because it is provider-managed instead of a local function tool.");
  }

  const citations: Array<SupportableCitation> = [];
  const queries: Array<string> = [];
  const dynamicTools = model_props.enable_tools ? toCodexDynamicTools(loadedToolPack.schemas) : [];

  const response = await runCodexTurn({
    model: model_props.model_id,
    threadId: storedThreadId,
    input: constructedPrompt,
    baseInstructions: JAKEY_SYSTEM_PROMPT,
    dynamicTools,
    reasoningEffort: parseReasoningEffort(model_props.additional_properties),
    dynamicToolHandler: async (params: CodexDynamicToolCallParams) => {
      const toolFunction = loadedToolPack.functions[params.tool as keyof typeof loadedToolPack.functions];

      if (!Object.hasOwn(loadedToolPack.functions, params.tool) || typeof toolFunction !== "function") {
        return {
          contentItems: [{ type: "inputText", text: `Tool ${params.tool} is not available.` }],
          success: false,
        };
      }

      childLogger.info({ tool_invoked: params.tool, tool_id: params.callId, user_snowflake: discord_interaction.author.id }, "User Codex called tool");
      childLogger.debug({ tool_name: params.tool, tool_arguments: params.arguments, tool_id: params.callId, user_snowflake: discord_interaction.author.id }, "Codex tool arguments");

      try {
        const toolResult = await toolFunction(discord_interaction, jsonRecordOrEmpty(params.arguments));

        if (typeof toolResult === "object" && toolResult !== null && Object.hasOwn(toolResult, "supportable_sources")) {
          const sources = (toolResult as Record<string, unknown>).supportable_sources;

          if (isSupportableCitations(sources)) {
            citations.push(...sources);
            childLogger.debug({ supportable_sources: sources, tool_name: params.tool }, "Found valid supportable_sources for sources to be cited");
          } else {
            childLogger.debug({ supportable_sources: sources, tool_name: params.tool }, "Found supportable_sources but the format is not valid... ignoring.");
          }

          delete (toolResult as Record<string, unknown>).supportable_sources;
        }

        const content = toolResult === undefined || toolResult === null
          ? `The tool ${params.tool} did not return a result`
          : stringifyToolResult(toolResult);

        return {
          contentItems: [{ type: "inputText", text: content }],
          success: true,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        childLogger.error({ tool_name: params.tool, tool_error: errorMessage, user_snowflake: discord_interaction.author.id }, "Error calling Codex dynamic tool");

        return {
          contentItems: [{ type: "inputText", text: `Failed to execute tool ${params.tool}: ${errorMessage}` }],
          success: false,
        };
      }
    },
  });

  const contextToSave: Array<CodexThreadContext> = [{ threadId: response.threadId }];
  await saveContext(discord_user_id, contextToSave, contextThreadName);

  if (response.finalResponse) {
    await sendChunkedMessage(messageChannel, response.finalResponse);
  } else {
    await sendChunkedMessage(messageChannel, "I have not received a response from the model.");
  }

  await sendBtns(messageChannel, queryBtnAggregator(queries), linkBtnAggregator(citations));
  await messageChannel.send(`-# [DEBUG] Model used: ${response.model_used}`);
}

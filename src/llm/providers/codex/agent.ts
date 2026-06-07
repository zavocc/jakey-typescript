import { createModuleLogger } from "../../../lib/pinoLogger.js";
import { sendChunkedMessage } from "../../chat/message.js";
import { loadContext, saveContext } from "../../chat/contextMemory.js";
import { constructUserPrompt } from "./promptTools.js";
import { JAKEY_SYSTEM_PROMPT } from "../../../constants.js";
import { runCodexTurn } from "./generateContent.js";
import { formatContextUsage, imageFileName, jsonRecordOrEmpty, parseReasoningEffort, readStoredThreadId, stringifyToolResult, toCodexDynamicTools } from "./functions.js";
import { loadPreferences } from "../../../lib/preferencesDBLoader.js";
import { isSupportableCitations, linkBtnAggregator, queryBtnAggregator, sendBtns } from "../../chat/btnCitationSend.js";
import { assertAgentProviderExclusive } from "../../tools/agentProviderExclusive.js";
import { fetchToolPack } from "../../tools/utils.js";
import type { SupportableCitation } from "../../chat/btnCitationSend.js";
import type { FileMetadata } from "../../types.js";
import type { Message, SendableChannels } from "discord.js";
import type { ModelProps } from "../../../types/schemas.js";
import type { CodexDynamicToolCallParams, CodexThreadContext } from "./types.js";

const childLogger = createModuleLogger(import.meta.url);

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
  const toolCallHardLimit = parseInt(process.env.TOOL_CALL_TURNS_HARD_LIMIT ?? "10");
  let toolCallTurnCount = 0;

  const response = await runCodexTurn({
    model: model_props.model_id,
    threadId: storedThreadId,
    input: constructedPrompt,
    baseInstructions: JAKEY_SYSTEM_PROMPT,
    dynamicTools,
    reasoningEffort: parseReasoningEffort(model_props.additional_properties),
    onCompaction: async () => {
      await sendChunkedMessage(messageChannel, "⏳ Compacting our conversation so we can chat more...");
    },
    dynamicToolHandler: async (params: CodexDynamicToolCallParams) => {
      const toolFunction = loadedToolPack.functions[params.tool as keyof typeof loadedToolPack.functions];

      if (!Object.hasOwn(loadedToolPack.functions, params.tool) || typeof toolFunction !== "function") {
        childLogger.error({ tool_name: params.tool, tool_id: params.callId, user_snowflake: discord_interaction.author.id }, "Attempted to call tool but is not available");
        return {
          contentItems: [{ type: "inputText", text: `Tool ${params.tool} is not available.` }],
          success: false,
        };
      }

      childLogger.info({ tool_invoked: params.tool, tool_id: params.callId, user_snowflake: discord_interaction.author.id }, "User LLM called tool");
      childLogger.debug({ tool_name: params.tool, tool_arguments: params.arguments, tool_id: params.callId, user_snowflake: discord_interaction.author.id }, "Arg tool");

      try {
        if (toolCallTurnCount >= toolCallHardLimit) {
          childLogger.error({ tool_name: params.tool, tool_id: params.callId, user_snowflake: discord_interaction.author.id }, "Max tool calls limit reached");
          return {
            contentItems: [{ type: "inputText", text: JSON.stringify({ error: "Reached tool call hard limit. Please try again later." }) }],
            success: false,
          };
        }

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

        childLogger.debug({ tool_result: toolResult, tool_name: params.tool, tool_id: params.callId, user_snowflake: discord_interaction.author.id }, "Tool result");

        return {
          contentItems: [{ type: "inputText", text: content }],
          success: true,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        childLogger.error({ tool_name: params.tool, tool_error: errorMessage, user_snowflake: discord_interaction.author.id }, "Error calling tool");

        return {
          contentItems: [{ type: "inputText", text: `Failed to execute tool ${params.tool}: ${errorMessage}` }],
          success: false,
        };
      } finally {
        toolCallTurnCount += 1;
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

  for (const [index, generatedImage] of response.generatedImages.entries()) {
    await messageChannel.send({
      content: generatedImage.revisedPrompt ? `Generated image: ${generatedImage.revisedPrompt}` : "Generated image",
      files: [{
        attachment: generatedImage.buffer,
        name: imageFileName(generatedImage.mimeType, index + 1),
      }],
    });
  }

  await sendBtns(messageChannel, queryBtnAggregator(queries), linkBtnAggregator(citations));
  await messageChannel.send(`-# [DEBUG] Model used: ${response.model_used} | ${formatContextUsage(response.tokenUsage)}`);
}

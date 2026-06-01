import logger from "../../../lib/pinoLogger.js";
import { sendChunkedMessage } from "../../chat/message.js";
import { loadContext, saveContext } from "../../chat/contextMemory.js";
import { constructUserPrompt } from "./promptTools.js";
import { JAKEY_SYSTEM_PROMPT } from "../../../data/sysprompts.js";
import { text_chat_completion } from "./generateContent.js";
import { loadPreferences } from "../../../lib/preferencesDBLoader.js";
import { isSupportableCitations, linkBtnAggregator, queryBtnAggregator, sendBtns } from "../../chat/btnCitationSend.js";
import type { SupportableCitation } from "../../chat/btnCitationSend.js";
import type { FileMetadata } from "../../types.js";
import type { Message, SendableChannels } from 'discord.js';
import type { ModelProps } from "../../../types/schemas.js";
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources';

// Tool loader
import { fetchToolPack } from "../../tools/utils.js";

const childLogger = logger.child({ module: "llm.providers.openrouter.agent" });

export async function llmExecute(
  prompt: string,
  model_props: ModelProps,
  discord_user_id: string,
  discord_interaction: Message,
  attachment_urls?: Array<FileMetadata>,
): Promise<void> {
  // Narrow to a channel type that is allowed to send messages
  const messageChannel: SendableChannels | null = discord_interaction.channel?.isSendable() ? discord_interaction.channel : null;
  if (!messageChannel) {
    throw new Error("Message channel is not available.");
  }

  // Load context and it's associated thread if existed
  const chatContext: Array<ChatCompletionMessageParam> = await loadContext(discord_user_id, model_props.thread_name);

  // If the context is empty, append system prompt to the context
  if (chatContext.length === 0) {
    chatContext.push({ content: JAKEY_SYSTEM_PROMPT, role: 'system' });
  }

  // Check if we have attachments but the model doesn't support it
  if (attachment_urls && attachment_urls.length > 0 && !model_props.enable_files) {
    throw new Error("Sorry, the current model does not support file attachments.");
  }

  // process prompt
  const constructedPrompt = await constructUserPrompt(prompt, attachment_urls);
  chatContext.push(...constructedPrompt);

  let additionalParams: Omit<ChatCompletionCreateParamsNonStreaming, 'messages' | 'model'> = {};

  // Spread additional properties from model config
  if (model_props.additional_properties) {
    additionalParams = { ...model_props.additional_properties };
  }

  // Load tool schemas and functions
  // If user_choice_tool is null, we will load "Disabled" tool which only has built-in tools
  const toolSelection = await loadPreferences(discord_user_id, "user_choice_tool");
  const loadedToolPack = await fetchToolPack(toolSelection ?? "Disabled", "openai"); // This returns both schema list and functions list in a pack

  // check for agentProviderExclusive
  if (loadedToolPack.agentProviderExclusive && loadedToolPack.agentProviderExclusive !== model_props.provider) {
    throw new Error(`The tool ${toolSelection} is exclusive to ${loadedToolPack.agentProviderExclusive} provider.`);
  }

  // Tools
  if (model_props.enable_tools) {
    additionalParams = {
      ...additionalParams,
      tools: loadedToolPack.schemas as Array<ChatCompletionTool>,
    };
  }

  // Generate content
  let response = await text_chat_completion(
    model_props.model_id,
    chatContext,
    additionalParams
  );

  // Get first candidate of response
  if (!response.modelResponse.choices || response.modelResponse.choices.length === 0) {
    throw new Error('No candidates received from the model.');
  }
  let firstCandidate = response.modelResponse.choices.at(0);

  // Check if parts is undefined or empty
  if (!firstCandidate || !firstCandidate.message) {
    throw new Error('No response received from the model.');
  }

  // Queries and citations
  const citations: Array<SupportableCitation> = [];
  const queries: Array<string> = [];

  // Handle responses and agentic loop inside of this toolHasDone loop, and we display each response modalities one by one
  // const toolCallHardLimit = parseInt(process.env.TOOL_CALL_TURNS_HARD_LIMIT ?? '10');
  // let toolCallTurnCount = 0;
  let toolHasDone = false;
  while (!toolHasDone) {
    let hasToolCalls = false;
    const toolResponseResultsParts: Array<ChatCompletionMessageParam> = [];

    if (firstCandidate.message.tool_calls) {
      hasToolCalls = true;
      // For each tool call, execute and append the result to the context
      for (const toolCall of firstCandidate.message.tool_calls) {
        // Only function-type tool calls are supported
        if (toolCall.type !== 'function') {
          throw Error(`Unsupported tool call type: ${toolCall.type}`);
        }

        let parsedToolResult;
        const toolName = toolCall.function.name;
        const toolFunction = loadedToolPack.functions[toolName as keyof typeof loadedToolPack.functions];

        // Log tools used
        childLogger.info({ tool_invoked: toolCall.function.name, tool_id: toolCall.id, user_snowflake: discord_interaction.author.id }, "User LLM called tool")
        childLogger.debug({ tool_name: toolCall.function.name, tool_arguments: toolCall.function.arguments, tool_id: toolCall.id, user_snowflake: discord_interaction.author.id }, "Arg tool")

        try {
          const toolResult = await toolFunction(discord_interaction, JSON.parse(toolCall.function.arguments) ?? {});

          // Check if toolResult includes supportable sources that can be added to the citations list.
          if (typeof toolResult === "object" && toolResult !== null && Object.hasOwn(toolResult, "supportable_sources")) {
            const sources = (toolResult as Record<string, unknown>).supportable_sources;

            if (isSupportableCitations(sources)) {
              citations.push(...sources);
              childLogger.debug({ tool_name: toolCall.function.name, supportable_sources: sources }, "Found valid supportable_sources for sources to be cited");
            } else {
              childLogger.debug({ tool_name: toolCall.function.name, supportable_sources: sources }, "Found supportable_sources but the format is not valid... ignoring.");
            }

            // Then we remove supportable_sources key from toolResult so it doesn't get returned to the model
            delete (toolResult as Record<string, unknown>).supportable_sources;
          }

          // Assign the tool result to parsedToolResult
          if (toolResult === undefined || toolResult === null) {
            // If the function returns void or undefined, we tell the model it doesn't return anything
            childLogger.info({ tool_name: toolCall.function.name, tool_id: toolCall.id }, "The tool did not return a result")
            parsedToolResult = { output: `The tool ${toolCall.function.name} did not return a result` };
          } else if (typeof toolResult === "bigint") {
            // Check if it directly returns bigInt, NOTE: any nested objects that has bigInt may fail and this check may not cover it
            childLogger.info({ tool_name: toolCall.function.name, tool_id: toolCall.id }, "Possible direct bigint returned, safely converting to string...")
            parsedToolResult = { output: `${toolResult}` };
          } else {
            parsedToolResult = toolResult;
          }

          logger.debug({ tool_result: toolResult, tool_name: toolCall.function.name, tool_id: toolCall.id, user_snowflake: discord_interaction.author.id }, "Tool result")
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          childLogger.error({
            tool_name: toolCall.function.name,
            tool_error: errorMessage,
            user_snowflake: discord_interaction.author.id,
          }, "Error calling tool");
          parsedToolResult = { error: `Failed to execute tool ${toolCall.function.name}`, reason: errorMessage };
        } finally {
          toolResponseResultsParts.push(
            {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(parsedToolResult)
            }
          )
        }
      }
    }

    if (hasToolCalls) {
      // Append the model response
      chatContext.push(firstCandidate.message);

      // Push all collected tool results to context once
      chatContext.push(...toolResponseResultsParts)

      // Send all tool results for this interaction together. Each call_id belongs
      // to the interaction that produced the current response.modelSteps.
      response = await text_chat_completion(
        model_props.model_id,
        chatContext,
        additionalParams
      );

      // Get first candidate of response
      if (!response.modelResponse.choices || response.modelResponse.choices.length === 0) {
        throw new Error('No candidates received from the model.');
      }
      firstCandidate = response.modelResponse.choices.at(0);

      // Check if parts is undefined or empty
      if (!firstCandidate || !firstCandidate.message) {
        throw new Error('No response received from the model.');
      }

      // Continue to next loop with new response
      continue;
    }

    // Assuming there are no proceeding tool calls requested, we can stop the loop
    toolHasDone = true;
  }

  // Push the final mo  del response to context so it's saved alongside the user prompt.
  chatContext.push(firstCandidate.message);

  // Save context back to db
  await saveContext(discord_user_id, chatContext, model_props.thread_name);


  // Reply to user
  if (firstCandidate.message.content) {
    await sendChunkedMessage(messageChannel, firstCandidate.message.content);
  } else {
    await sendChunkedMessage(messageChannel, 'I have not received a response from the model.');
  }

  // Send citations and queries as buttons
  await sendBtns(messageChannel, queryBtnAggregator(queries), linkBtnAggregator(citations));

  // Send model info
  await messageChannel.send(`-# [DEBUG] Model used: ${response.model_used}`);
}

import logger from "../../lib/pinoLogger.js";
import { getModelProps } from "./modelsSelection.js";
import { JAKEY_SYSTEM_PROMPT } from "../../data/sysprompts.js";
import { text_chat_completion } from "../generateContentChat.js";
import { loadPreferences, savePreferences } from "../../lib/preferencesDBLoader.js";
import { fileTypeFromBuffer } from 'file-type';
import type { ModelProps } from "../../types/schemas.js";
import type { Message, SendableChannels } from 'discord.js';
import type { Interactions } from "@google/genai";


// Tool loader
import { fetchToolPack } from "../tools/utils.js";

const childLogger = logger.child({ module: "llm.chat.chatAgenticReceiver" });

async function sendChunkedMessage(
  messageChannel: SendableChannels,
  text: string,
  chunkSize = 2000,
): Promise<void> {
  if (!text.length) return;

  for (let i = 0; i < text.length; i += chunkSize) {
    await messageChannel.send(text.slice(i, i + chunkSize));
  }
}

export async function chatToLLM(
  prompt: string,
  discord_user_id: string,
  discord_interaction: Message,
  attachment_urls?: Array<{
    fileName: string;
    mimeType: string;
    fileURI: string;
  }>,
): Promise<void> {
  // Narrow to a channel type that is allowed to send messages
  const messageChannel: SendableChannels | null = discord_interaction.channel?.isSendable() ? discord_interaction.channel : null;
  if (!messageChannel) {
    throw new Error("Message channel is not available.");
  }

  // Load model properties
  const modelProps: ModelProps = await getModelProps(discord_user_id);

  // Load context and it's associated thread if existed
  const context = await loadPreferences(discord_user_id, "current_interaction_id");

  // Check if we have attachments but the model doesn't support it
  if (attachment_urls && attachment_urls.length > 0 && !modelProps.enable_files) {
    throw new Error("Sorry, the current model does not support file attachments.");
  }

  let additionalParams: Record<string, unknown> = {};

  // Spread additional properties from model config
  if (modelProps.additional_properties) {
    additionalParams = { ...modelProps.additional_properties };
  }

  // Load tool schemas and functions
  // If user_choice_tool is null, we will load "Disabled" tool which only has built-in tools
  const toolSelection = await loadPreferences(discord_user_id, "user_choice_tool");
  const loadedToolPack = await fetchToolPack(toolSelection ?? "Disabled");

  // Tools
  if (modelProps.enable_tools) {
    additionalParams = {
      ...additionalParams,
      tools: loadedToolPack.schemas,
    };
  }

  // Generate content
  let interactionIDStored: string | undefined;
  let toolHasDone = false;
  let response = await text_chat_completion(
    modelProps.model_id,
    prompt,
    {
      interactions_context_id: context ?? undefined,
      system_prompt: JAKEY_SYSTEM_PROMPT,
      attachment_urls,
      additional_properties: additionalParams,
    }
  );

  // Save interaction ID throughout the loop
  interactionIDStored = response.interactionID;

  // Handle responses and agentic loop inside of this toolHasDone loop, and we display each response modalities one by one
  const toolCallHardLimit = parseInt(process.env.TOOL_CALL_TURNS_HARD_LIMIT ?? '10');
  let toolCallTurnCount = 0;
  while (!toolHasDone) {
    // Collect tool results including those that ran in parallel before sending
    let hasToolCalls = false;
    const toolResults: Interactions.FunctionResultStep[] = [];

    // Process ALL steps from the response first
    for (const steps of response.modelSteps) {
      // search results
      if (steps.type === 'google_search_result' && steps.result) {
        // Iterate and join queries with comma
        await messageChannel.send(`-# > Used: Google Search`);
      }

      // URL context
      if (steps.type === 'url_context_result' && steps.result) {
        await messageChannel.send(`-# > Used: Read ${steps.result.length} URLs`);
      }

      // Code Execution
      if (steps.type === 'code_execution_result' && steps.result) {
        await sendChunkedMessage(messageChannel, steps.result);
      }

      // MCP Server remote
      if (steps.type === 'mcp_server_tool_call') {
        await messageChannel.send(`-# > Used: ${steps.name} (REMOTE)`);
      }

      // model outputs
      if (steps.type === 'model_output' && steps.content) {
        for (const content of steps.content) {
          // text
          if (content.type === 'text' && content.text && content.text.trim() !== '') {
            await sendChunkedMessage(messageChannel, content.text);

          // image
          } else if (content.type === 'image' && content.data) {
            const bufferParsed = Buffer.from(content.data, 'base64');
            const mimeType = await fileTypeFromBuffer(bufferParsed);

            await messageChannel.send({
              files:
                [
                  {
                    attachment: bufferParsed,
                    name: `image.${mimeType?.ext}`
                  }
                ]
            });
          }
        }
      }

      // tool calls
      if (steps.type === 'function_call') {
        hasToolCalls = true;
        let toolResult;
        const toolFunctions = loadedToolPack.functions[steps.name as keyof typeof loadedToolPack.functions];

        // Log tools used
        childLogger.info({ tool_invoked: steps.name, tool_id: steps.id, user_snowflake: discord_interaction.author.id }, "User LLM called tool")
        childLogger.debug({ tool_name: steps.name, tool_arguments: steps.arguments, tool_id: steps.id, user_snowflake: discord_interaction.author.id }, "Arg tool")

        try {
          // Call tools if it doesn't reach the max limit, if it does, we output the error instead
          if (toolCallTurnCount >= toolCallHardLimit) {
            toolResult = { error: "Reached tool call hard limit. Please try again later." };
            logger.error({ 'tool_name': steps.name, 'tool_id': steps.id, 'user_snowflake': discord_interaction.author.id }, "Max tool calls limit reached")
          } else {
            toolResult = await toolFunctions(discord_interaction, steps.arguments ?? {});

            // If the function returns void or undefined, we tell the model it doesn't return anything
            if (toolResult === undefined || toolResult === null) {
              childLogger.info({ tool_name: steps.name, tool_id: steps.id }, "The tool did not return a result")
              toolResult = `The tool ${steps.name} did not return a result`;
            }

            // Check if it directly returns bigInt, NOTE: any nested objects that has bigInt may fail and this check may not cover it
            if (typeof toolResult === "bigint") {
              childLogger.info({ tool_name: steps.name, tool_id: steps.id }, "Possible direct bigint returned, safely converting to string...")
              toolResult = `${toolResult}`;
            }

            logger.debug({ tool_result: toolResult, tool_name: steps.name, tool_id: steps.id, user_snowflake: discord_interaction.author.id }, "Tool result")
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          childLogger.error({
            tool_name: steps.name,
            tool_error: errorMessage,
            user_snowflake: discord_interaction.author.id,
          }, "Error calling tool");
          toolResult = {
            error: `Failed to execute tool ${steps.name}`,
            reason: errorMessage,
          };
        } finally {
          // Increment tool call turn counter
          toolCallTurnCount += 1;
        }

        toolResults.push({
          type: 'function_result',
          name: steps.name,
          call_id: steps.id,
          result: JSON.stringify({ api_result: toolResult })
        });
      }
    }

    // Check if it executed any tool calls so we can submit the tool response by running text_chat_completion the second time
    // This will continue to next loop so it can output modalities but will also check again if there's a tool call issued so toolHasDone can be set to stop the loop
    if (hasToolCalls) {
      // Send all tool results for this interaction together. Each call_id belongs
      // to the interaction that produced the current response.modelSteps.
      response = await text_chat_completion(
        modelProps.model_id,
        toolResults,
        {
          interactions_context_id: interactionIDStored,
          system_prompt: JAKEY_SYSTEM_PROMPT,
          attachment_urls: undefined,
          additional_properties: additionalParams,
        }
      );

      // Update stored ID only after all tool results from the previous
      // interaction have been submitted.
      interactionIDStored = response.interactionID;
      continue;
    }

    // Assuming there are no proceeding tool calls requested, we can stop the loop
    toolHasDone = true;
  }

  if (!interactionIDStored) {
    throw new Error("No interaction ID stored.");
  }

  // Save context back to db
  await savePreferences(discord_user_id, "current_interaction_id", interactionIDStored);

  // Send model info
  await messageChannel.send(`-# [DEBUG] Model used: ${response.model_used}`);
}

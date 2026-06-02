import { createModuleLogger } from "../../../lib/pinoLogger.js";
import { sendChunkedMessage } from "../../chat/message.js";
import { loadContext, saveContext } from "../../chat/contextMemory.js";
import { constructUserPrompt } from "./promptTools.js";
import { JAKEY_SYSTEM_PROMPT } from "../../../constants.js";
import { text_chat_completion } from "./generateContent.js";
import { loadPreferences } from "../../../lib/preferencesDBLoader.js";
import { isSupportableCitations, linkBtnAggregator, queryBtnAggregator, sendBtns } from "../../chat/btnCitationSend.js";
import { assertAgentProviderExclusive } from "../../tools/agentProviderExclusive.js";
import type { SupportableCitation } from "../../chat/btnCitationSend.js";
import type { FileMetadata } from "../../types.js";
import type { Message, SendableChannels } from 'discord.js';
import type { ModelProps } from "../../../types/schemas.js";
import type { GenerateContentConfig, FunctionDeclaration, Part } from "@google/genai";

// Tool loader
import { fetchToolPack } from "../../tools/utils.js";
import { ToolUnion } from "@google/genai/web";

const childLogger = createModuleLogger(import.meta.url);

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
  const chatContext: Array<{parts: Array<Part>, role: string}> = await loadContext(discord_user_id, model_props.thread_name ?? model_props.provider);

  // Check if we have attachments but the model doesn't support it
  if (attachment_urls && attachment_urls.length > 0 && !model_props.enable_files) {
    throw new Error("Sorry, the current model does not support file attachments.");
  }

  // process prompt
  const constructedPrompt = await constructUserPrompt(prompt, attachment_urls);
  chatContext.push(constructedPrompt);

  let additionalParams: GenerateContentConfig = {};

  // Spread additional properties from model config
  if (model_props.additional_properties) {
    additionalParams = { ...model_props.additional_properties };
  }

  // Load tool schemas and functions
  // If user_choice_tool is null, we will load "Disabled" tool which only has built-in tools
  const toolSelection = await loadPreferences(discord_user_id, "user_choice_tool");
  const loadedToolPack = await fetchToolPack(toolSelection ?? "Disabled"); // This returns both schema list and functions list in a pack

  assertAgentProviderExclusive(toolSelection, loadedToolPack.agentProviderExclusive, model_props.provider);

  // Tools
  if (model_props.enable_tools) {
    // check if loadedToolPack has builtIns
    if (!loadedToolPack.hasServerTools) {
      additionalParams = {
        ...additionalParams,
        tools: [{ functionDeclarations: loadedToolPack.schemas as FunctionDeclaration[] }],
      };
    } else {
      additionalParams = {
        ...additionalParams,
        tools: loadedToolPack.schemas as ToolUnion[],
      };
    }
  }

  // Generate content
  let response = await text_chat_completion(
    model_props.model_id,
    chatContext,
    {
      system_prompt: JAKEY_SYSTEM_PROMPT,
      additional_properties: additionalParams
    }
  );

  // Get first candidate of response
  if (!response.modelResponse.candidates || response.modelResponse.candidates.length === 0) {
    throw new Error('No candidates received from the model.');
  }
  let firstCandidate = response.modelResponse.candidates.at(0);

  // Check if parts is undefined or empty
  if (!firstCandidate || !firstCandidate.content || !firstCandidate.content.parts || firstCandidate.content.parts.length === 0) {
    throw new Error('No response received from the model.');
  }

  // Queries and citations
  const citations: Array<SupportableCitation> = [];
  const queries: Array<string> = [];

  // Handle responses and agentic loop inside of this toolHasDone loop, and we display each response modalities one by one
  const toolCallHardLimit = parseInt(process.env.TOOL_CALL_TURNS_HARD_LIMIT ?? '10');
  let toolCallTurnCount = 0;
  let toolHasDone = false;
  while (!toolHasDone) {
    // Collect tool results including those that ran in parallel before sending
    let hasToolCalls = false;
    const toolResponseResultsParts = [];

    // Process ALL parts from the response first before we check if we have tool calls and results in line 231
    for (const parts of firstCandidate.content.parts) {
      // search results
      if (firstCandidate.groundingMetadata && firstCandidate.groundingMetadata.webSearchQueries) {
        for (const query of firstCandidate.groundingMetadata.webSearchQueries) {
          queries.push(query);
        }
      }

      // URL context
      if (firstCandidate.urlContextMetadata && firstCandidate.urlContextMetadata.urlMetadata) {
        for (const metadata of firstCandidate.urlContextMetadata.urlMetadata) {
          if (metadata.retrievedUrl) {
            citations.push({
              title: new URL(metadata.retrievedUrl).hostname,
              url: metadata.retrievedUrl
            });
          }
        }
      }

      // Web citations
      if (firstCandidate.groundingMetadata?.groundingChunks) {
        for (const chunk of firstCandidate.groundingMetadata.groundingChunks) {
          if (chunk.web && chunk.web.title && chunk.web.uri) {
            citations.push({
              title: chunk.web.title,
              url: chunk.web.uri
            });
          } else if (chunk.maps && chunk.maps.title && chunk.maps.uri) {
            citations.push({
              title: chunk.maps.title,
              url: chunk.maps.uri
            });
          } else if (chunk.retrievedContext) {
            if (chunk.retrievedContext.title && chunk.retrievedContext.uri) {
              citations.push({
                title: chunk.retrievedContext.title,
                url: chunk.retrievedContext.uri
              });
            }
          }
        }
      }

      // text
      if (parts.text && parts.text.trim() !== '') {
        await sendChunkedMessage(messageChannel, parts.text);
      }

      // function user defined tool calls
      if (parts.functionCall && parts.functionCall.name) {
        hasToolCalls = true;
        let toolResult;
        let schemaHasFound = false;

        // Check if the tool.name is in the schemas so hallucinated or unauthorized functions cannot be called
        for (const schema of loadedToolPack.schemas) {
          if (typeof schema === "object" && schema !== null && "name" in schema && schema.name === parts.functionCall.name) {
            schemaHasFound = true;
            break;
          }
        }

        // becomes const toolFunction = loadedToolPack.functions[parts.functionCall.name] as valid with keyof typeof which is string;
        const toolFunction = loadedToolPack.functions[parts.functionCall.name as keyof typeof loadedToolPack.functions];

        // Check if steps.name is in loadedToolPack.functions
        if (schemaHasFound && Object.hasOwn(loadedToolPack.functions, parts.functionCall.name) && typeof toolFunction === "function") {
          // Log tools used
          childLogger.info({ tool_invoked: parts.functionCall.name, tool_id: parts.functionCall.id, user_snowflake: discord_interaction.author.id }, "User LLM called tool")
          childLogger.debug({ tool_name: parts.functionCall.name, tool_arguments: parts.functionCall.args, tool_id: parts.functionCall.id, user_snowflake: discord_interaction.author.id }, "Arg tool")

          try {
            // Call tools if it doesn't reach the max limit, if it does, we output the error instead
            if (toolCallTurnCount >= toolCallHardLimit) {
              toolResult = { error: "Reached tool call hard limit. Please try again later." };
              childLogger.error({ 'tool_name': parts.functionCall.name, 'tool_id': parts.functionCall.id, 'user_snowflake': discord_interaction.author.id }, "Max tool calls limit reached")
            } else {
              toolResult = await toolFunction(discord_interaction, parts.functionCall.args ?? {});

              // Check if toolResult includes supportable sources that can be added to the citations list.
              if (typeof toolResult === "object" && toolResult !== null && Object.hasOwn(toolResult, "supportable_sources")) {
                const sources = (toolResult as Record<string, unknown>).supportable_sources;

                if (isSupportableCitations(sources)) {
                  citations.push(...sources);
                  childLogger.debug({ supportable_sources: sources, tool_name: parts.functionCall.name }, "Found valid supportable_sources for sources to be cited");
                } else {
                  childLogger.debug({ supportable_sources: sources, tool_name: parts.functionCall.name }, "Found supportable_sources but the format is not valid... ignoring.");
                }

                // Then we remove supportable_sources key from toolResult so it doesn't get returned to the model
                delete (toolResult as Record<string, unknown>).supportable_sources;
              }

              // If the function returns void or undefined, we tell the model it doesn't return anything
              if (toolResult === undefined || toolResult === null) {
                childLogger.info({ tool_name: parts.functionCall.name, tool_id: parts.functionCall.id }, "The tool did not return a result")
                toolResult = { output: `The tool ${parts.functionCall.name} did not return a result` };
              }

              // Check if it directly returns bigInt, NOTE: any nested objects that has bigInt may fail and this check may not cover it
              if (typeof toolResult === "bigint") {
                childLogger.info({ tool_name: parts.functionCall.name, tool_id: parts.functionCall.id }, "Possible direct bigint returned, safely converting to string...")
                toolResult = { output: `${toolResult}` };
              }

              childLogger.debug({ tool_result: toolResult, tool_name: parts.functionCall.name, tool_id: parts.functionCall.id, user_snowflake: discord_interaction.author.id }, "Tool result")
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            childLogger.error({
              tool_name: parts.functionCall.name,
              tool_error: errorMessage,
              user_snowflake: discord_interaction.author.id,
            }, "Error calling tool");
            toolResult = {
              error: `Failed to execute tool ${parts.functionCall.name}`,
              reason: errorMessage,
            };
          } finally {
            // Increment tool call turn counter
            toolCallTurnCount += 1;
          }
        } else {
          childLogger.error({ 'tool_name': parts.functionCall.name, 'schema_found': schemaHasFound, 'user_snowflake': discord_interaction.author.id }, "Attempted to call tool but is not available")
          toolResult = {
            error: schemaHasFound
              ? `Tool ${parts.functionCall.name} is not available in the registered functions.`
              : `Function ${parts.functionCall.name} is not registered in the available tool schemas.`,
          };
        }

        // Prevent double-serialization: if a tool returned a JSON string,
        // parse it back into an object so the SDK won't escape it again
        // when serializing the functionResponse payload.
        if (typeof toolResult === "string") {
          try {
            toolResult = JSON.parse(toolResult);
          } catch {
            // Not valid JSON (plain string from a tool) — wrap it in an object
            toolResult = { output: toolResult };
          }
        }

        toolResponseResultsParts.push({
          functionResponse: {
            name: parts.functionCall.name,
            id: parts.functionCall.id,
            response: { api_result: toolResult }
          }
        });
      }
    }

    // Check if it executed any tool calls so we can submit the tool response by running text_chat_completion the second time
    // This will continue to next loop so it can output modalities but will also check again if there's a tool call issued so toolHasDone can be set to stop the loop
    if (hasToolCalls) {
      // Push the model response to context once (not per-part)
      chatContext.push({
        parts: firstCandidate.content.parts,
        role: firstCandidate.content.role ?? "model"
      });

      // Push all collected tool results to context once
      chatContext.push({
        parts: toolResponseResultsParts,
        role: "user",
      });

      // Send all tool results for this interaction together. Each call_id belongs
      // to the interaction that produced the current response.modelSteps.
      response = await text_chat_completion(
        model_props.model_id,
        chatContext,
        {
          system_prompt: JAKEY_SYSTEM_PROMPT,
          additional_properties: additionalParams,
        }
      );
      // Get first candidate of response
      if (!response.modelResponse.candidates || response.modelResponse.candidates.length === 0) {
        throw new Error('No candidates received from the model.');
      }
      firstCandidate = response.modelResponse.candidates.at(0);

      // Check if parts is undefined or empty
      if (!firstCandidate || !firstCandidate.content || !firstCandidate.content.parts || firstCandidate.content.parts.length === 0) {
        throw new Error('No response received from the model.');
      }

      continue;
    }

    // Assuming there are no proceeding tool calls requested, we can stop the loop
    toolHasDone = true;
  }

  // Push the final model response to context so it's saved alongside the user prompt.
  chatContext.push({
    parts: firstCandidate.content.parts,
    role: firstCandidate.content.role ?? "model"
  });

  // Save context back to db
  await saveContext(discord_user_id, chatContext, model_props.thread_name);

  // Send citations and queries as buttons
  await sendBtns(messageChannel, queryBtnAggregator(queries), linkBtnAggregator(citations));

  // Send model info
  await messageChannel.send(`-# [DEBUG] Model used: ${response.model_used}`);
}

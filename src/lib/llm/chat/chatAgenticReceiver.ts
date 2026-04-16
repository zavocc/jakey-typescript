import { loadContext, saveContext } from './contextMemory';
import { getModelProps } from './modelsSelection';
import type { ModelProps } from '../../../types/schemas';
import type { Message, SendableChannels } from 'discord.js';
import { JAKEY_SYSTEM_PROMPT } from '../../../data/sysprompts';
import { text_completion } from '../generateContent';
import { loadPreferences } from '../../preferencesDBLoader';

// Tool loader
import { fetchToolPack } from '../tools/utils';

export async function chatToLLM(
  prompt: string,
  discord_user_id: string,
  discord_interaction: Message,
  attachment_urls?: string[],
): Promise<void> {
  // Narrow to a channel type that is allowed to send messages
  const messageChannel: SendableChannels | null = discord_interaction.channel?.isSendable() ? discord_interaction.channel : null;
  if (!messageChannel) {
    throw new Error("Message channel is not available.");
  }

  // Load model properties
  const modelProps: ModelProps = await getModelProps(discord_user_id);

  // Load context and it's associated thread if existed
  let context = await loadContext(discord_user_id, modelProps.thread_name);

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
  let response = await text_completion(
    modelProps.model_id,
    modelProps.client_type,
    prompt,
    JAKEY_SYSTEM_PROMPT,
    attachment_urls,
    context,
    additionalParams
  );

  // Agentic loop
  let toolHasFinished = false;

  while (!toolHasFinished) {
    // Check if we have tools
    if (response.modelResponse.tool_calls) {
      // Append the response
      context.push(response.modelResponse);

      // For each tool call, execute and append the result to the context
      for (const toolCall of response.modelResponse.tool_calls) {
        // Only function-type tool calls are supported
        if (toolCall.type !== 'function') {
          console.warn(`Unsupported tool call type: ${toolCall.type}, skipping.`);
          continue;
        }

        let toolResult;
        const toolName = toolCall.function.name;
        const toolFunction = loadedToolPack.functions[toolName as keyof typeof loadedToolPack.functions];

        // Send interstitial
        await messageChannel.send(`-# > Used: ${toolName}`);

        try {
          toolResult = await toolFunction(discord_interaction, JSON.parse(toolCall.function.arguments));
        } catch (error) {
          console.error(`Error executing tool ${toolName}:`, error);
          toolResult = `{"error": "Failed to execute tool ${toolName}, reason: ${error instanceof Error ? error.message : String(error)}"}`;
        } finally {
          // Append tool result to context
          context.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: toolResult,
          });
        }
      }

      // Rerun
      response = await text_completion(
        modelProps.model_id,
        modelProps.client_type,
        undefined,
        JAKEY_SYSTEM_PROMPT,
        undefined,
        context,
        additionalParams
      );

      // If tool calls still exist, we continue the loop, otherwise we break and send the final response
      if (!response.modelResponse.tool_calls || response.modelResponse.tool_calls.length === 0) {
        toolHasFinished = true;
      } else {
        // Continue the loop and let the agent call more tools if needed
        continue;
      }
    } else {
      // No tools called, we can break the loop and send the response
      toolHasFinished = true;
    }
  }

  // Append
  context.push(response.modelResponse);

  // Save context back to db
  await saveContext(discord_user_id, context, modelProps.thread_name);

  // Check if response.modelResponse.content is null
  if (!response.modelResponse.content) {
    throw new Error("No output received from the model.");
  }

  // Reply to user
  await messageChannel.send(response.modelResponse.content);

  // Send model info
  await messageChannel.send(`-# [DEBUG] Model used: ${response.model_used}`);
}

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
  let context = await loadContext(discord_user_id);

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
  let response = await text_completion(
    modelProps.model_id,
    prompt,
    context ?? undefined,
    JAKEY_SYSTEM_PROMPT,
    attachment_urls,
    additionalParams
  );

  // Save interaction ID throughout the loop
  interactionIDStored = response.interactionID;

  while (!toolHasDone) {
    let hasToolCalls = false;

    // Process ALL outputs from the response first
    for (const output of response.modelOutputs) {
      // text
      if (output.type === 'text') {
        await messageChannel.send(output.text);
      }

      // search results
      if (output.type === 'google_search_result') {
        console.log("Searched for: ", output.result);
      }

      // tool calls
      if (output.type === 'function_call') {
        hasToolCalls = true;
        let toolResult;
        const toolName = output.name;
        const toolFunctions = loadedToolPack.functions[toolName as keyof typeof loadedToolPack.functions];

        // Send interstitial
        await messageChannel.send(`-# > Used: ${toolName}`);

        try {
          toolResult = await toolFunctions(discord_interaction, output.arguments ?? {});
        } catch (error) {
          console.error(`Error calling tool ${toolName}:`, error);
          toolResult = `{"error": "Failed to execute tool ${toolName}, reason: ${error instanceof Error ? error.message : String(error)}"}`;
        }

        // Rerun with tool result — use the interaction ID from the function call response
        // so the API sees the function result as a continuation of the correct turn
        response = await text_completion(
          modelProps.model_id,
          [
            {
              type: 'function_result',
              name: output.name,
              call_id: output.id,
              result: toolResult
            }
          ],
          interactionIDStored,
          JAKEY_SYSTEM_PROMPT,
          undefined,
          additionalParams
        );

        // Update stored ID to the latest interaction in the chain
        interactionIDStored = response.interactionID;
      }
    }

    // After processing all outputs, check if the (potentially new) response has more tool calls
    if (!hasToolCalls) {
      toolHasDone = true;
    }
  }

  if (!interactionIDStored) {
    throw new Error("No interaction ID stored.");
  }

  // Save context back to db
  await saveContext(discord_user_id, interactionIDStored);

  // Send model info
  await messageChannel.send(`-# [DEBUG] Model used: ${response.model_used}`);
}

import { loadContext, saveContext } from './contextMemory';
import { getModelProps } from './modelsSelection';
import type { ModelProps } from '../../../types/schemas';
import type { Message, SendableChannels } from 'discord.js';
import { JAKEY_SYSTEM_PROMPT } from '../../../data/sysprompts';
import { text_completion } from '../generateContent';

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

  // Generate content
  let response = await text_completion(
    modelProps.model_id,
    prompt,
    context ?? undefined,
    JAKEY_SYSTEM_PROMPT,
    attachment_urls,
    additionalParams
  );

  // Save context back to db
  await saveContext(discord_user_id, response.interactionID);

  // Check if response.modelResponse.content is null
  if (!response.modelOutputs) {
    throw new Error("No output received from the model.");
  }

  // Reply to user
  const lastOutput = response.modelOutputs[response.modelOutputs.length - 1];
  if (lastOutput.type !== 'text') {
    throw new Error(`Expected text output, but got: ${lastOutput.type}`);
  }
  await messageChannel.send(lastOutput.text);

  // Send model info
  await messageChannel.send(`-# [DEBUG] Model used: ${response.model_used}`);
}

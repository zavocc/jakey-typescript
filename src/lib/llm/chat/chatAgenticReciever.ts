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
  let context = await loadContext(discord_user_id, modelProps.thread_name);

  // Check if we have attachments but the model doesn't support it
  if (attachment_urls && attachment_urls.length > 0 && !modelProps.enable_files) {
    throw new Error("Sorry, the current model does not support file attachments.");
  }

  // Generate content
  const response = await text_completion(
    modelProps.model_id,
    prompt,
    JAKEY_SYSTEM_PROMPT,
    attachment_urls,
    context,
    modelProps.additional_properties,
  );

  // Append
  context.push(response.modelResponse);

  // Save context back to db
  await saveContext(discord_user_id, context, modelProps.thread_name);

  // Reply to user
  await messageChannel.send(response.modelResponse.content);

  // Send model info
  await messageChannel.send(`-# [DEBUG] Model used: ${response.model_used}`);
}

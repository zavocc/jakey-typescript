// context
import { loadContext, saveContext } from './contextMemory';

// models
import type { ModelProps } from '../../../types/schemas';
import { models } from '../../../models.json';

import { api_keys } from '../../../config.json';
import { JAKEY_SYSTEM_PROMPT } from '../../../data/sysprompts';

import { OpenRouter } from '@openrouter/sdk';

// DEBUG
import { mkdir, writeFile } from 'fs/promises';

const openrouter = new OpenRouter({
  apiKey: api_keys.openrouter,
});

export async function completion(
  prompt: string,
  discord_user_id: string,
  attachment_urls?: string[],
): Promise<{ text: string; model_used: string; }> {
  const context = await loadContext(discord_user_id);

  // If context is empty, put system prompt
  if (context.length === 0) {
    context.push({
      role: 'system',
      content: [
        {
          type: 'text',
          text: JAKEY_SYSTEM_PROMPT,
        }
      ],
    });
  }

  // Parse model properties from the JSON file
  // Only choose 1 for now, validation later
  const modelProps: ModelProps = models[0];

  // Construct a prompt
  const constructedContent = [];

  // Check if we have image attachments and is enabled
  if (attachment_urls && attachment_urls.length > 0) {
    // throw an error if the model doesn't support files
    if (!modelProps.enable_files) {
      throw new Error(`The model **${modelProps.model_friendly_name}** does not support file attachments.`);
    }

    const attachmentMessages = attachment_urls.map((url) => ({
      type: 'image_url',
      imageUrl: {
        url: url,
      }
    }));
    constructedContent.push(...attachmentMessages);
  }

  // Append the user's text prompt
  constructedContent.push({
    type: 'text',
    text: prompt,
  });

  const constructedPrompt = {
    role: 'user',
    content: constructedContent,
  };

  // Append the latest prompt to the context
  context.push(constructedPrompt);

  const outputs = await openrouter.chat.send({
    chatGenerationParams: {
      model: modelProps.model_id,
      messages: context,
      stream: false,
      reasoning: {
        effort: 'low',
      },
      temperature: 1
    }
  })

  // Log possible outputs
  const debugDir = `${__dirname}/../../../harbour/debug`;
  await mkdir(debugDir, { recursive: true });
  await writeFile(`${debugDir}/${discord_user_id}.json`, JSON.stringify(outputs, null, 2));

  // Append the assistant's response to the context
  context.push(outputs.choices[0].message);

  // save the updated context
  await saveContext(discord_user_id, context);

  // return the assistant's response and model information
  return {
    text: outputs.choices[0].message.content,
    model_used: outputs.model,
  };
}

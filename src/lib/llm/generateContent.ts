import { getConfigJsonKeySync } from '../../lib/configuratorJSON';
import { OpenRouter } from '@openrouter/sdk';
import type { AssistantMessage } from '@openrouter/sdk/models';

// DEBUG
import { mkdir, writeFile } from 'fs/promises';

const openrouter = new OpenRouter({
  apiKey: getConfigJsonKeySync("api_keys")?.openrouter ?? ""
});

type OutputShape = {
  modelResponse: AssistantMessage,
  model_used: string,
}

export async function text_completion(
  model: string,
  prompt?: string,
  system_prompt?: string,
  attachment_urls?: string[],
  messages_context?: Array<any>,
  additional_properties?: Record<string, any>,
): Promise<OutputShape> {
  // Parse model properties from the JSON file
  // Only choose 1 for now, validation later
  let context = messages_context || [];

  // Require at least one input modality: prompt, attachment, or prior context
  if ((!prompt || prompt.trim() === '') && (!attachment_urls || attachment_urls.length === 0) && context.length === 0) {
    throw new Error('At least one input modality must be provided: prompt, attachment_urls, or messages_context.');
  }

  // If context is empty, put system prompt
  if ((context.length === 0) && system_prompt) {
    context.push({
      role: 'system',
      content: [
        {
          type: 'text',
          text: system_prompt,
        }
      ],
    });
  }


  // Construct a prompt
  const constructedContent = [];

  // Check if we have image attachments and is enabled and have attachment_urls set
  // So we can push it as part of the prompt content pieces
  if (attachment_urls && attachment_urls.length > 0) {
    const attachmentMessages = attachment_urls.map((url) => ({
      type: 'image_url',
      imageUrl: {
        url: url,
      }
    }));
    constructedContent.push(...attachmentMessages);
  }

  // Append the user's text prompt, if prompt? is not empty
  if (prompt && prompt.trim() !== '') {
    constructedContent.push({
      type: 'text',
      text: prompt,
    });
  }

  // Check if the constructedContent has more than 0 content pieces, so we can push it to context as the latest user message
  if (constructedContent.length > 0) {
    const constructedPrompt = {
      role: 'user',
      content: constructedContent,
    };

    // Append the latest prompt to the context
    context.push(constructedPrompt);
  }

  let additionalParams;
  // Pass additional params if existed
  if (additional_properties) {
    additionalParams = additional_properties;
  }

  const outputs = await openrouter.chat.send({
    chatGenerationParams: {
      ...additionalParams,
      model: model,
      messages: context,
      stream: false,
      temperature: 1
    }
  })

  // Log possible outputs
  const debugDir = `${__dirname}/../../../harbour/debug`;
  await mkdir(debugDir, { recursive: true });
  await writeFile(`${debugDir}/debug.json`, JSON.stringify(outputs, null, 2));

  return {
    modelResponse: outputs.choices[0].message,
    model_used: outputs.model
  };
}

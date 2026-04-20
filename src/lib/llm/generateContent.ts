import { GoogleClient } from './providerClients';
import type { Interactions } from '@google/genai';

// DEBUG
import { mkdir, writeFile } from 'fs/promises';

export type OutputShape = {
  modelOutputs: Interactions.Content[],
  model_used: string,
  interactionID: string
}

export async function text_completion(
  model: string,
  prompt: string | Interactions.Content[],
  interactions_context_id?: string,
  system_prompt?: string,
  attachment_urls?: string[],
  additional_properties?: Record<string, any>,
): Promise<OutputShape> {
  let constructedContent: Interactions.Content[];

  // Construct a prompt
  if (typeof prompt === "string") {
    constructedContent = [];

    // Check if we have image attachments and is enabled and have attachment_urls set
    // So we can push it as part of the prompt content pieces
    if (attachment_urls && attachment_urls.length > 0) {
      const attachmentMessages = attachment_urls.map((url) => ({
        type: 'image' as const,
        uri: url,
        mime_type: undefined
      }));
      constructedContent.push(...attachmentMessages);
    }

    // Append the user's text prompt, if prompt is not empty
    if (prompt.trim() !== '') {
      constructedContent.push({
        type: 'text' as const,
        text: prompt,
      });
    }
  } else {
    // prompt is already an array (e.g. tool results), use directly
    constructedContent = prompt;
  }

  let additionalParams;
  // Pass additional params if existed
  if (additional_properties) {
    additionalParams = additional_properties;
  }

  const interactionsResult = await GoogleClient.interactions.create({
    ...additionalParams,
    model: model,
    input: constructedContent,
    stream: false,
    system_instruction: system_prompt,
    previous_interaction_id: interactions_context_id ?? undefined
  })

  // We cannot receive null output so we throw if it is null
  if (!interactionsResult.outputs) {
    throw new Error('No output received from the model.');
  }

  // Log possible outputs
  const debugDir = `${__dirname}/../../../harbour/debug`;
  await mkdir(debugDir, { recursive: true });
  await writeFile(`${debugDir}/debug.json`, JSON.stringify(interactionsResult.outputs, null, 2));

  return {
    modelOutputs: interactionsResult.outputs,
    model_used: interactionsResult.model ?? "Not specified",
    interactionID: interactionsResult.id
  };
}

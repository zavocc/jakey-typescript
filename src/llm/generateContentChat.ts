import { GoogleClient } from '../lib/genAIClients.js';
import { uploadToGoogleFilesAPI } from './fileUpload.js';
import type { Interactions } from '@google/genai';

export async function text_chat_completion(
  model: string,
  prompt: string | Interactions.Content[],
  optional_params?: {
    interactions_context_id?: string,
    system_prompt?: string,
    attachment_urls?: Array<{
      fileName: string;
      mimeType: string;
      fileURI: string;
    }>,
    additional_properties?: Record<string, unknown>,
  },
): Promise<{
  modelOutputs: Interactions.Content[],
  model_used: string,
  interactionID: string
}> {
  // Parse optional params
  const { interactions_context_id, system_prompt, attachment_urls, additional_properties } = optional_params ?? {};

  let constructedContent: Interactions.Content[];

  // Construct a prompt
  if (typeof prompt === "string") {
    constructedContent = [];

    // Check if we have attachments and detect their media type via HEAD request
    // So we can push it as part of the prompt content pieces with the correct type
    if (attachment_urls && attachment_urls.length > 0) {
      const attachmentMessages = await Promise.all(
        attachment_urls.map(async (attachment) => {
          const curURI = await uploadToGoogleFilesAPI(attachment.fileName, attachment.mimeType, attachment.fileURI);

          // Detect filetype based on mimeType
          if (attachment.mimeType.startsWith("image")) {
            return {
              type: 'image' as const,
              uri: curURI,
              mime_type: attachment.mimeType as Interactions.ImageContent['mime_type']
            };
          } else if (attachment.mimeType.startsWith("video")) {
            return {
              type: 'video' as const,
              uri: curURI,
              mime_type: attachment.mimeType as Interactions.VideoContent['mime_type']
            };
          } else if (attachment.mimeType.startsWith("audio")) {
            return {
              type: 'audio' as const,
              uri: curURI,
              mime_type: attachment.mimeType as Interactions.AudioContent['mime_type']
            };
          } else {
            return {
              type: 'document' as const,
              uri: curURI,
              mime_type: attachment.mimeType as Interactions.DocumentContent['mime_type']
            };
          }
        })
      );
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

  return {
    modelOutputs: interactionsResult.outputs,
    model_used: interactionsResult.model ?? "Not specified",
    interactionID: interactionsResult.id
  };
}

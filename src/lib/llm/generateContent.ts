import { GoogleClient } from './providerClients';
import type { Interactions } from '@google/genai';

// DEBUG
import { mkdir, writeFile } from 'fs/promises';

type MediaType = 'image' | 'audio' | 'video' | 'document';

/**
 * Determines media type from a URL using an HTTP HEAD request (no download).
 * Falls back to URL extension parsing if HEAD fails.
 */
async function getMediaType(url: string): Promise<MediaType> {
  // Try HEAD request first to get Content-Type without downloading
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const contentType = res.headers.get('content-type') ?? '';

    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.startsWith('application/pdf')) return 'document';
  } catch {
    // HEAD request failed, fall through to extension-based detection
  }

  // Fallback: guess from URL file extension
  try {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'svg'].includes(ext ?? '')) return 'image';
    if (['mp4', 'webm', 'mov', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gpp'].includes(ext ?? '')) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'aiff', 'm4a', 'opus'].includes(ext ?? '')) return 'audio';
    if (['pdf'].includes(ext ?? '')) return 'document';
  } catch {
    // URL parsing failed
  }

  // Default to image if we can't determine the type
  return 'image';
}

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

    // Check if we have attachments and detect their media type via HEAD request
    // So we can push it as part of the prompt content pieces with the correct type
    if (attachment_urls && attachment_urls.length > 0) {
      const attachmentMessages = await Promise.all(
        attachment_urls.map(async (url) => {
          const mediaType = await getMediaType(url);
          return {
            type: mediaType,
            uri: url,
            mime_type: undefined
          };
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

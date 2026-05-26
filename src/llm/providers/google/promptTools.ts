import { uploadToGoogleFilesAPI } from './fileUpload.js';
import type { FileMetadata } from './types.js';
import type { Interactions } from '@google/genai';

export async function constructUserPrompt(prompt: string | Interactions.Content[], attachment_urls?: Array<FileMetadata>): Promise<Interactions.Content[]> {
  let constructedContent: Interactions.Content[];

  // Construct a prompt
  if (typeof prompt === "string") {
    const contentArray: Interactions.Content[] = [];

    // Check if we have attachments and detect their media type via HEAD request
    // So we can push it as part of the prompt content pieces with the correct type
    if (attachment_urls && attachment_urls.length > 0) {
      const attachmentMessages = await Promise.all(
        attachment_urls.map(async (attachment) => {
          const curURI = await uploadToGoogleFilesAPI(attachment.fileName, attachment.mimeType, attachment.fileURI);
          const metastring = `File URL: ${attachment.fileURI}, File Name: ${attachment.fileName}, Alt Text: ${attachment.AltText ?? "No alt text"}, Mime Type: ${attachment.mimeType}`

          // Detect filetype based on mimeType
          // We return and flatten these arrays to be pushed rather than pushing these parts individually inside this promise to ensure deterministic ordering
          if (attachment.mimeType.startsWith("image")) {
            return [{
              type: 'image' as const,
              uri: curURI,
              mime_type: attachment.mimeType as Interactions.ImageContent['mime_type']
            },
            {
              type: 'text' as const,
              text: metastring
            }];
          } else if (attachment.mimeType.startsWith("video")) {
            return [{
              type: 'video' as const,
              uri: curURI,
              mime_type: attachment.mimeType as Interactions.VideoContent['mime_type']
            },
            {
              type: 'text' as const,
              text: metastring
            }];
          } else if (attachment.mimeType.startsWith("audio")) {
            return [{
              type: 'audio' as const,
              uri: curURI,
              mime_type: attachment.mimeType as Interactions.AudioContent['mime_type']
            },
            {
              type: 'text' as const,
              text: metastring
            }];
          } else {
            return [{
              type: 'document' as const,
              uri: curURI,
              mime_type: attachment.mimeType as Interactions.DocumentContent['mime_type']
            },
            {
              type: 'text' as const,
              text: metastring
            }];
          }
        })
      );
      contentArray.push(...attachmentMessages.flat());
    }

    // Append the user's text prompt, if prompt is not empty
    if (prompt.trim() !== '') {
      contentArray.push({
        type: 'text' as const,
        text: prompt,
      });
    }
    constructedContent = contentArray;
  } else {
    // prompt is already an array (e.g. tool results), use directly
    constructedContent = prompt;
  }

  return constructedContent;
}

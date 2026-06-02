import { uploadFileLLM } from '../../../lib/files/fileUpload.js';
import type { FileMetadata } from '../../types.js';
import type { ChatCompletionMessageParam } from 'openai/resources';

export async function constructUserPrompt(prompt: string, attachment_urls?: Array<FileMetadata>): Promise<Array<ChatCompletionMessageParam>> {
  const messagesArray: Array<ChatCompletionMessageParam> = [];

  // Check if we have attachments and detect their media type via HEAD request
  // So we can push it as part of the prompt content pieces with the correct type
  if (attachment_urls && attachment_urls.length > 0) {
    const attachmentMessages = await Promise.all(
      attachment_urls.map(async (attachment) => {
        const curURI = await uploadFileLLM(attachment.fileName, attachment.mimeType, attachment.fileURI)
        const metastring = `File URL: ${attachment.fileURI}, File Name: ${attachment.fileName}, Alt Text: ${attachment.AltText ?? "No alt text"}, Mime Type: ${attachment.mimeType}`

        return {
          role: "user" as const,
          content: [
            {
              type: "image_url" as const,
              image_url: {
                url: curURI,
              },
            },
            {
              type: "text" as const,
              text: metastring,
            }
          ],
        };
      })
    );
    messagesArray.push(...attachmentMessages);
  }

  // Append the user's text prompt, if prompt is not empty
  if (prompt.trim() !== '') {
    messagesArray.push({
      role: "user",
      content: prompt,
    });
  }

  return messagesArray;
}

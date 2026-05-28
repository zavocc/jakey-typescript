import { uploadToGoogleFilesAPI } from './fileUpload.js';
import type { FileMetadata } from './types.js';

export async function constructUserPrompt(prompt: string, attachment_urls?: Array<FileMetadata>) {
  const contentPartsArray = [];

  // Check if we have attachments and detect their media type via HEAD request
  // So we can push it as part of the prompt content pieces with the correct type
  if (attachment_urls && attachment_urls.length > 0) {
    const attachmentMessages = await Promise.all(
      attachment_urls.map(async (attachment) => {
        const curURI = await uploadToGoogleFilesAPI(attachment.fileName, attachment.mimeType, attachment.fileURI);
        const metastring = `File URL: ${attachment.fileURI}, File Name: ${attachment.fileName}, Alt Text: ${attachment.AltText ?? "No alt text"}, Mime Type: ${attachment.mimeType}`

        return [
          {
            file_data: {
              mime_type: attachment.mimeType,
              file_uri: curURI
            }
          },
          {
            text: metastring
          }];
      })
    );
    contentPartsArray.push(...attachmentMessages.flat());
  }

  // Append the user's text prompt, if prompt is not empty
  if (prompt.trim() !== '') {
    contentPartsArray.push({
      text: prompt
    });
  }

  return {
    parts: contentPartsArray,
    role: "user"
  }
}

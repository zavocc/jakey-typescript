import { uploadFileLLM } from "../../../lib/files/fileUpload.js";
import type { FileMetadata } from "../../types.js";
import type { CodexUserInput } from "./generateContent.js";

export async function constructUserPrompt(prompt: string, attachment_urls?: Array<FileMetadata>): Promise<Array<CodexUserInput>> {
  const inputs: Array<CodexUserInput> = [];

  if (attachment_urls && attachment_urls.length > 0) {
    const attachmentInputs = await Promise.all(
      attachment_urls.map(async (attachment) => {
        const publicUrl = await uploadFileLLM(attachment.fileName, attachment.mimeType, attachment.fileURI);
        const metastring = `File URL: ${attachment.fileURI}, File Name: ${attachment.fileName}, Alt Text: ${attachment.AltText ?? "No alt text"}, Mime Type: ${attachment.mimeType}`;
        const content: Array<CodexUserInput> = [];

        if (attachment.mimeType.startsWith("image/")) {
          content.push({
            type: "image",
            url: publicUrl,
          });
        }

        content.push({
          type: "text",
          text: metastring,
          text_elements: [],
        });

        return content;
      })
    );
    inputs.push(...attachmentInputs.flat());
  }

  if (prompt.trim() !== "") {
    inputs.push({
      type: "text",
      text: prompt,
      text_elements: [],
    });
  }

  return inputs;
}

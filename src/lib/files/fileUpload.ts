import { createModuleLogger } from "../pinoLogger.js";
import crypto from "node:crypto";
import { filesAdapter } from "./index.js";

const childLogger = createModuleLogger(import.meta.url);

export async function uploadFileLLM(fileName: string, mimeType: string, fileURL: string): Promise<string> {
  const finalFileName = `${crypto.randomUUID()}.${fileName}`;

  const response = await fetch(fileURL);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  try {
    await filesAdapter.upload(finalFileName, response.body, {
      contentType: mimeType
    });
  } catch (error) {
    throw new Error(`Failed to upload file ${fileName} with cause: ${error}`, { cause: error });
  }
  childLogger.info({ file_uploaded: fileName, hashed_filename: finalFileName }, "Uploaded file...")

  // Get file URI
  const fileURI = await filesAdapter.url(finalFileName)

  if (!fileURI) {
    throw new Error("Failed to get uploaded file URI");
  }

  // Return the URL
  return fileURI;
}

import { GoogleClient } from "../lib/services/services.js";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export async function uploadToGoogleFilesAPI(fileName: string, mimeType: string, fileURL: string): Promise<string> {
  // Create a temporary directory for the download
  const tempDir = await mkdtemp(join(tmpdir(), "jkey-download-"));
  const outputFile = join(tempDir, fileName);

  // Download the file to outputFile
  const response = await fetch(fileURL);

  // Check
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  // Chunk download for efficiency
  await pipeline(Readable.from(response.body), createWriteStream(outputFile));

  // Then we upload the file to Google service
  let uploadedFile;
  try {
    uploadedFile = await GoogleClient.files.upload({
      file: outputFile,
      config: {
        mimeType: mimeType
      }
    });
  } catch (error) {
    throw new Error(`Failed to upload file: ${error}`, { cause: error });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
  console.log(`[INFO] Uploaded file to Google Service: ${fileName}`)

  if (!uploadedFile || !uploadedFile.uri) {
    throw new Error("Failed to get uploaded file URI");
  }

  // Return the URL
  return uploadedFile.uri;
}

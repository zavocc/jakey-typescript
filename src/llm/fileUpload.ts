import logger from "../lib/pinoLogger.js";
import crypto from "node:crypto";
import { GoogleClient } from "../lib/genAIClients.js";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const childLogger = logger.child({ module: "llm.fileUpload" });

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
  let uploadDone = false;
  try {
    uploadedFile = await GoogleClient.files.upload({
      file: outputFile,
      config: {
        name: crypto.randomUUID(),
        mimeType: mimeType
      }
    });

    // Check status and wait for processing
    while (!uploadDone) {
      const status = await GoogleClient.files.get({ name: uploadedFile.name ?? "" });
      if (status.state === "ACTIVE") {
        uploadDone = true;
      } else if (status.state === "FAILED") {
        throw new Error(`File upload failed`);
      } else if (status.state === "PROCESSING") {
        // set timeout for 2 seconds, then execute Promise's resolve function to proceed with next loop
        await new Promise<void>(resolve => setTimeout(() => { resolve(); }, 2000));
      }
    }
  } catch (error) {
    throw new Error(`Failed to upload file ${fileName} with cause: ${error}`, { cause: error });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
  childLogger.info({ file_uploaded: fileName }, "Uploaded file to Google service")

  if (!uploadedFile || !uploadedFile.uri) {
    throw new Error("Failed to get uploaded file URI");
  }

  // Return the URL
  return uploadedFile.uri;
}

import logger from "../pinoLogger.js";
import crypto from "node:crypto";
import { filesAdapter } from "./index.js";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const childLogger = logger.child({ module: "lib.files.fileUpload" });

// check if BUCKET_ROOT exists
let bucketRoot = "";
if (process.env.BUCKET_ROOT) {
  bucketRoot = process.env.BUCKET_ROOT.endsWith("/") ? process.env.BUCKET_ROOT : process.env.BUCKET_ROOT + "/";
}

export async function uploadFile(fileName: string, mimeType: string, fileURL: string): Promise<string> {
  // Create a temporary directory for the download
  const tempDir = await mkdtemp(join(tmpdir(), "jkey-download-"));
  const outputFile = join(tempDir, fileName);
  const finalFileName = bucketRoot + `${crypto.randomUUID()}.${fileName}`;

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
  try {
    await filesAdapter.upload(finalFileName, outputFile, {
      contentType: mimeType
    });
  } catch (error) {
    throw new Error(`Failed to upload file ${fileName} with cause: ${error}`, { cause: error });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
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

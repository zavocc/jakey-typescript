import { Files } from "files-sdk";
import { gcs } from "files-sdk/gcs";

// IN DEVELOPMENT! TODO: Add config based adapter configuration

if (!process.env.FILES_BUCKET_NAME) {
  throw new Error("FILES_BUCKET_NAME environment variable not set");
}

export const filesAdapter = new Files({
  adapter: gcs({
    bucket: process.env.FILES_BUCKET_NAME,
  }),
});

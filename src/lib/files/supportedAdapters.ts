import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Adapter, FilesOptions } from "files-sdk";
import { z } from "zod";

// Keep these schemas minimal. Adapter-specific options are documented at
// https://files-sdk.dev/adapters and are passed through to files-sdk.
const FilesConfigSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("gcs"),
    prefix: z.string().optional(),
    config: z.object({
      bucket: z.string(),
    }).loose(),
  }),
  z.object({
    provider: z.literal("s3"),
    prefix: z.string().optional(),
    config: z.object({
      bucket: z.string(),
    }).loose(),
  }),
  z.object({
    provider: z.literal("r2"),
    prefix: z.string().optional(),
    config: z.object({
      bucket: z.string(),
    }).loose(),
  }),
  z.object({
    provider: z.literal("azure"),
    prefix: z.string().optional(),
    config: z.object({
      container: z.string(),
    }).loose(),
  }),
  z.object({
    provider: z.literal("supabase"),
    prefix: z.string().optional(),
    config: z.object({
      bucket: z.string(),
    }).loose(),
  }),
  z.object({
    provider: z.literal("backblaze-b2"),
    prefix: z.string().optional(),
    config: z.object({
      bucket: z.string(),
      region: z.string(),
    }).loose(),
  }),
]);

const filesConfigPath = path.resolve(process.cwd(), "files.config.json");

function loadFilesConfig(): unknown {
  if (existsSync(filesConfigPath)) {
    return JSON.parse(readFileSync(filesConfigPath, "utf-8")) as unknown;
  }

  if (!process.env.FILES_BUCKET_NAME) {
    throw new Error(`Files config not found at ${filesConfigPath}`);
  }

  // Fall back to GCS if no config is found, which requires ADC
  return {
    provider: "gcs",
    ...(process.env.BUCKET_ROOT && { prefix: process.env.BUCKET_ROOT }),
    config: {
      bucket: process.env.FILES_BUCKET_NAME,
    },
  };
}

export async function createFilesOptionsFromConfigFile(): Promise<FilesOptions<Adapter>> {
  const filesConfig = FilesConfigSchema.parse(loadFilesConfig());
  let adapter: Adapter;

  switch (filesConfig.provider) {
    case "gcs": {
      const { gcs } = await import("files-sdk/gcs");
      adapter = gcs(filesConfig.config);
      break;
    }
    case "s3": {
      const { s3 } = await import("files-sdk/s3");
      adapter = s3(filesConfig.config);
      break;
    }
    case "r2": {
      const { r2 } = await import("files-sdk/r2");
      adapter = r2(filesConfig.config);
      break;
    }
    case "azure": {
      const { azure } = await import("files-sdk/azure");
      adapter = azure(filesConfig.config);
      break;
    }
    case "supabase": {
      const { supabase } = await import("files-sdk/supabase");
      adapter = supabase(filesConfig.config);
      break;
    }
    case "backblaze-b2": {
      const { backblazeB2 } = await import("files-sdk/backblaze-b2");
      adapter = backblazeB2(filesConfig.config);
      break;
    }
  }

  return {
    adapter,
    ...(filesConfig.prefix && { prefix: filesConfig.prefix }) // apply prefix if it exists
  };
}

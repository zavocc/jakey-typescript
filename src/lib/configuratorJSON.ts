import { ConfigSchema, validateOrThrow } from "../types/schemas";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

const CONFIG_JSON_PATH = path.join(__dirname, "../config.json");

type ConfigSchemaType = z.infer<typeof ConfigSchema>;
let cachedConfig: ConfigSchemaType | undefined;

function loadConfigJsonSync(): ConfigSchemaType {
  if (cachedConfig) {
    return cachedConfig;
  }

  const fileContent = readFileSync(CONFIG_JSON_PATH, "utf-8");
  const parsedConfig = JSON.parse(fileContent);
  cachedConfig = validateOrThrow(CONFIG_JSON_PATH, ConfigSchema, parsedConfig);
  return cachedConfig;
}

export function getConfigJsonKeySync<K extends keyof ConfigSchemaType>(
  key: K,
): ConfigSchemaType[K] | undefined {
  // Return the requested key if it exists, otherwise return undefined
  const config = loadConfigJsonSync();
  return config[key] ?? undefined;
}

async function loadConfigJson(): Promise<ConfigSchemaType> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const fileContent = await readFile(CONFIG_JSON_PATH, "utf-8");
  const parsedConfig = JSON.parse(fileContent);
  cachedConfig = validateOrThrow(CONFIG_JSON_PATH, ConfigSchema, parsedConfig);
  return cachedConfig;
}

export async function getConfigJsonKey<K extends keyof ConfigSchemaType>(
  key: K,
): Promise<ConfigSchemaType[K] | undefined> {
  // Return the requested key if it exists, otherwise return undefined
  const config = await loadConfigJson();
  return config[key] ?? undefined;
}


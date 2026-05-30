import { loadPreferences } from "../../lib/preferencesDBLoader.js";
import { ModelPropsSchema } from "../../types/schemas.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const ModelsFileSchema = z.object({
  models: z.array(ModelPropsSchema),
});

type ModelPropsType = z.infer<typeof ModelPropsSchema>;
type ModelsFile = z.infer<typeof ModelsFileSchema>;

export async function loadModelsFile(): Promise<ModelsFile> {
  const modelsPath = path.resolve(process.cwd(), "src", "models.json");
  const raw = await readFile(modelsPath, "utf-8");
  return ModelsFileSchema.parse(JSON.parse(raw));
}

// TODO: To cache models list in memory after first read, refresh after ttl expires, since it won't change until we restart the bot.
// For now the file is being re-read everytime we call getModelProps
export async function getModelProps(userId: string): Promise<ModelPropsType> {
  // Load user model selection so we can search thru models.json for the right one
  const userModelAlias = await loadPreferences(userId, "user_choice_model_alias");

  const { models } = await loadModelsFile();

  const selectedModel = userModelAlias
    ? models.find((model) => model.model_alias === userModelAlias)
    : undefined;

  // If null, we get the first model in the list as default
  // Check if selected model exists from data, if not, throw an exception
  if (userModelAlias && !selectedModel) {
    throw new Error("Model unavailable");
  }

  return selectedModel ?? models.at(0) ?? (() => { throw new Error("No models available"); })();;
}

import { loadPreferences } from "../../preferencesDBLoader";
import { ModelPropsSchema } from "../../../types/schemas";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

type ModelPropsType = z.infer<typeof ModelPropsSchema>;

export async function getModelProps(userId: string): Promise<ModelPropsType> {
  // Load user model selection so we can search thru models.json for the right one
  const userModelAlias = await loadPreferences(userId, "user_choice_model_alias");

  // Open models.json file
  const modelsPath = path.resolve(process.cwd(), "src", "models.json");
  const raw = await readFile(modelsPath, "utf-8");
  const { models } = JSON.parse(raw) as { models: Array<ModelPropsType> };

  // If null, we get the first model in the list as default
  if (userModelAlias) {
    // Iterate to see if we have associated model with the alias
    for (const model of models) {
      if (model.model_alias === userModelAlias) {
        return model;
      }
    }
  }

  return models[0];
}

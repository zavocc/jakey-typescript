import { z } from "zod";

// for preferences
export const PreferencesSchema = z.object({
  user_choice_model_alias: z.string(),
  user_choice_tool: z.string().optional(),
  current_interaction_id: z.string().nullable().optional()
});

// models.json
export const ModelPropsSchema = z.object({
  model_id: z.string(),
  model_alias: z.string(),
  enable_files: z.boolean(),
  enable_tools: z.boolean(),
  provider: z.enum(["google", "openai"]),
  thread_name: z.string().optional(),
  additional_properties: z.record(z.string(), z.unknown()).optional()
});

// config.json
export const ConfigSchema = z.object({
  token: z.string(),
  app_id: z.string(),
  api_keys: z.object({
    google: z.string(),
  }),
  db: z.object({
    mongodb: z.string(),
    mongodb_db_name: z.string()
  }),
  // Optional
  tools: z.object({
    webSearchAPIKey: z.string().optional()
  }).optional()
});

export type ModelProps = z.infer<typeof ModelPropsSchema>;
export type Config = z.infer<typeof ConfigSchema>;

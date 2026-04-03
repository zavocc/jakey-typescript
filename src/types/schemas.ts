import { z } from "zod";

// for preferences
export const PreferencesSchema = z.object({
  user_choice_model_alias: z.string(),
  user_choice_tool: z.string().optional()
});

// models.json
export const ModelPropsSchema = z.object({
  model_id: z.string(),
  model_alias: z.string(),
  enable_files: z.boolean(),
  enable_tools: z.boolean(),
  additional_properties: z.record(z.string(), z.unknown()).optional()
});

// config.json
export const ConfigSchema = z.object({
  token: z.string(),
  app_id: z.string(),
  api_keys: z.object({
    openrouter: z.string()
  }),
  db: z.object({
    mongodb: z.string(),
    mongodb_db_name: z.string()
  })
});

export function validateOrThrow<T>(label: string, schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const fieldPath = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `- ${fieldPath}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(
      `Invalid ${label}. Please fix ${label} and try again.\n${details}`
    );
  }

  return result.data;
}

export type ModelProps = z.infer<typeof ModelPropsSchema>;
export type Config = z.infer<typeof ConfigSchema>;

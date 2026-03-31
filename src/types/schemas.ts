import { z } from "zod";

export const ModelPropsSchema = z.object({
    model_id: z.string(),
    model_friendly_name: z.string(),
    enable_files: z.boolean(),
    enable_tools: z.boolean(),
    additional_properties: z.record(z.string(), z.unknown()).optional()
});

export type ModelProps = z.infer<typeof ModelPropsSchema>;
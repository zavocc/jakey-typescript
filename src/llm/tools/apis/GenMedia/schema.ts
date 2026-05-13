export const TOOL_HUMAN_NAME = "Generate Media"
export const TOOL_SCHEMAS = [
  {
    type: "function",
    name: "generate_image",
    description: "Create or edit images using Nano Banana 2",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Prompt for the image model to generate or edit, optimize the instructions for LLM, not diffusion. Keep the prompt succinct or as-is closer to user's request to avoid unwanted details",
        },
        url_context: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "URL of an image",
              },
              mimetype: {
                type: "string",
                description: "Infer the mimetype of the image extension of the URL or from metadata",
              },
            },
            required: ["url", "mimetype"]
          },
          description: "Image URLs to be used as reference. To ensure determinism, the ordering must be the same as user provided images in its order.",
        },
        use_search: {
          type: "boolean",
          description: "Toggle this to enable text and visual image search to ensure factual accuracy and up-to-date information using Google Search. Note that this only exposes the tool to the model, manual instruction is still required.",
        },
        thinking_effort: {
          type: "string",
          enum: ["minimal", "high"],
          description: "Use minimal for quick edits or generation, high is for complex prompts that requires the model to think through its own generated images as thinks before sending the final image."
        }
      },
      required: ["prompt"]
    }
  }
]

export const TOOL_HUMAN_NAME = "Web Search"
export const TOOL_SCHEMAS = [
  {
    type: "function",
    name: "web_search",
    description: "Search the web for latest information.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query.",
        },
        n_results: {
          type: "integer",
          description: "Number of results, maximum is 10",
        },
        pull_images: {
          type: "boolean",
          description: "Whether to show images in the results. This will pull direct image URL from the Search API with it's associated context clues, use send_web_image to send the images to Discord UI.",
        }
      },
      required: ["query"],
    }
  },
  {
    type: "function",
    name: "send_web_image",
    description: "Sends images to Discord UI.",
    parameters: {
      type: "object",
      properties: {
        images: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "Image URL",
              },
              description: {
                type: "string",
                description: "Image description",
              },
            },
            required: ["url", "description"],
          },
          description: "List of images to send.",
        }
      },
      required: ["images"]
    }
  }
]

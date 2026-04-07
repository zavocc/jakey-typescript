export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for latest information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query.",
          }
        },
        required: ["query"],
      }
    },
  }
]
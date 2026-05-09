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
        }
      },
      required: ["query"],
    }
  }
]

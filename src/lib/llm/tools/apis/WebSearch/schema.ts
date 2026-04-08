export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "v_2.0AlphaTODO[Search the web for latest information. To target or precisely browse specific URL, use site: operator",
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
    }
  }
]
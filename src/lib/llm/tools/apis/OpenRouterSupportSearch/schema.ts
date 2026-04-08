export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "read_and_fetch_openrouter_docs_api_list_urls",
      description: "Fetches all the links for OpenRouter docs URL"
    }
  },
  {
    type: "function",
    function: {
      name: "read_openrouter_mdx_url",
      description: "Reads the OpenRouter docs, note that you must use read_and_fetch_openrouter_skills_url first to get the URL for the OpenRouter docs",
      parameters: {
        type: "object",
        properties: {
          mdxurl: {
            type: "string",
            description: "The URL of the OpenRouter doc to read.",
          }
        },
        required: ["mdxurl"],
      }
    }
  }
]
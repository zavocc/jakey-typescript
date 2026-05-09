import logger from "../../../../lib/pinoLogger.js";
import { getSendableChannel } from "../../functions.js";
import type { Message, SendableChannels } from "discord.js";

const childLogger = logger.child({ module: "llm.tools.apis.WebSearch" });

export async function web_search(discord_interaction: Message | undefined, params: { query: string, n_results?: number }): Promise<object> {
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);

  // if site: contains site:http:// or site:https://, exclude the protocol but without stripping the site: prefix
  if (params.query.startsWith("site:")) {
    params.query = params.query.replace(/^site:(http|https):\/\/?/, "site:");
  }

  if (params.n_results && params.n_results > 10) {
    params.n_results = 10;
  } else if (!params.n_results) {
    params.n_results = 5;
  }

  if (!process.env.TAVILY_API_KEY) {
    throw new Error("Web Search API key is not configured.");
  }

  let response;
  try {
    response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.TAVILY_API_KEY}`
      },
      body: JSON.stringify({
        query: params.query,
        search_depth: "advanced"
      })
    });
  } catch (error) {
    childLogger.error({ cause: error }, "An error occurred while fetching results from the Tavily Search API.");
    throw new Error("Failed to fetch results from the Web Search API.", { cause: error });
  }

  await messageChannel.send(`🔍 Searched for **${params.query}**`)

  const rawData = await response.json();

  // Check if rawData.results is defined and has the expected structure
  if (!rawData.results || !Array.isArray(rawData.results)) {
    throw new Error("No results found from the Web Search API.");
  }

  return {
    scores: "Utilize the score field to rank the relevance of the search results. A higher score indicates a more relevant result to the query. Use this score to prioritize which sources to reference in your response.",
    results: rawData.results
  };
}

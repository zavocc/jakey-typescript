import { getConfigJsonKey } from "../../../lib/configuratorJSON.js";
import { Message } from "discord.js";

export async function web_search(discord_interaction: Message, params: { query: string }): Promise<string> {
  const apiKey = await getConfigJsonKey("tools");
  if (!apiKey?.webSearchAPIKey) {
    throw new Error("Web Search API key is not configured.");
  }

  // Ignore discord_interaction for now
  discord_interaction;

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey.webSearchAPIKey}`
    },
    body: JSON.stringify({
      query: params.query,
      search_depth: "basic"
    })
  });

  const textualData = await response.text();
  return textualData;
}

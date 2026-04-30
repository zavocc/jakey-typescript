import { Message } from "discord.js";

export async function web_search(discord_interaction: Message, params: { query: string }): Promise<string> {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("Web Search API key is not configured.");
  }

  // Ignore discord_interaction for now
  if (discord_interaction) {
    //ignore
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.TAVILY_API_KEY}`
    },
    body: JSON.stringify({
      query: params.query,
      search_depth: "basic"
    })
  });

  const textualData = await response.text();
  return textualData;
}

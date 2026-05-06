import type { Message } from "discord.js";

export async function web_search(discord_interaction: Message | undefined, params: { query: string }): Promise<string> {
  void discord_interaction;

  if (!process.env.TAVILY_API_KEY) {
    throw new Error("Web Search API key is not configured.");
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

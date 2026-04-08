import { Message } from "discord.js";

export async function read_and_fetch_openrouter_docs_api_list_urls(discord_interaction: Message, params: { }): Promise<string> {
  // Ignore discord_interaction for now
  discord_interaction;
  params;

  const response = await fetch("https://openrouter.ai/docs/llms.txt", {method: "GET"});

  const textualData = await response.text();
  return textualData;
}

export async function read_openrouter_mdx_url(discord_interaction: Message, params: { mdxurl: string }): Promise<string> {
  // Ignore discord_interaction for now
  discord_interaction;

  // Check if mdxurl is a valid URL https://openrouter.ai/docs
  if (!params.mdxurl.startsWith("https://openrouter.ai/docs")) {
    throw new Error("Invalid URL. Only URLs starting with https://openrouter.ai/docs are allowed.");
  }

  const response = await fetch(params.mdxurl, {method: "GET"});

  const textualData = await response.text();
  return textualData;
}

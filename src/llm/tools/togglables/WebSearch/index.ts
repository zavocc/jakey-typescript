import { createModuleLogger } from "../../../../lib/pinoLogger.js";
import { getSendableChannel } from "../../functions.js";
import { EmbedBuilder, type Message, type SendableChannels } from "discord.js";

const childLogger = createModuleLogger(import.meta.url);

export const TOOL_HUMAN_NAME = "Web Search"
export const TOOL_SCHEMAS = [
  {
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
  },
  // This function doesn't exist, to test function doesn't exist error
  {
    name: "web_dialer",
    description: "Call Phone",
    parameters: {
      type: "object",
      properties: {
        num: {
          type: "string",
          description: "Phone number to dial",
        }
      },
    }
  }
]


type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

type TavilySearchResponse = {
  results: TavilySearchResult[];
  images?: Array<{ url: string; description: string }>;
};

export async function web_search(discord_interaction: Message | undefined, params: { query: string, n_results?: number, pull_images?: boolean }): Promise<object> {
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
        search_depth: "basic",
        max_results: params.n_results,
        include_images: params.pull_images ?? false,
        include_image_descriptions: params.pull_images ?? false
      })
    });
  } catch (error) {
    childLogger.error({ cause: error }, "An error occurred while fetching results from the Tavily Search API.");
    throw new Error("Failed to fetch results from the Web Search API.", { cause: error });
  }

  await messageChannel.send(`🔍 Searched for **${params.query}**`)

  const rawData: TavilySearchResponse = await response.json();

  // Check if rawData.results is defined and has the expected structure
  if (!rawData.results || !Array.isArray(rawData.results)) {
    throw new Error("No results found from the Web Search API.");
  }

  // get title and url for supportable citations
  const supportable_sources = rawData.results.map((result) => ({
    title: result.title,
    url: result.url,
  }));

  return {
    scores: "Utilize the score field to rank the relevance of the search results. A higher score indicates a more relevant result to the query. Use this score to prioritize which sources to reference in your response.",
    images: rawData.images ?? [],
    results: rawData.results,
    supportable_sources: supportable_sources,
  };
}

export async function send_web_image(discord_interaction: Message | undefined, params: { images: Array<{ url: string, description: string }> }): Promise<string> {
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);

  const imageEmbeds = []
  let imageCount = 0

  // build upto 10 image embeds
  for (const image of params.images) {
    if (imageCount >= 10) break;
    const Embed =new EmbedBuilder()
      .setTitle(image.description)
      .setDescription(image.url)
      .setImage(image.url);
    imageEmbeds.push(Embed);
    imageCount++;
  }

  await messageChannel.send({ embeds: imageEmbeds });

  return "Images sent"
}

import logger from "../../../../lib/pinoLogger.js";
import { getSendableChannel } from "../../functions.js";
import { type Message, type SendableChannels } from "discord.js";
import { GoogleClient } from "../../../../lib/genAIClients.js";
import { createUserContent, createPartFromUri } from "@google/genai";

const childLogger = logger.child({ module: "llm.tools.apis.GenMedia" });

export async function generate_image(discord_interaction: Message | undefined,
  params: {
    prompt: string,
    url_context: Array<{ url: string, mimetype: string }>,
    use_search?: boolean,
    thinking_effort?: "minimal" | "high"
  }): Promise<object> {
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);

  const urlPromptsPart = [];
  const finalConstructedPrompt = [];
  const discordMessagesMultiPart: Array<{ imageUrl: string, mimeType: string | null }> = [];

  // Check if we have URL contexts
  if (params.url_context && params.url_context.length > 0) {
    for (const url of params.url_context) {
      urlPromptsPart.push(createPartFromUri(url.url, url.mimetype));
    }

    // Check if we have URL contexts
    if (urlPromptsPart.length === 0) throw new Error("No valid images are added");

    // Construct the final prompt
    finalConstructedPrompt.push(createUserContent(urlPromptsPart));
  }

  finalConstructedPrompt.push(createUserContent(params.prompt));

  // Additional parameters
  const additionalParams: Record<string, unknown> = {
    responseModalities: ['IMAGE'],
    imageSize: "512"
  };
  if (params.thinking_effort) additionalParams.thinkingConfig = {
    thinkingLevel: params.thinking_effort
  };
  if (params.use_search) additionalParams.tools = [
    {
      googleSearch: {
        searchTypes: {
          webSearch: {},
          imageSearch: {}
        }
      }
    }
  ]

  // Generate images
  const generatedImages = await GoogleClient.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: finalConstructedPrompt,
    config: additionalParams
  })

  // Check if it generated images
  if (!generatedImages.candidates?.[0] || !generatedImages.candidates[0].content?.parts || generatedImages.candidates[0].content.parts.length === 0) throw new Error("No images generated, please try again later...");
  const parts = generatedImages.candidates[0].content.parts;

  // Output interstitial if it used GoogleSearch
  if (generatedImages.candidates[0].groundingMetadata) {
    await messageChannel.send(`-# > Used: Google Search with Image Grounding`)
  }

  // Send each outputs
  for (const cntntparts of parts) {
    if (cntntparts.inlineData) {
      const imageData = cntntparts.inlineData.data;
      if (!imageData) continue;

      const buffer = Buffer.from(imageData, 'base64');

      // Send to discord
      const sentMessage = await messageChannel.send({
        files: [
          {
            attachment: buffer,
            name: `generatedimage-${Date.now()}.png`,
            description: params.prompt
          }
        ]
      });

      // Append the message URL
      sentMessage.attachments.map((image) => discordMessagesMultiPart.push({
        imageUrl: image.url,
        mimeType: image.contentType,
      }))
    }
  }

  childLogger.debug({ generatedImageLinks: discordMessagesMultiPart }, "Generate images");

  return {
    notice: "These generated image links will expire in 24 hours outside Discord that is valid to be used for multi-turn edits",
    refining_images: "You can use these image links to edit if the user noticed something wrong with the image. Note that for editing these generated images you must also include temporary access tokens given from the URL as Discord no longer serves files to public without it",
    displaying_images: "No need to send URLs, the tool already sends the generated images directly to Discord",
    generated_images: discordMessagesMultiPart
  }
}

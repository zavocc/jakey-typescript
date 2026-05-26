import type { SendableChannels } from "discord.js";
export async function sendChunkedMessage(
  messageChannel: SendableChannels,
  text: string,
  chunkSize = 2000,
): Promise<void> {
  if (!text.length) return;

  for (let i = 0; i < text.length; i += chunkSize) {
    await messageChannel.send(text.slice(i, i + chunkSize));
  }
}

import { Message, SendableChannels } from "discord.js";
import { getSendableChannel } from "../../functions";

export const FILE_WRITE_TOOL_SCHEMA = 
  {
    type: "function",
    function: {
      name: "file_write",
      description: "Tool to write content as a downloadable Discord artifact.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The content to write to the file.",
          },
          filename: {
            type: "string",
            description: "The filename for the written file, including extension (e.g., output.txt).",
          }
        },
        required: ["content", "filename"],
      }
  },
}

export async function file_write(discord_interaction: Message, params: { content: string; filename: string }): Promise<string> {
  // Narrow to a channel type that is allowed to send messages
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);
  
  // send as a file attachment
  const buffer = Buffer.from(params.content, "utf-8");
  await messageChannel.send({
    content: `Here is the file you requested: **${params.filename}**`,
    files: [{ attachment: buffer, name: params.filename }],
  });

  return `File "${params.filename}" has been sent.`;

}
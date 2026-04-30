import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  MessageFlags,
} from "discord.js";
import { tts_completion } from "../../../lib/llm/generateContent.js";
import { GEMINI_TEXT_TO_SPEECH_SYSTEM_PROMPT } from "../../../data/sysprompts.js";

export default {
  data: new ContextMenuCommandBuilder()
    .setName("Speak this message")
    .setType(ApplicationCommandType.Message),

  async execute(interaction: MessageContextMenuCommandInteraction) {
    const targetMessage = interaction.targetMessage;

    // Defer
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Check if targetMessage has no text
    if (!targetMessage.content) {
      await interaction.editReply({
        content: "This message has no text content to speak.",
      });
      return;
    }

    // Generate speech
    const prompt = `
    ${GEMINI_TEXT_TO_SPEECH_SYSTEM_PROMPT}
    
    ## Message content:
    ${targetMessage.content}
    `
    const audioBuffer = await tts_completion(prompt);

    await interaction.editReply({
      files: [
        {
          attachment: audioBuffer,
          name: "output.wav",
          description: "Audio generated from the message content"
        }
      ]
    });
  },
};

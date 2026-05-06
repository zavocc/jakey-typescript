import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  MessageFlags,
} from "discord.js";
import { GEMINI_TEXT_TO_SPEECH_SYSTEM_PROMPT } from "../../../data/sysprompts.js";
import { GoogleClient } from "../../../lib/genAIClients.js";
import WaveFile from "wavefile";

export default {
  data: new ContextMenuCommandBuilder()
    .setName("Speak this message")
    .setType(ApplicationCommandType.Message),

  async execute(interaction: MessageContextMenuCommandInteraction) {
    const targetMessage = interaction.targetMessage;

    // Defer
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Check if targetMessage has no text
    if (!targetMessage.content || targetMessage.content.length === 0) {
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

    const audioResult = await GoogleClient.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Iapetus'
            }
          }
        }
      }
    });

    // Get audio data
    const audioRawData = audioResult.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioRawData) {
      throw new Error('No audio data received from the model.');
    }

    const pcmBuffer = Buffer.from(audioRawData, 'base64');
    if (pcmBuffer.length % 2 !== 0) {
      throw new Error('Received invalid 16-bit PCM audio data.');
    }

    const samples = new Int16Array(pcmBuffer.length / 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = pcmBuffer.readInt16LE(i * 2);
    }

    const wav = new WaveFile.WaveFile();
    wav.fromScratch(1, 24000, '16', samples);

    const audioBuffer = Buffer.from(wav.toBuffer());

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

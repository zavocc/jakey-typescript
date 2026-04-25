import { getSendableChannel } from "../../functions";
import { Message, SendableChannels } from "discord.js";
import { GoogleClient } from "../../../lib/llm/providerClients";
import { WaveFile } from "wavefile";

export const TEXT_TO_SPEECH_TOOL_SCHEMA =
{
  type: "function",
  name: "text_to_speech",
  description: "Send message as a speech form",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text to be spoken, use the format [audio tags] in natural language to steer the voice emotions, pace, and style like cough, laughter, anger, etc. You can use but not limited to [shouts], [excitedly], etc.",
      },
      system_instructions: {
        type: "string",
        description: "Additional system instructions to steer the voice. You can specify the voice style, emotion, pace, etc. For example, you can specify 'speak like a pirate' or 'speak in a happy tone'. This is optional and can be left empty if not needed.",
      }
    },
  }
}

export async function text_to_speech(discord_interaction: Message, params: { text: string; system_instructions?: string }): Promise<string> {
  // We just send image of banana
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);

  // Run
  const prompt = `
  ## Style Instructions:
  ${params.system_instructions ?? "No additional style instructions."}

  ## Transcript:
  ${params.text}
  `
  const results = await GoogleClient.models.generateContent({
    model: "models/gemini-3.1-flash-tts-preview",
    contents: prompt,
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
  })
 
  if (!results.candidates || results.candidates.length === 0) {
    throw new Error("No output received from the model.");
  }

  // Send wav file to discord
  const audioData = results.candidates[0].content?.parts?.[0]?.inlineData?.data;
  const wav = new WaveFile();
  wav.fromScratch(1, 24000, '16', Buffer.from(audioData!, 'base64'));
  const audioBuffer = Buffer.from(wav.toBuffer());

  await messageChannel.send({
    files: [{
      attachment: audioBuffer,
      name: 'output.wav',
      description: 'Generated speech audio'
    }]
  });

  return "Text has been converted to speech and sent as an audio file.";

}
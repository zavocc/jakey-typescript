import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { api_keys } from '../../../config.json';

const openrouter = createOpenRouter({
  apiKey: api_keys.openrouter,
});

export async function completion(
    prompt: string,
    systemMessage?: string,
) {
    const { text } = await generateText({
        model: openrouter.chat('google/gemini-2.0-flash-001'),
        prompt: prompt,
        system: systemMessage,
    });

    return text;
}

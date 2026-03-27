// context
import { loadContext, saveContext } from './contextMemory';

import { api_keys } from '../../../config.json';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, type ModelMessage } from 'ai';

const openrouter = createOpenRouter({
  apiKey: api_keys.openrouter,
});

export async function completion(
    prompt: string,
    discord_user_id: string,
    systemMessage?: string,
) {
    // check if /src/harbour/{user_id}.json exists
    const context: ModelMessage[] = await loadContext(discord_user_id);

    // Construct a prompt
    const latestPromptTurn: ModelMessage = {
        role: 'user',
        content: prompt
    };

    // Append the latest prompt to the context
    context.push(latestPromptTurn);

    const outputs = await generateText({
        model: openrouter.chat('google/gemini-2.0-flash-001'),
        messages: context,
        system: systemMessage,
        temperature: 1
    });

    // Append the assistant's response to the context
    // TODO: NOT FINAL, we extract the content turn from outputs object, not implement it ourselves
    context.push({
        role: 'assistant',
        content: outputs.text,
    });

    // save the updated context
    await saveContext(discord_user_id, context);

    // return the assistant's response
    return outputs.text;
}

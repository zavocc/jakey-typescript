// context
import { loadContext, saveContext } from './contextMemory';

import { api_keys } from '../../../config.json';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, type ModelMessage } from 'ai';

// DEBUG
import { mkdir, writeFile } from 'fs/promises';

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
        content: prompt,
    };

    // Append the latest prompt to the context
    context.push(latestPromptTurn);

    const outputs = await generateText({
        model: openrouter.chat('gemini-2.5-flash'),
        messages: context,
        system: systemMessage,
        temperature: 1,
    });

    // Log possible outputs
    const debugDir = `${__dirname}/../../../harbour/debug`;
    await mkdir(debugDir, { recursive: true });
    await writeFile(`${debugDir}/${discord_user_id}.json`, JSON.stringify(outputs, null, 2));

    // Append the assistant's response to the context
    context.push(...outputs.response.messages);

    // save the updated context
    await saveContext(discord_user_id, context);

    // return the assistant's response
    return outputs.text;
}

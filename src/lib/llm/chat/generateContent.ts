// context
import { loadContext, saveContext } from './contextMemory';

import { api_keys } from '../../../config.json';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, type ModelMessage } from 'ai';
import { JAKEY_SYSTEM_PROMPT } from '../../../data/sysprompts';

// DEBUG
import { mkdir, writeFile } from 'fs/promises';

const openrouter = createOpenRouter({
  apiKey: api_keys.openrouter,
});

export async function completion(
    prompt: string,
    discord_user_id: string,
    attachment_urls?: string[],
): Promise<string> {
    // check if /src/harbour/{user_id}.json exists
    const context: ModelMessage[] = await loadContext(discord_user_id);

    // Construct a prompt
    let constructedContent = [];

    // Check if we have image attachments
    if (attachment_urls && attachment_urls.length > 0) {
        // map
        const attachmentMessages = attachment_urls.map(url => (
            {
                type: "image",
                image: url,
            }
        ));
        constructedContent.push(...attachmentMessages);
    }

    // Append the user's text prompt
    constructedContent.push({
        type: "text",
        text: prompt,
    });

    const constructedPrompt: ModelMessage = {
        role: 'user',
        content: constructedContent,
    };

    // Append the latest prompt to the context
    context.push(constructedPrompt);

    const outputs = await generateText({
        model: openrouter.chat('google/gemini-2.5-flash', {
            reasoning: {
                enabled: true,
                max_tokens: 4000
            }
        }),
        messages: context,
        system: JAKEY_SYSTEM_PROMPT,
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

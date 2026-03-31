// context
import { loadContext, saveContext } from './contextMemory';

// models
import type { ModelProps } from '../../../types/schemas';
import { models } from '../../../models.json';

import { api_keys } from '../../../config.json';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, type ImagePart, type ModelMessage, type TextPart, type UserModelMessage } from 'ai';
import { JAKEY_SYSTEM_PROMPT } from '../../../data/sysprompts';

// DEBUG
import { mkdir, writeFile } from 'fs/promises';

const openrouter = createOpenRouter({
    apiKey: api_keys.openrouter,
});

type DiscordCompletionResponse = {
    text: string;
    model_used: string;
};

export async function completion(
    prompt: string,
    discord_user_id: string,
    attachment_urls?: string[],
): Promise<DiscordCompletionResponse> {
    // check if /src/harbour/{user_id}.json exists
    const context: ModelMessage[] = await loadContext(discord_user_id);

    // Parse model properties from the JSON file
    // Only choose 1 for now, validation later
    const modelProps: ModelProps = models[0];

    // Construct a prompt
    const constructedContent: Array<ImagePart | TextPart> = [];

    // Check if we have image attachments and is enabled
    if (attachment_urls && attachment_urls.length > 0) {
        // throw an error if the model doesn't support files
        if (!modelProps.enable_files) {
            throw new Error(`The model **${modelProps.model_friendly_name}** does not support file attachments.`);
        }

        const attachmentMessages: ImagePart[] = attachment_urls.map((url): ImagePart => ({
            type: 'image',
            image: url,
        }));
        constructedContent.push(...attachmentMessages);
    }

    // Append the user's text prompt
    constructedContent.push({
        type: 'text',
        text: prompt,
    });

    const constructedPrompt: UserModelMessage = {
        role: 'user',
        content: constructedContent,
    };

    // Append the latest prompt to the context
    context.push(constructedPrompt);

    const outputs = await generateText({
        model: openrouter.chat(modelProps.model_id, {
            reasoning: {
                enabled: true,
                max_tokens: 16000,
            },
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

    // return the assistant's response and model information
    return {
        text: outputs.text,
        model_used: outputs.response.modelId,
    };
}

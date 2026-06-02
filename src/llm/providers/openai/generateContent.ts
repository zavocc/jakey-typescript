import { createModuleLogger } from '../../../lib/pinoLogger.js';
import { OpenAIClient } from '../../../lib/genAIClients.js';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from 'openai/resources';

const childLogger = createModuleLogger(import.meta.url);

export async function text_chat_completion(
  model: string,
  context: Array<ChatCompletionMessageParam>,
  optional_params?: Omit<ChatCompletionCreateParamsNonStreaming, 'messages' | 'model'>
): Promise<{
  modelResponse: ChatCompletion,
  model_used: string,
}> {
  const modelResult = await OpenAIClient.chat.completions.create({
    ...optional_params ?? {},
    model: model,
    messages: context,
    stream: false,
    temperature: undefined,
    top_p: undefined
  })

  // We cannot receive null output so we throw if it is null
  if (!modelResult) {
    throw new Error('No output received from the model.');
  }

  // Debug logs
  if (modelResult.usage) childLogger.debug({
    prompt: context.at(-1),
    promptTokenCount: modelResult.usage.prompt_tokens,
    completionTokenCount: modelResult.usage.completion_tokens,
    totalTokenCount: modelResult.usage.total_tokens,
    completionTokenDetails: modelResult.usage.completion_tokens_details,
    responseChoices: modelResult.choices,
  }, "Generated content chat");


  return {
    modelResponse: modelResult,
    model_used: modelResult.model ?? "Not specified",
  };
}

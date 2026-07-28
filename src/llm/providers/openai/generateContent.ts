import { createModuleLogger } from '../../../lib/pinoLogger.js';
import { OpenAIClient } from '../../../lib/genAIClients.js';
import type { Response, ResponseCreateParamsNonStreaming, ResponseInput } from 'openai/resources/responses/responses';

const childLogger = createModuleLogger(import.meta.url);

export async function text_chat_completion(
  model: string,
  context: ResponseInput,
  optional_params?: Omit<ResponseCreateParamsNonStreaming, 'conversation' | 'input' | 'model' | 'previous_response_id' | 'store' | 'stream' | 'temperature'>): Promise<{
  modelResponse: Response,  
  model_used: string,
}> {
  const modelResult = await OpenAIClient.responses.create({
    ...optional_params ?? {},
    model: model,
    input: context,
    conversation: undefined,
    previous_response_id: undefined,
    stream: false,
    store: false,
    temperature: 1
  })

  // We cannot receive null output so we throw if it is null
  if (!modelResult) {
    throw new Error('No output received from the model.');
  }

  // Debug logs
  if (modelResult.usage) childLogger.debug({
    prompt: context.at(-1),
    promptTokenCount: modelResult.usage.input_tokens,
    completionTokenCount: modelResult.usage.output_tokens,
    totalTokenCount: modelResult.usage.total_tokens,
    completionTokenDetails: modelResult.usage.output_tokens_details
  }, "Generated content chat");


  return {
    modelResponse: modelResult,
    model_used: modelResult.model ?? "Not specified",
  };
}

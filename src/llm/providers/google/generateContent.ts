import logger from '../../../lib/pinoLogger.js';
import { GoogleClient } from '../../../lib/genAIClients.js';
import type { Interactions } from '@google/genai';

const childLogger = logger.child({ module: 'llm.generateContentChat' });

export async function text_chat_completion(
  model: string,
  prompt: string | Interactions.Content[] | Interactions.FunctionResultStep[],
  optional_params?: {
    system_prompt?: string,
    additional_properties?: Record<string, unknown>,
  },
): Promise<{
  modelSteps: Interactions.Step[],
  model_used: string,
  interactionID: string
}> {
  // Parse optional params
  const { system_prompt, additional_properties } = optional_params ?? {};

  let additionalParams;
  // Pass additional params if existed
  if (additional_properties) {
    additionalParams = additional_properties;
  }

  const interactionsResult = await GoogleClient.interactions.create({
    ...additionalParams,
    model: model,
    input: prompt,
    stream: false,
    system_instruction: system_prompt,
  })

  // We cannot receive null output so we throw if it is null
  if (!interactionsResult.steps) {
    throw new Error('No output received from the model.');
  }

  // Debug logs
  if (interactionsResult.usage) childLogger.debug({
    prompt: prompt,
    totalInputtokenCnt: interactionsResult.usage.total_input_tokens,
    totalOutputtokenCnt: interactionsResult.usage.total_output_tokens,
    totalThinktokenCnt: interactionsResult.usage.total_thought_tokens,
    totalCachedtokenCnt: interactionsResult.usage.total_cached_tokens,
    totalTooltokenCnt: interactionsResult.usage.total_tool_use_tokens,
    totalTokens: interactionsResult.usage.total_tokens,
    responsesSteps: interactionsResult.steps
  }, "Generated content chat");


  return {
    modelSteps: interactionsResult.steps,
    model_used: interactionsResult.model ?? "Not specified",
    interactionID: interactionsResult.id
  };
}

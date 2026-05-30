import logger from '../../../lib/pinoLogger.js';
import { GoogleClient } from '../../../lib/genAIClients.js';
import type { GenerateContentConfig, GenerateContentResponse, Part } from '@google/genai';

const childLogger = logger.child({ module: 'llm.providers.google.generateContent' });

export async function text_chat_completion(
  model: string,
  context: Array<{parts: Part[], role: string}>,
  optional_params?: {
    system_prompt?: string,
    additional_properties?: GenerateContentConfig,
  },
): Promise<{
  modelResponse: GenerateContentResponse,
  model_used: string,
}> {
  // Parse optional params
  const { system_prompt, additional_properties } = optional_params ?? {};


  const modelResult = await GoogleClient.models.generateContent({
    model: model,
    contents: context,
    config: {
      ...additional_properties,
      systemInstruction: system_prompt,
      temperature: undefined,
      topP: undefined,
      topK: undefined
    }
  })

  // We cannot receive null output so we throw if it is null
  if (!modelResult) {
    throw new Error('No output received from the model.');
  }

  // Debug logs
  if (modelResult.usageMetadata) childLogger.debug({
    prompt: context.at(-1),
    promptTokenCount: modelResult.usageMetadata.promptTokenCount,
    totalTokenCount: modelResult.usageMetadata.totalTokenCount,
    thoughtsTokenCount: modelResult.usageMetadata.thoughtsTokenCount,
    totalCachedtokenCnt: modelResult.usageMetadata.cachedContentTokenCount,
    candidateOutputTokenCnt: modelResult.usageMetadata.candidatesTokenCount,
    responseCandidates: modelResult.candidates,
  }, "Generated content chat");


  return {
    modelResponse: modelResult,
    model_used: modelResult.modelVersion ?? "Not specified",
  };
}

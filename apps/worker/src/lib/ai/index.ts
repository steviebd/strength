import { createAiGateway } from 'ai-gateway-provider';
import { createUnified } from 'ai-gateway-provider/providers/unified';

function normalizeAiModelName(modelName: string): string {
  if (modelName.startsWith('@cf/')) {
    return `workers-ai/${modelName}`;
  }
  return modelName;
}

const aigateway = createAiGateway({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  gateway: process.env.AI_GATEWAY_NAME!,
  apiKey: process.env.CF_AI_GATEWAY_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN,
});

const unified = createUnified();

export const model = aigateway(
  unified(
    normalizeAiModelName(
      process.env.AI_MODEL_NAME ?? 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    ),
  ),
);

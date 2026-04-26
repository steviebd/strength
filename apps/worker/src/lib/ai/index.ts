import { createAiGateway } from 'ai-gateway-provider';
import { createUnified } from 'ai-gateway-provider/providers/unified';
import { resolveWorkerEnv, type WorkerEnv } from '../../auth';

function normalizeAiModelName(modelName: string): string {
  if (modelName.startsWith('@cf/')) {
    return `workers-ai/${modelName}`;
  }
  return modelName;
}

function getRequiredEnv(env: WorkerEnv, name: keyof WorkerEnv): string {
  const value = env[name];
  if (!value || typeof value !== 'string') {
    throw new Error(`[ai] Missing required environment variable: ${name}`);
  }
  return value;
}

function getAiGatewayApiKey(env: WorkerEnv): string {
  const apiKey = env.CF_AI_GATEWAY_TOKEN ?? env.CLOUDFLARE_API_TOKEN;

  if (!apiKey) {
    throw new Error(
      '[ai] Missing AI Gateway credentials. Set CF_AI_GATEWAY_TOKEN for an authenticated gateway, or CLOUDFLARE_API_TOKEN if you are intentionally using an account token.',
    );
  }

  return apiKey;
}

const unified = createUnified();

export function getModel(env: WorkerEnv) {
  const resolvedEnv = resolveWorkerEnv(env);
  const aigateway = createAiGateway({
    accountId: getRequiredEnv(resolvedEnv, 'CLOUDFLARE_ACCOUNT_ID'),
    gateway: getRequiredEnv(resolvedEnv, 'AI_GATEWAY_NAME'),
    apiKey: getAiGatewayApiKey(resolvedEnv),
  });

  const modelName = resolvedEnv.AI_MODEL_NAME;
  if (!modelName) {
    throw new Error('[ai] Missing required environment variable: AI_MODEL_NAME');
  }

  return aigateway(unified(normalizeAiModelName(modelName)));
}

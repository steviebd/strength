export interface Secrets {
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  EXPO_PUBLIC_API_URL: string;
  DATABASE_URL?: string;
}

interface InfisicalSecret {
  secretName: string;
  secretValue: string;
}

let cachedSecrets: Secrets | null = null;

export async function getSecrets(): Promise<Secrets> {
  if (cachedSecrets) return cachedSecrets;
  
  const token = process.env.INFISICAL_TOKEN;
  const workspaceId = process.env.INFISICAL_WORKSPACE_ID || 'c6b80f33-12fb-46f1-9c0f-78b07b810743';
  const environment = process.env.INFISICAL_ENVIRONMENT || 'dev';
  
  if (!token) {
    throw new Error('INFISICAL_TOKEN is required');
  }
  
  const response = await fetch(
    `https://api.infisical.com/v3/secrets?workspaceId=${workspaceId}&environment=${environment}&includeImports=false`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch secrets: ${response.statusText}`);
  }
  
  const data = await response.json() as { secrets: InfisicalSecret[] };
  
  cachedSecrets = {
    BETTER_AUTH_SECRET: data.secrets.find(s => s.secretName === 'BETTER_AUTH_SECRET')?.secretValue || '',
    GOOGLE_CLIENT_ID: data.secrets.find(s => s.secretName === 'GOOGLE_CLIENT_ID')?.secretValue || '',
    GOOGLE_CLIENT_SECRET: data.secrets.find(s => s.secretName === 'GOOGLE_CLIENT_SECRET')?.secretValue || '',
    EXPO_PUBLIC_API_URL: data.secrets.find(s => s.secretName === 'EXPO_PUBLIC_API_URL')?.secretValue || '',
    DATABASE_URL: data.secrets.find(s => s.secretName === 'DATABASE_URL')?.secretValue,
  };
  
  return cachedSecrets;
}

export function clearSecretsCache(): void {
  cachedSecrets = null;
}

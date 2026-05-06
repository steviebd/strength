import { env } from '@/lib/env';

export function buildPasswordResetRedirectURL() {
  return `${env.apiUrl}/auth/reset-password`;
}

export async function requestPasswordResetEmail(email: string) {
  const response = await fetch(`${env.apiUrl}/api/auth/request-password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      redirectTo: buildPasswordResetRedirectURL(),
    }),
  });

  const data = (await response.json().catch(() => null)) as {
    message?: string;
    code?: string;
  } | null;

  if (!response.ok) {
    throw new Error(data?.message ?? 'Unable to send reset email.');
  }

  return data;
}

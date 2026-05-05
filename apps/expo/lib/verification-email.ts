import { env } from '@/lib/env';

export function buildVerifyEmailRedirectURL() {
  return `${env.apiUrl}/auth/verify-email`;
}

export async function sendVerificationEmailRequest(email: string) {
  const response = await fetch(`${env.apiUrl}/api/auth/send-verification-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      callbackURL: buildVerifyEmailRedirectURL(),
    }),
  });

  const data = (await response.json().catch(() => null)) as {
    message?: string;
    code?: string;
  } | null;

  if (!response.ok) {
    throw new Error(data?.message ?? 'Unable to send verification email.');
  }

  return data;
}

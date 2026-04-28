import { authClient } from '@/lib/auth-client';

const SESSION_READY_TIMEOUT_MS = 5000;
const SESSION_READY_POLL_INTERVAL_MS = 200;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForSessionReady(timeoutMs = SESSION_READY_TIMEOUT_MS) {
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt++;
    try {
      const { data: session } = await authClient.getSession();
      if (session) return session;
    } catch {}

    await sleep(SESSION_READY_POLL_INTERVAL_MS);
  }

  return false;
}

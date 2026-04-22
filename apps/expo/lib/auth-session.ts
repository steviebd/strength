import { authClient } from '@/lib/auth-client';

const SESSION_READY_TIMEOUT_MS = 3000;
const SESSION_READY_POLL_INTERVAL_MS = 100;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForSessionReady(timeoutMs = SESSION_READY_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const session = await authClient.getSession();

    if (session.data) {
      return true;
    }

    await sleep(SESSION_READY_POLL_INTERVAL_MS);
  }

  return false;
}

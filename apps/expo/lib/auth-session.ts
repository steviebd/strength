import { authClient, debugAuthState } from '@/lib/auth-client';

const SESSION_READY_TIMEOUT_MS = 3000;
const SESSION_READY_POLL_INTERVAL_MS = 100;

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
      console.log(`[Auth Debug] waitForSessionReady attempt ${attempt}`);
      debugAuthState();
      const session = await authClient.getSession();
      console.log(`[Auth Debug] getSession result:`, JSON.stringify(session));

      if (session.data) {
        return true;
      }
    } catch (error) {
      console.log(`[Auth Debug] getSession error:`, error);
      return false;
    }

    await sleep(SESSION_READY_POLL_INTERVAL_MS);
  }

  return false;
}

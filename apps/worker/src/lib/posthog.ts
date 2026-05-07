export async function captureEvent(
  env: { POSTHOG_API_KEY: string; POSTHOG_PROJECT_URL: string },
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const url = `${env.POSTHOG_PROJECT_URL.replace(/\/$/, '')}/capture/`;
  const body = {
    api_key: env.POSTHOG_API_KEY,
    event,
    properties: {
      distinct_id: distinctId,
      $lib: 'strength-worker',
      ...properties,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Silently fail — analytics should not break the API
  }
}

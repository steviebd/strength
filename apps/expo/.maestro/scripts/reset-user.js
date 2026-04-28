const baseUrl = maestro.env.WORKER_BASE_URL;
const secret = maestro.env.E2E_TEST_SECRET;
const email = maestro.env.E2E_EMAIL;

if (!baseUrl || !secret || !email) {
  throw new Error('WORKER_BASE_URL, E2E_TEST_SECRET, and E2E_EMAIL are required');
}

const response = http.post(`${baseUrl}/api/e2e/reset-user`, {
  headers: {
    'content-type': 'application/json',
    'x-e2e-secret': secret,
  },
  body: JSON.stringify({ email }),
});

if (response.status !== 200) {
  throw new Error(`E2E reset failed: ${response.status} ${response.body}`);
}

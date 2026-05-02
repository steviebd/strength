const baseUrl = WORKER_BASE_URL;
const secret = E2E_TEST_SECRET;
const email = E2E_EMAIL;
const password = E2E_PASSWORD;

if (!baseUrl || !secret || !email || !password) {
  throw new Error('WORKER_BASE_URL, E2E_TEST_SECRET, E2E_EMAIL, and E2E_PASSWORD are required');
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

const resetResult = JSON.parse(response.body);
if (resetResult.deleted === false) {
  const signupResponse = http.post(`${baseUrl}/api/auth/sign-up/email`, {
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'E2E User',
      email,
      password,
    }),
  });

  if (signupResponse.status < 200 || signupResponse.status >= 300) {
    throw new Error(`E2E signup failed: ${signupResponse.status} ${signupResponse.body}`);
  }
}

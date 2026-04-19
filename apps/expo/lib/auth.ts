const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';

interface SignInResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  session: {
    token: string;
    expiresAt: number;
  };
}

interface ApiError {
  message: string;
  status: number;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = {
      message: (await response.json()).message || 'An error occurred',
      status: response.status,
    };
    throw error;
  }
  return response.json();
}

export const authClient = {
  async signIn(email: string, password: string): Promise<SignInResponse> {
    const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse<SignInResponse>(response);
  },

  async signUp(email: string, password: string, name?: string): Promise<SignInResponse> {
    const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    return handleResponse<SignInResponse>(response);
  },

  async signOut(): Promise<void> {
    const response = await fetch(`${API_URL}/api/auth/sign-out`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw await handleResponse<ApiError>(response);
    }
  },

  async getSession(token: string): Promise<SignInResponse['session'] | null> {
    try {
      const response = await fetch(`${API_URL}/api/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.session;
    } catch {
      return null;
    }
  },

  getGoogleAuthUrl(): string {
    return `${API_URL}/api/auth/sign-in/google`;
  },
};

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = 'auth_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEY);
    if (storedToken) {
      checkSession(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  async function checkSession(token: string) {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const data = await response.json();
    localStorage.setItem(STORAGE_KEY, data.session.token);
    setUser(data.user);
  }

  async function signUp(email: string, password: string, name?: string) {
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const data = await response.json();
    localStorage.setItem(STORAGE_KEY, data.session.token);
    setUser(data.user);
  }

  async function signOut() {
    const token = localStorage.getItem(STORAGE_KEY);
    if (token) {
      await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  function signInWithGoogle() {
    const url = `${process.env.EXPO_PUBLIC_API_URL}/api/auth/sign-in/google`;
    window.location.href = url;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut, signInWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

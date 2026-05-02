import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockGetNetworkStateAsync = vi.hoisted(() => vi.fn());
const mockAddNetworkStateListener = vi.hoisted(() => vi.fn());
const mockSetOnline = vi.hoisted(() => vi.fn());
const mockSignInEmail = vi.hoisted(() => vi.fn());
const mockSignUpEmail = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());
const mockUseSession = vi.hoisted(() => vi.fn((): { data: unknown } => ({ data: null })));
const mockWaitForSessionReady = vi.hoisted(() => vi.fn());
const mockReplace = vi.hoisted(() => vi.fn());
const mockStorageGetItem = vi.hoisted(() => vi.fn());
const mockStorageSetItem = vi.hoisted(() => vi.fn());
const mockStorageRemoveItem = vi.hoisted(() => vi.fn());

vi.mock('expo-network', () => ({
  getNetworkStateAsync: mockGetNetworkStateAsync,
  addNetworkStateListener: mockAddNetworkStateListener,
}));

vi.mock('@tanstack/react-query', () => ({
  onlineManager: {
    setOnline: mockSetOnline,
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: mockSignInEmail },
    signUp: { email: mockSignUpEmail },
    getSession: mockGetSession,
    useSession: mockUseSession,
  },
}));

vi.mock('@/lib/auth-session', () => ({
  waitForSessionReady: mockWaitForSessionReady,
}));

vi.mock('expo-router', () => ({
  router: {
    replace: mockReplace,
  },
}));

vi.mock('@/lib/platform-storage', () => ({
  platformStorage: {
    getItem: mockStorageGetItem,
    setItem: mockStorageSetItem,
    removeItem: mockStorageRemoveItem,
  },
}));

let stateIndex = 0;
const stateValues: unknown[] = [];
let refIndex = 0;
const refValues: { current: unknown }[] = [];
const effectCleanups: (() => void)[] = [];

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: <T>(initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] => {
      const idx = stateIndex++;
      if (stateValues[idx] === undefined) {
        stateValues[idx] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setter = (value: T | ((prev: T) => T)) => {
        stateValues[idx] =
          typeof value === 'function' ? (value as (prev: T) => T)(stateValues[idx] as T) : value;
      };
      return [stateValues[idx] as T, setter];
    },
    useEffect: (effect: () => void | (() => void), _deps?: unknown[]) => {
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        effectCleanups.push(cleanup);
      }
    },
    useRef: <T>(initial: T) => {
      const idx = refIndex++;
      if (refValues[idx] === undefined) {
        refValues[idx] = { current: initial };
      }
      return refValues[idx] as { current: T };
    },
  };
});

beforeEach(() => {
  stateIndex = 0;
  stateValues.length = 0;
  refIndex = 0;
  refValues.length = 0;
  effectCleanups.length = 0;
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ data: null });
});

describe('useNetworkStatus', () => {
  test('reads initial online state and sets online manager', async () => {
    mockGetNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      type: 'WIFI',
    });

    const { useNetworkStatus } = await import('./useNetworkStatus');
    const result = useNetworkStatus();

    expect(result.isOnline).toBe(true);
    expect(result.isOffline).toBe(false);
    expect(result.networkType).toBeNull();

    await Promise.resolve();
    expect(mockSetOnline).toHaveBeenCalledWith(true);
  });

  test('subscribes to network changes on mount', async () => {
    mockGetNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      type: 'WIFI',
    });
    const mockRemove = vi.fn();
    mockAddNetworkStateListener.mockReturnValue({ remove: mockRemove });

    const { useNetworkStatus } = await import('./useNetworkStatus');
    useNetworkStatus();

    expect(mockAddNetworkStateListener).toHaveBeenCalledTimes(1);
  });

  test('transitions to offline and updates online manager', async () => {
    mockGetNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      type: 'WIFI',
    });
    const mockRemove = vi.fn();
    mockAddNetworkStateListener.mockReturnValue({ remove: mockRemove });

    const { useNetworkStatus } = await import('./useNetworkStatus');
    useNetworkStatus();

    const listener = mockAddNetworkStateListener.mock.calls[0][0];
    listener({ isConnected: false, type: 'NONE' });

    expect(mockSetOnline).toHaveBeenCalledWith(false);
  });

  test('transitions back to online and updates online manager', async () => {
    mockGetNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      type: 'NONE',
    });
    const mockRemove = vi.fn();
    mockAddNetworkStateListener.mockReturnValue({ remove: mockRemove });

    const { useNetworkStatus } = await import('./useNetworkStatus');
    useNetworkStatus();

    const listener = mockAddNetworkStateListener.mock.calls[0][0];
    listener({ isConnected: true, type: 'CELLULAR' });

    expect(mockSetOnline).toHaveBeenCalledWith(true);
  });

  test('cleans up listener on unmount', async () => {
    mockGetNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      type: 'WIFI',
    });
    const mockRemove = vi.fn();
    mockAddNetworkStateListener.mockReturnValue({ remove: mockRemove });

    const { useNetworkStatus } = await import('./useNetworkStatus');
    useNetworkStatus();

    expect(effectCleanups.length).toBeGreaterThan(0);
    effectCleanups.forEach((cleanup) => cleanup());

    expect(mockRemove).toHaveBeenCalled();
  });

  test('retries pending sign-in when coming back online and clears key on success', async () => {
    stateValues[0] = false;
    stateValues[1] = null;

    mockGetNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      type: 'NONE',
    });
    const mockRemove = vi.fn();
    mockAddNetworkStateListener.mockReturnValue({ remove: mockRemove });

    mockStorageGetItem.mockImplementation((key: string) => {
      if (key === 'auth_pending_signin') {
        return JSON.stringify({
          email: 'test@example.com',
          password: 'secret123',
          timestamp: Date.now(),
        });
      }
      return null;
    });
    mockSignInEmail.mockResolvedValue({ error: null });
    mockWaitForSessionReady.mockResolvedValue({ user: { id: 'user-1' } });

    const { useNetworkStatus } = await import('./useNetworkStatus');
    useNetworkStatus();

    stateValues[0] = true;
    stateIndex = 0;
    refIndex = 0;
    useNetworkStatus();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockSignInEmail).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'secret123',
    });
    expect(mockWaitForSessionReady).toHaveBeenCalled();
    expect(mockStorageRemoveItem).toHaveBeenCalledWith('auth_pending_signin');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  test('does not auto-retry when already signed in', async () => {
    mockUseSession.mockReturnValue({ data: { user: { id: 'user-1' } } });

    stateValues[0] = false;
    stateValues[1] = null;

    mockGetNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      type: 'NONE',
    });
    const mockRemove = vi.fn();
    mockAddNetworkStateListener.mockReturnValue({ remove: mockRemove });

    mockStorageGetItem.mockImplementation((key: string) => {
      if (key === 'auth_pending_signin') {
        return JSON.stringify({
          email: 'test@example.com',
          password: 'secret123',
          timestamp: Date.now(),
        });
      }
      return null;
    });

    const { useNetworkStatus } = await import('./useNetworkStatus');
    useNetworkStatus();

    stateValues[0] = true;
    stateIndex = 0;
    refIndex = 0;
    useNetworkStatus();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockSignInEmail).not.toHaveBeenCalled();
    expect(mockStorageRemoveItem).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

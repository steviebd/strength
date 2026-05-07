import { beforeEach, describe, expect, test, vi } from 'vitest';

let stateIndex = 0;
const stateValues: unknown[] = [];
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
  };
});

const mockUseNetworkStatus = vi.hoisted(() => vi.fn(() => ({ isOffline: false })));
const mockUseSession = vi.hoisted(() => vi.fn(() => ({ data: null })));
const mockGetPendingSyncItemCount = vi.hoisted(() => vi.fn(() => Promise.resolve(0)));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

vi.mock('@/theme', () => ({
  colors: {
    surface: '#18181b',
    border: '#3f3f46',
    error: '#ef4444',
    warning: '#f59e0b',
  },
  radius: {
    md: 8,
  },
  spacing: {
    sm: 8,
  },
  typography: {
    fontSizes: {
      sm: 13,
    },
    fontWeights: {
      medium: '500',
    },
  },
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: mockUseNetworkStatus,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: mockUseSession,
  },
}));

vi.mock('@/db/sync-queue', () => ({
  getPendingSyncItemCount: mockGetPendingSyncItemCount,
}));

beforeEach(() => {
  stateIndex = 0;
  stateValues.length = 0;
  effectCleanups.length = 0;
  vi.clearAllMocks();
});

describe('OfflineBanner', () => {
  test('returns null when online and no pending items', async () => {
    mockUseNetworkStatus.mockReturnValue({ isOffline: false });
    mockUseSession.mockReturnValue({ data: { user: { id: 'user-1' } } } as any);
    mockGetPendingSyncItemCount.mockResolvedValue(0);

    const { OfflineBanner } = await import('./OfflineBanner');
    const result = OfflineBanner();

    expect(result).toBeNull();
  });

  test('shows red offline banner when offline', async () => {
    mockUseNetworkStatus.mockReturnValue({ isOffline: true });
    mockUseSession.mockReturnValue({ data: { user: { id: 'user-1' } } } as any);

    const { OfflineBanner } = await import('./OfflineBanner');
    const result = OfflineBanner()!;

    expect(result).not.toBeNull();
    expect(result.type).toBe('View');
    const text = result.props.children;
    expect(text.type).toBe('Text');
    expect(text.props.children).toBe("Offline — data will sync when you're back online");
    expect(text.props.style[1].color).toBe('#ef4444');
  });

  test('shows orange pending-sync banner when online with pending items', async () => {
    mockUseNetworkStatus.mockReturnValue({ isOffline: false });
    mockUseSession.mockReturnValue({ data: { user: { id: 'user-1' } } } as any);
    mockGetPendingSyncItemCount.mockResolvedValue(3);
    stateValues[0] = 3;

    const { OfflineBanner } = await import('./OfflineBanner');
    const result = OfflineBanner()!;

    expect(result).not.toBeNull();
    expect(result.type).toBe('View');
    const text = result.props.children;
    expect(text.type).toBe('Text');
    expect(text.props.children).toEqual([3, ' change(s) pending sync']);
    expect(text.props.style[1].color).toBe('#f59e0b');
  });

  test('fetches pending count every 5 seconds when userId exists', async () => {
    mockUseNetworkStatus.mockReturnValue({ isOffline: false });
    mockUseSession.mockReturnValue({ data: { user: { id: 'user-1' } } } as any);

    const { OfflineBanner } = await import('./OfflineBanner');
    OfflineBanner();

    expect(mockGetPendingSyncItemCount).toHaveBeenCalledWith('user-1');
    expect(effectCleanups.length).toBeGreaterThan(0);
  });

  test('does not fetch count when no userId', async () => {
    mockUseNetworkStatus.mockReturnValue({ isOffline: false });
    mockUseSession.mockReturnValue({ data: null });

    const { OfflineBanner } = await import('./OfflineBanner');
    OfflineBanner();

    expect(mockGetPendingSyncItemCount).not.toHaveBeenCalled();
  });
});

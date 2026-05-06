import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockIonicons = vi.hoisted(() => vi.fn(() => null));

vi.mock('@expo/vector-icons/Ionicons', () => ({
  __esModule: true,
  default: mockIonicons,
}));

vi.mock('react-native', () => ({
  View: 'View',
}));

vi.mock('@/theme', () => ({
  colors: {
    error: '#ef4444',
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TabIconWithBadge', () => {
  test('renders icon without badge when hasBadge is false', async () => {
    const { TabIconWithBadge } = await import('./TabIconWithBadge');
    const result = TabIconWithBadge({
      icon: { active: 'home', inactive: 'home-outline' },
      hasBadge: false,
      color: '#ffffff',
      focused: true,
    });

    expect(result.type).toBe('View');
    const children = result.props.children;
    expect(children[0].type).toBe(mockIonicons);
    expect(children[0].props.name).toBe('home');
    expect(children[1]).toBeFalsy();
  });

  test('renders icon with red dot badge when hasBadge is true', async () => {
    const { TabIconWithBadge } = await import('./TabIconWithBadge');
    const result = TabIconWithBadge({
      icon: { active: 'barbell', inactive: 'barbell-outline' },
      hasBadge: true,
      color: '#ffffff',
      focused: false,
    });

    expect(result.type).toBe('View');
    const children = result.props.children;
    expect(children[0].type).toBe(mockIonicons);
    expect(children[0].props.name).toBe('barbell-outline');
    expect(children[1]).toBeTruthy();
    expect(children[1].type).toBe('View');
    expect(children[1].props.style.backgroundColor).toBe('#ef4444');
    expect(children[1].props.style.width).toBe(8);
    expect(children[1].props.style.height).toBe(8);
  });
});

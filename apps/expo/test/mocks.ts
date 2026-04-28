import { vi } from 'vitest';

export const mockSession = {
  data: {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
    },
  },
};

export const mockApiFetch = vi.fn();
export const mockUseSession = vi.fn(() => mockSession);

export function resetExpoMocks() {
  mockApiFetch.mockReset();
  mockUseSession.mockReturnValue(mockSession);
}


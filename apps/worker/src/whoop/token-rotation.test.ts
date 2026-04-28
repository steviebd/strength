import { describe, expect, test } from 'vitest';
import { getValidAccessToken } from './token-rotation';

function createLimitDb(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  } as never;
}

describe('token rotation', () => {
  test('returns stable errors when integration or refresh token is missing', async () => {
    await expect(getValidAccessToken(createLimitDb([]), {} as never, 'user-1')).resolves.toEqual({
      error: 'No WHOOP integration found',
    });

    await expect(
      getValidAccessToken(
        createLimitDb([
          {
            id: 'integration-1',
            accessToken: 'access-token',
            refreshToken: null,
            accessTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          },
        ]),
        {} as never,
        'user-1',
      ),
    ).resolves.toEqual({ error: 'No refresh token available' });
  });
});

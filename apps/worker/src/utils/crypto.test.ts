import { describe, expect, test } from 'vitest';

import { decryptToken, encryptToken } from './crypto';

const plaintext = 'whoop-refresh-token';
const raw32ByteKey = '12345678901234567890123456789012';
const base64Key = 'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=';
const base64UrlKey = 'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI';
const hexKey = '3132333435363738393031323334353637383930313233343536373839303132';

describe('crypto key decoding', () => {
  test.each([
    ['raw text', raw32ByteKey],
    ['base64', base64Key],
    ['base64url', base64UrlKey],
    ['hex', hexKey],
  ])('encrypts and decrypts with a %s master key', async (_label, key) => {
    const ciphertext = await encryptToken(plaintext, key);
    await expect(decryptToken(ciphertext, key)).resolves.toBe(plaintext);
  });

  test('throws a configuration error for invalid key formats', async () => {
    await expect(encryptToken(plaintext, 'not a valid key')).rejects.toThrow(
      'Invalid ENCRYPTION_MASTER_KEY format.',
    );
  });

  test('throws a configuration error when the key is missing', async () => {
    await expect(encryptToken(plaintext, undefined as unknown as string)).rejects.toThrow(
      'Missing ENCRYPTION_MASTER_KEY.',
    );
  });
});

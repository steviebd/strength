import { describe, expect, test } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  test('hashes and verifies a password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^pbkdf2-sha256:100000:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    await expect(verifyPassword({ hash, password: 'correct horse battery staple' })).resolves.toBe(
      true,
    );
  });

  test('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword({ hash, password: 'wrong password' })).resolves.toBe(false);
  });

  test('rejects legacy or malformed hashes without running scrypt fallback', async () => {
    await expect(verifyPassword({ hash: 'salt:key', password: 'password' })).resolves.toBe(false);
    await expect(verifyPassword({ hash: 'invalid', password: 'password' })).resolves.toBe(false);
  });
});

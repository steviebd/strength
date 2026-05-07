const PASSWORD_HASH_ALGORITHM = 'pbkdf2-sha256';
const PASSWORD_HASH_ITERATIONS = 100_000;
const PASSWORD_HASH_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;

const textEncoder = new TextEncoder();

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const hash = await derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS);

  return [
    PASSWORD_HASH_ALGORITHM,
    String(PASSWORD_HASH_ITERATIONS),
    encodeBase64Url(salt),
    encodeBase64Url(hash),
  ].join(':');
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  const parsed = parsePasswordHash(data.hash);
  if (!parsed) {
    return false;
  }

  const hash = await derivePasswordHash(data.password, parsed.salt, parsed.iterations);
  return timingSafeEqual(hash, parsed.hash);
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    passwordKey,
    PASSWORD_HASH_BYTES * 8,
  );

  return new Uint8Array(bits);
}

function parsePasswordHash(value: string): {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
} | null {
  const [algorithm, iterationsRaw, saltRaw, hashRaw] = value.split(':');

  if (algorithm !== PASSWORD_HASH_ALGORITHM || !iterationsRaw || !saltRaw || !hashRaw) {
    return null;
  }

  const iterations = Number.parseInt(iterationsRaw, 10);

  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    return null;
  }

  try {
    const salt = decodeBase64Url(saltRaw);
    const hash = decodeBase64Url(hashRaw);

    if (salt.byteLength !== PASSWORD_SALT_BYTES || hash.byteLength !== PASSWORD_HASH_BYTES) {
      return null;
    }

    return { iterations, salt, hash };
  } catch {
    return null;
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.byteLength; index += 1) {
    diff |= left[index]! ^ right[index]!;
  }

  return diff === 0;
}

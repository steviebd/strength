export async function encryptToken(plaintext: string, masterKey: string): Promise<string> {
  const key = await getKey(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(ciphertext: string, masterKey: string): Promise<string> {
  const key = await getKey(masterKey);
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);

  return new TextDecoder().decode(decrypted);
}

async function getKey(masterKey: string): Promise<CryptoKey> {
  const keyBytes = decodeMasterKey(masterKey);

  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function decodeMasterKey(masterKey: string): Uint8Array {
  if (typeof masterKey !== 'string') {
    throw new Error(
      'Missing ENCRYPTION_MASTER_KEY. Configure ENCRYPTION_MASTER_KEY in the worker environment.',
    );
  }

  const trimmedKey = masterKey.trim();

  for (const decoder of [decodeBase64Key, decodeBase64UrlKey, decodeHexKey, decodeUtf8Key]) {
    const decoded = decoder(trimmedKey);
    if (decoded) {
      return decoded;
    }
  }

  throw new Error(
    'Invalid ENCRYPTION_MASTER_KEY format. Expected a 16, 24, or 32-byte key as raw text, hex, base64, or base64url.',
  );
}

function decodeBase64Key(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/=\s]+$/.test(value)) {
    return null;
  }

  const normalized = value.replace(/\s+/g, '');

  if (normalized.length === 0 || normalized.length % 4 !== 0) {
    return null;
  }

  try {
    return validateKeyLength(Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

function decodeBase64UrlKey(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9\-_]+={0,2}$/.test(value)) {
    return null;
  }

  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  try {
    return validateKeyLength(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

function decodeHexKey(value: string): Uint8Array | null {
  if (!/^[A-Fa-f0-9]+$/.test(value) || value.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return validateKeyLength(bytes);
}

function decodeUtf8Key(value: string): Uint8Array | null {
  return validateKeyLength(new TextEncoder().encode(value));
}

function validateKeyLength(keyBytes: Uint8Array): Uint8Array | null {
  return [16, 24, 32].includes(keyBytes.byteLength) ? keyBytes : null;
}

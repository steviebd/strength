export function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

export function getObject(
  source: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const value = source?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getNumber(
  source: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = source?.[key];
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getTimestamp(
  source: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = source?.[key];
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function withWhoopFallbacks<
  T extends Record<string, unknown>,
  U extends Record<string, unknown>,
>(row: T, patch: U): T & U {
  return { ...row, ...patch };
}

export function pickAllowedKeys<T extends string>(
  body: Record<string, unknown>,
  keys: readonly T[],
): Record<string, unknown> {
  const allowed: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in body) {
      allowed[key] = body[key];
    }
  }
  return allowed;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateDateParam(
  date: string | undefined,
): { valid: true; date: string } | { valid: false; response: Response } {
  if (!date) {
    return {
      valid: false,
      response: Response.json({ error: 'date query parameter is required' }, { status: 400 }),
    };
  }
  if (!DATE_REGEX.test(date)) {
    return {
      valid: false,
      response: Response.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 }),
    };
  }
  return { valid: true, date };
}

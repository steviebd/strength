import { describe, expect, test } from 'vitest';
import { buildTemplateUpdate } from './templates';

describe('buildTemplateUpdate', () => {
  test('allows allowed fields', () => {
    const body = { name: 'A', description: 'B', notes: 'C' };
    expect(buildTemplateUpdate(body)).toEqual(body);
  });

  test('rejects protected fields', () => {
    const body = { name: 'A', userId: 'evil', id: '123', createdAt: new Date(), isDeleted: true };
    const result = buildTemplateUpdate(body);
    expect(result).toEqual({ name: 'A' });
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('isDeleted');
  });
});

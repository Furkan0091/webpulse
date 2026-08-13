import { describe, expect, it } from 'vitest';
import { evaluateAssertions, getPath } from './assert.js';

const data = {
  status: 'success',
  data: { user: { id: 42, active: true, name: 'Ada' } },
  items: ['a', 'b'],
};

describe('getPath', () => {
  it('resolves nested paths', () => {
    expect(getPath(data, 'status')).toBe('success');
    expect(getPath(data, 'data.user.id')).toBe(42);
    expect(getPath(data, 'data.user.active')).toBe(true);
  });

  it('returns undefined for missing paths', () => {
    expect(getPath(data, 'data.user.missing')).toBeUndefined();
  });
});

describe('evaluateAssertions', () => {
  it('passes when all rules match', () => {
    const result = evaluateAssertions(data, [
      { field: 'status', operator: 'equals', expected: 'success' },
      { field: 'data.user.active', operator: 'equals', expected: true },
      { field: 'data.user.id', operator: 'exists' },
    ]);
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('fails and reports mismatches', () => {
    const result = evaluateAssertions(data, [
      { field: 'status', operator: 'equals', expected: 'error' },
      { field: 'data.user.role', operator: 'exists' },
    ]);
    expect(result.pass).toBe(false);
    expect(result.failures.length).toBe(2);
  });
});

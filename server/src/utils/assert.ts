export interface AssertionRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'exists' | 'not_exists' | 'contains' | 'gt' | 'lt';
  expected?: string | number | boolean | null;
}

export function getPath(obj: unknown, path: string): unknown {
  if (obj == null || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function evaluateRule(value: unknown, rule: AssertionRule): { pass: boolean; message: string } {
  switch (rule.operator) {
    case 'exists':
      return { pass: value !== undefined && value !== null, message: `${rule.field} should exist` };
    case 'not_exists':
      return { pass: value === undefined || value === null, message: `${rule.field} should not exist` };
    case 'equals':
      return {
        pass: value === rule.expected || String(value) === String(rule.expected),
        message: `${rule.field} should equal ${String(rule.expected)} (got ${String(value)})`,
      };
    case 'not_equals':
      return {
        pass: value !== rule.expected && String(value) !== String(rule.expected),
        message: `${rule.field} should not equal ${String(rule.expected)}`,
      };
    case 'contains':
      return {
        pass: typeof value === 'string' && value.includes(String(rule.expected)),
        message: `${rule.field} should contain ${String(rule.expected)}`,
      };
    case 'gt': {
      const pass = Number(value) > Number(rule.expected);
      return { pass, message: `${rule.field} should be > ${String(rule.expected)}` };
    }
    case 'lt': {
      const pass = Number(value) < Number(rule.expected);
      return { pass, message: `${rule.field} should be < ${String(rule.expected)}` };
    }
  }
}

export function evaluateAssertions(data: unknown, rules: AssertionRule[]): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const rule of rules) {
    const value = getPath(data, rule.field);
    const result = evaluateRule(value, rule);
    if (!result.pass) failures.push(result.message);
  }
  return { pass: failures.length === 0, failures };
}

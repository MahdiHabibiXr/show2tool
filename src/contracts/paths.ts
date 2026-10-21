import { z } from 'zod';
const segment = /^[a-zA-Z0-9_-]+$/;
const placeholder = /^\{([a-zA-Z][a-zA-Z0-9_]{0,63})\}$/;
export const pathSchema = z.string().max(1024).refine(path => path.startsWith('/') && !path.startsWith('//') && path.split('/').slice(1).every(part => part === '' || segment.test(part) || (placeholder.test(part) && !['constructor', 'prototype', '__proto__'].includes(placeholder.exec(part)![1]))));
export function pathInputs(path: string): string[] { return [...path.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]{0,63})\}/g)].map(match => match[1]); }
export function resolvePath(path: string, inputs: Record<string, string>): string {
  return path.replace(/\{([a-zA-Z][a-zA-Z0-9_]{0,63})\}/g, (_match, name: string) => {
    const value = inputs[name];
    if (!Object.hasOwn(inputs, name) || typeof value !== 'string' || !segment.test(value) || value.length > 200) throw new Error('INVALID_INPUT');
    return value;
  });
}
export function containsPath(scope: string, candidate: string): boolean {
  const expected = scope.split('/');
  const actual = candidate.split('/');
  return expected.length === actual.length && expected.every((part, index) => placeholder.test(part) ? segment.test(actual[index]) || placeholder.test(actual[index]) : part === actual[index]);
}
export function matchesPath(template: string, path: string): boolean {
  const expected = template.split('/');
  const actual = path.split('/');
  return expected.length === actual.length && expected.every((part, index) => placeholder.test(part) ? segment.test(actual[index]) : part === actual[index]);
}

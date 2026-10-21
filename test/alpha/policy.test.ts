import { it, expect } from 'vitest';
import { assertDestination, isPublicAddress } from '../../src/runtime/policy.js';
it('blocks private, loopback, mapped, link-local and metadata destinations by default', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1']) expect(isPublicAddress(ip), ip).toBe(false);
  expect(isPublicAddress('8.8.8.8')).toBe(true);
  expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
});
it('accepts only the exact reviewed destination and pins allowed private exceptions', () => {
  const grant = { origin: 'http://127.0.0.1:4567', addresses: ['127.0.0.1'] };
  expect(() => assertDestination(new URL('http://127.0.0.1:4567/catalog'), ['127.0.0.1'], grant)).not.toThrow();
  expect(() => assertDestination(new URL('http://127.0.0.1:4568/catalog'), ['127.0.0.1'], grant)).toThrow('REVIEW_REQUIRED');
  expect(() => assertDestination(new URL('http://127.0.0.1:4567/catalog'), ['10.0.0.1'], grant)).toThrow('REVIEW_REQUIRED');
});

import { it, expect } from 'vitest';
import { freezeContract, assertUnchanged, assertExpectedTasks } from '../../spike/verify.js';
it('invalidates frozen evidence after the contract changes', () => {
  const contract = { origin: 'http://127.0.0.1:1234', expectedTenant: 'A', query: 'q' };
  const frozen = freezeContract(contract);
  expect(() => assertUnchanged(contract, frozen)).not.toThrow();
  contract.expectedTenant = 'B';
  expect(() => assertUnchanged(contract, frozen)).toThrow('contract changed');
});
it('checks exact independently specified result identities', () => {
  expect(() => assertExpectedTasks([{ id: 'a3', tenant: 'A', title: 'gamma', version: 1 }], ['a3'])).not.toThrow();
  expect(() => assertExpectedTasks([{ id: 'a2', tenant: 'A', title: 'gamma', version: 1 }], ['a3'])).toThrow('result mismatch');
  expect(() => assertExpectedTasks([], ['a3'])).toThrow('result mismatch');
});

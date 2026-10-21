import { it, expect } from 'vitest';
import { handle } from '../../src/app/handlers.js';
import { parseReviewArtifact, ReviewStore } from '../../src/approval/review.js';

const manifest = { id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', schemaVersion: 1, inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };

it('reviews saved compiler output without manually extracting its manifest', async () => {
  const result = await handle({
    command: 'candidate',
    specification: { id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: { search: { type: 'string', maxLength: 50 } }, projection: ['/items'] },
    demonstrations: ['first', 'second'].map((value, index) => ({ inputs: { search: value }, request: { id: String(index), method: 'GET', path: '/catalog', status: 200, shape: {}, queryKeys: ['term'], approvedQuery: { term: value } } })),
  });
  expect(result.ok).toBe(true);
  const candidate = parseReviewArtifact(JSON.stringify(result));
  expect(candidate.query).toEqual({ term: { source: 'input', name: 'search' } });
  const reviews = new ReviewStore();
  expect(() => reviews.require(candidate)).toThrow('REVIEW_REQUIRED');
  let preview = '';
  expect(await reviews.review(candidate, { interactive: true, ask: async prompt => { preview = prompt; return 'review catalog'; } })).toBe(true);
  expect(preview).toContain('"term":{"source":"input","name":"search"}');
  expect(reviews.require(candidate)).toEqual(candidate);
});

it('continues accepting bare manifests', () => {
  expect(parseReviewArtifact(JSON.stringify(manifest))).toEqual(manifest);
});

it('accepts UTF-8 BOM files saved by Windows terminal tools', () => {
  const artifact = '﻿' + JSON.stringify({ schemaVersion: 1, ok: true, data: manifest, meta: { complete: true } }) + '\r\n';
  expect(parseReviewArtifact(artifact)).toEqual(manifest);
});

it.each([
  { schemaVersion: 1, ok: false, error: { code: 'INVALID_INPUT' }, data: manifest, meta: { complete: true } },
  { schemaVersion: 1, ok: true, data: manifest, meta: { complete: false } },
  { schemaVersion: 2, ok: true, data: manifest, meta: { complete: true } },
  { schemaVersion: 1, ok: true, data: manifest },
  { schemaVersion: 1, ok: true, data: manifest, meta: { complete: true }, approved: true },
  { schemaVersion: 1, ok: true, data: { commands: [] }, meta: { complete: true } },
  { ...manifest, approved: true },
])('rejects invalid or incomplete artifacts without granting review', artifact => {
  expect(() => parseReviewArtifact(JSON.stringify(artifact))).toThrow();
});

it('rejects malformed and oversized artifact files', () => {
  expect(() => parseReviewArtifact('{')).toThrow();
  expect(() => parseReviewArtifact(' '.repeat(32769) + JSON.stringify(manifest))).toThrow();
});

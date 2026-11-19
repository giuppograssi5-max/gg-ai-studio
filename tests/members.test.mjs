import test from 'node:test';
import assert from 'node:assert/strict';
import { createMembersHandler } from '../netlify/functions/members.mjs';

const request = () => new Request('https://example.com/gg-members');

test('counts every page and exposes only the aggregate', async () => {
  const pages = [];
  const handler = createMembersHandler(async ({ page, perPage }) => {
    pages.push(page);
    assert.equal(perPage, 100);
    return Array.from({ length: page === 1 ? 100 : 3 }, () => ({ email: 'private@example.com' }));
  });
  const response = await handler(request());
  assert.deepEqual(await response.json(), { count: 103 });
  assert.deepEqual(pages, [1, 2]);
  assert.match(response.headers.get('cache-control'), /s-maxage=60/);
});

test('an empty registry returns a real zero', async () => {
  const response = await createMembersHandler(async () => [])(request());
  assert.deepEqual(await response.json(), { count: 0 });
});

test('upstream errors never expose private data or a misleading zero', async () => {
  const response = await createMembersHandler(async () => { throw new Error('private upstream detail'); })(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Member count unavailable' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('rejects mutations without contacting Identity', async () => {
  const response = await createMembersHandler(() => { assert.fail('unexpected call'); })(
    new Request('https://example.com/gg-members', { method: 'POST' }),
  );
  assert.equal(response.status, 405);
});

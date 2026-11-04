import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, ApiError, requestErrorMessage } from './public/api.js';

const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

test('loading the address does not consume the save request timeout', async () => {
  const signals = [];
  const request = createApiClient({
    configUrl: 'https://nikitos812.github.io/dlya-mashi/config.json',
    configTimeoutMs: 1500, requestTimeoutMs: 200,
    fetchImpl: async (url, options) => {
      signals.push(options.signal);
      if (url.includes('config.json')) {
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(options.cache, 'no-store');
        assert.ok(new URL(url).searchParams.has('t'));
        return json({ apiBase: 'https://example-tunnel.trycloudflare.com' });
      }
      assert.equal(options.signal.aborted, false);
      return json({ entry: { id: 'saved' } });
    }
  });
  const result = await request('/api/entries', { method: 'POST', body: 'payload' });
  assert.equal(result.data.entry.id, 'saved');
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[0].aborted, false);
});

test('a lost save response retries the same ID and payload', async () => {
  const bodies = [], saved = new Map(); let retries = 0;
  const request = createApiClient({ retryDelayMs: 0, onRetry: () => retries++, fetchImpl: async (_url, options) => {
    bodies.push(options.body);
    const entry = JSON.parse(options.body); saved.set(entry.id, entry);
    if (bodies.length === 1) throw new DOMException('Fetch is aborted', 'AbortError');
    return json({ entry: saved.get(entry.id) });
  } });
  const payload = JSON.stringify({ id: 'same-id', text: 'Желание' });
  const result = await request('/api/entries', { method: 'POST', body: payload });
  assert.equal(result.ok, true); assert.equal(retries, 1);
  assert.deepEqual(bodies, [payload, payload]); assert.equal(saved.size, 1);
});

test('an unavailable request fails honestly after two attempts with a Russian error', async () => {
  let calls = 0;
  const request = createApiClient({ requestTimeoutMs: 10, retryDelayMs: 0, fetchImpl: (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Fetch is aborted', 'AbortError')), { once: true }));
  } });
  await assert.rejects(request('/api/entries'), error => {
    assert.equal(error.kind, 'timeout');
    assert.match(requestErrorMessage(error), /Текст остался в окне/);
    return true;
  });
  assert.equal(calls, 2);
  assert.doesNotMatch(requestErrorMessage(new DOMException('Fetch is aborted', 'AbortError')), /Fetch|abort/);
});

test('validation is not retried and temporary server errors are retried', async () => {
  let calls = 0;
  const request = createApiClient({ retryDelayMs: 0, fetchImpl: async () => { calls++; return json({ error: 'Напиши желание.' }, 400); } });
  const result = await request('/api/entries');
  assert.equal(result.status, 400); assert.equal(calls, 1);
  assert.equal(requestErrorMessage(new ApiError('validation', result.data.error)), 'Напиши желание.');
  calls = 0;
  const recovered = createApiClient({ retryDelayMs: 0, fetchImpl: async () => ++calls === 1 ? { status: 503 } : json({ entries: [] }) });
  assert.equal((await recovered('/api/entries')).ok, true);
  assert.equal(calls, 2);
});

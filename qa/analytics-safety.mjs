import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../js/analytics.js', import.meta.url), 'utf8').replaceAll('export function ', 'function ');
function harness(fetch, navigator = {}) {
  const tasks = [], requests = [], listeners = {};
  const sandbox = { navigator, fetch: (...args) => { requests.push(args); return fetch(...args); },
    setTimeout: (fn) => tasks.push(fn), addEventListener: (name, fn) => { listeners[name] = fn; } };
  vm.createContext(sandbox);
  vm.runInContext(source + '\n globalThis.api = { initAnalytics, trackGameEvent, setAnalyticsContext };', sandbox);
  return { api: sandbox.api, requests, listeners, flush: () => { while (tasks.length) tasks.shift()(); } };
}
for (const fetch of [() => Promise.resolve({}), () => Promise.reject(new Error('network')), () => { throw Error('network'); }, () => new Promise(() => {})]) {
  const h = harness(fetch);
  h.api.initAnalytics(); h.api.initAnalytics();
  h.api.setAnalyticsContext(() => ({ mode: 'qa', game_state: 'playing', player_name: 'PRIVATE' }));
  h.api.trackGameEvent('game_completed', { score: 42, high_score: 42, seed: 'PRIVATE', error_message: 'PRIVATE' }, 'run');
  h.api.trackGameEvent('game_completed', {}, 'run');
  h.api.trackGameEvent('unknown_event');
  h.listeners.error({ error: { name: 'TypeError', message: 'PRIVATE' } });
  h.listeners.error({ error: { name: 'TypeError', message: 'PRIVATE' } });
  assert.equal(h.requests.length, 0, 'capture is deferred'); h.flush();
  assert.equal(h.requests.length, 3, 'initialization, terminal and errors deduplicate');
  const payloads = h.requests.map((r) => JSON.parse(r[1].body));
  assert.equal(new Set(payloads.map((p) => p.distinct_id)).size, 1);
  assert.ok(!JSON.stringify(payloads).includes('PRIVATE'));
  assert.equal(payloads[1].properties.score, 42);
  assert.equal(payloads[2].properties.game_state, 'playing');
  assert.ok(payloads.every((p) => p.properties.$process_person_profile === false && p.properties.$geoip_disable === true));
  await Promise.resolve();
}
for (const navigator of [{ globalPrivacyControl: true }, { onLine: false }]) {
  const h = harness(() => Promise.resolve({}), navigator); h.api.initAnalytics(); h.api.trackGameEvent('game_started'); h.flush();
  assert.equal(h.requests.length, 0, 'privacy and offline guards suppress capture');
}
console.log('Analytics safety QA passed: deferred capture, dedupe, privacy, sanitized context, rejecting/throwing/hanging transport.');

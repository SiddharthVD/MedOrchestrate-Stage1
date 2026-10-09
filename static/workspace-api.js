/* Explicit transport selection. Live API failure never falls back to demo. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MedWorkspaceApi = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function create(demo, fetchJson) {
    let mode = 'demo';
    return {
      get mode() { return mode; },
      setMode(value) {
        if (!['demo', 'live'].includes(value)) throw new Error('Unknown data mode');
        mode = value;
      },
      async request(url, options = {}, timeout = 15000) {
        const selected = mode;
        if (selected === 'live') return fetchJson(url, options, timeout);
        if (url === '/api/benchmark/status') return { available: false, dataset: 'NFCorpus', split: 'test', reason: 'Demo Data runs offline and does not inspect benchmark files. Select Live API to check the local backend.' };
        if (url.startsWith('/api/benchmark/evaluation')) throw new Error('Benchmark execution requires Live API mode. Existing reports remain available; no benchmark runs automatically.');
        const result = await demo.request(url, options);
        if (url === '/api/status') return { ...result, engine: 'Existing JavaScript fixture engine', unavailable_routes: ['dense', 'hybrid', 'base_rewrite', 'lora_rewrite'] };
        return result;
      }
    };
  }
  return { create };
});

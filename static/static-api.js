/* In-browser adapter used by the static workbench; also exercised by Node smoke. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MedOrchestrateStaticApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(core, loadJson) {
    let fixturePromise;
    function fixture() {
      if (!fixturePromise) {
        fixturePromise = Promise.all(['cases.json', 'documents.json', 'demo_qrels.json'].map(loadJson))
          .then(([cases, documents, qrels]) => ({ cases, documents, qrels }))
          .catch(error => {
            fixturePromise = undefined;
            throw new Error(`Static fixture files did not load. Refresh the published page and try again. ${error.message}`);
          });
      }
      return fixturePromise;
    }

    async function request(url, options = {}) {
      const data = await fixture();
      if (url === '/api/status') return {
        project: 'MedOrchestrate', corpus: 'fictional-demo-v1', cases: data.cases.length,
        documents: data.documents.length, available_corpora: ['fictional-demo-v1'],
        available_routes: core.ROUTES, evaluation: 'fictional fixture qrels; no clinical validation'
      };
      if (url === '/api/corpora') return { corpora: [{
        id: 'fictional-demo-v1', kind: 'fictional_demo', documents: data.documents.length,
        provenance_note: 'Every record in this static demo is invented. Local citation import via CLI requires the Flask project.'
      }] };
      if (url === '/api/cases') return data.cases.map(({ facts, ...row }) => row);
      if (url.startsWith('/api/cases/')) {
        const parsed = new URL(url, 'https://static.invalid');
        const caseId = decodeURIComponent(parsed.pathname.slice('/api/cases/'.length));
        const caseRow = data.cases.find(row => row.id === caseId);
        if (!caseRow) throw new Error('Unknown fictional case');
        const asOf = core.strictDate(parsed.searchParams.get('as_of'));
        return { ...caseRow, facts: core.validFacts(caseRow, asOf), as_of: asOf };
      }
      if (url === '/api/evaluation') return core.evaluate(data.cases, data.documents, data.qrels);
      if (url === '/api/search' || url === '/api/compare') {
        const payload = JSON.parse(options.body || '{}');
        const caseRow = data.cases.find(row => row.id === payload.case_id);
        if (!caseRow) throw new Error('Select a known fictional case');
        if (payload.corpus !== 'fictional-demo-v1') throw new Error('Only the invented corpus is available in this static demo');
        if (url === '/api/search') return core.runSearch(payload.question, caseRow, payload.as_of, payload.route, data.documents);
        const comparisons = Object.fromEntries(core.ROUTES.map(route => [route, core.runSearch(payload.question, caseRow, payload.as_of, route, data.documents)]));
        return { case_id: caseRow.id, as_of: payload.as_of, question: payload.question, corpus: 'fictional-demo-v1', comparisons };
      }
      throw new Error('Unknown static demo action');
    }

    return { request };
  }

  return { create };
});

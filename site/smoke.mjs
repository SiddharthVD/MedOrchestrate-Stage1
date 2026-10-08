/* Run with: node site/smoke.mjs from the project root. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const core = require('./search-core.js');
const staticApi = require('./static-api.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', name), 'utf8'));
const cases = read('cases.json');
const documents = read('documents.json');
const qrels = read('demo_qrels.json');
const diabetes = cases.find(row => row.id === 'case-diabetes-01');
const question = diabetes.suggested_question;

assert.equal(cases.length, 3);
assert.equal(documents.length, 12);
assert.equal(core.validFacts(diabetes, '2025-12-31').length, 0);
assert.equal(core.validFacts(diabetes, '2026-02-01').length, 2);
assert.equal(core.validFacts(diabetes, '2026-09-01').length, 3);
assert.throws(() => core.strictDate('2026-02-30'), /Invalid calendar date/);

const early = core.runSearch(question, diabetes, '1900-01-01', 'adaptive', documents);
assert.equal(early.executed_route, 'direct_bm25');
assert.equal(early.trace.eligible_documents, 0);
assert.equal(early.results.length, 0);

const direct = core.runSearch(question, diabetes, '2026-10-08', 'direct_bm25', documents);
const expanded = core.runSearch(question, diabetes, '2026-10-08', 'expanded_bm25', documents);
const adaptive = core.runSearch(question, diabetes, '2026-10-08', 'adaptive', documents);
assert.equal(direct.executed_route, 'direct_bm25');
assert.equal(expanded.executed_route, 'expanded_bm25');
assert.equal(adaptive.executed_route, 'expanded_bm25');
assert.deepEqual(adaptive.trace.added_terms, ['chronic', 'kidney', 'disease', 'stage', '3', 'albuminuria']);
assert.deepEqual(adaptive.results.slice(0, 5).map(row => row.id), ['D01', 'D02', 'D09', 'D03', 'D11']);
assert.deepEqual(adaptive.results, expanded.results);
assert.ok(direct.results.length > 0);
assert.ok(adaptive.results.every(row => row.fixture === true));
assert.ok(adaptive.results.every(row => row.year <= 2025));

const report = core.evaluate(cases, documents, qrels);
assert.equal(report.query_count, 6);
assert.equal(report.k, 5);
assert.equal(report.routes.direct_bm25.mean_recall_at_k, 1);
assert.ok(Math.abs(report.routes.direct_bm25.mean_ndcg_at_k - 0.982060) < 0.000001);
assert.ok(Math.abs(report.routes.expanded_bm25.mean_recall_at_k - 0.9444444444) < 0.000001);
assert.ok(Math.abs(report.routes.adaptive.mean_mrr_at_k - 0.9166666667) < 0.000001);

// Exercise the exact adapter that the five-view browser UI calls.
const api = staticApi.create(core, async name => read(name));
const status = await api.request('/api/status');
const visibleCases = await api.request('/api/cases');
const caseDetail = await api.request('/api/cases/case-diabetes-01?as_of=2026-10-08');
assert.equal(status.cases, 3);
assert.equal(visibleCases.length, 3);
assert.equal(caseDetail.facts.length, 3);
const context = {
  case_id: caseDetail.id, as_of: caseDetail.as_of,
  question: caseDetail.suggested_question, corpus: status.corpus
};
for (const route of core.ROUTES) {
  const result = await api.request('/api/search', { body: JSON.stringify({ ...context, route }) });
  assert.equal(result.requested_route, route);
  assert.ok(result.trace);
}
const comparison = await api.request('/api/compare', { body: JSON.stringify(context) });
assert.deepEqual(Object.keys(comparison.comparisons), core.ROUTES);
const evaluation = await api.request('/api/evaluation');
assert.equal(evaluation.query_count, 6);
const earlyCase = await api.request('/api/cases/case-diabetes-01?as_of=1900-01-01');
assert.equal(earlyCase.facts.length, 0);
await assert.rejects(api.request('/api/search', { body: JSON.stringify({ ...context, corpus: 'imported-local-v1', route: 'direct_bm25' }) }), /Only the invented corpus/);
console.log('Static demo smoke passed: date filtering, all routes, ranking, fictional evaluation, and UI adapter requests.');

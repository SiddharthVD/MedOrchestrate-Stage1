const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const routeNames = { direct_bm25: 'Direct BM25', expanded_bm25: 'Expanded BM25', adaptive: 'Adaptive rule' };
const pages = new Set(['dashboard', 'cases', 'search', 'compare', 'evaluation']);
const state = { cases: [], corpora: [], importError: '', currentCase: null, questionEdited: false, contextVersion: 0, benchmarkAvailable: false, initVersion: 0 };
const demoApi = window.MedOrchestrateStaticApi.create(window.MedOrchestrateCore, name => fetchJson('/demo-data/' + name));
const transport = window.MedWorkspaceApi.create(demoApi, fetchJson);
let sessions = [];
try { const stored = JSON.parse(localStorage.getItem('medorchestrate_sessions_v1') || '[]'); sessions = Array.isArray(stored) ? stored.filter(row => typeof row.question === 'string' && typeof row.case_id === 'string').slice(0, 10) : []; } catch { /* Storage is optional. */ }

function setPage(name) {
  const target = pages.has(name) ? name : 'dashboard';
  document.querySelectorAll('.page').forEach(element => {
    const selected = element.id === target;
    element.hidden = !selected;
    element.classList.toggle('active', selected);
  });
  document.querySelectorAll('.nav').forEach(element => {
    const selected = element.dataset.page === target;
    element.classList.toggle('active', selected);
    if (selected) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  });
  document.title = `${document.getElementById(target).querySelector('h1').textContent} · MedOrchestrate`;
}

function showConnection(connected, message) {
  const element = $('connection-status');
  element.classList.toggle('offline', !connected);
  element.innerHTML = `<span class="status-dot" aria-hidden="true"></span>${escapeHtml(message)}`;
}

function errorPanel(error, retry) {
  const message = error instanceof Error ? error.message : String(error);
  return `<div class="error-panel" role="alert"><strong>Unable to load this view</strong><p>${escapeHtml(message)}</p>${retry ? '<button class="secondary retry-button" type="button">Retry connection</button>' : ''}</div>`;
}

function json(url, options = {}, timeoutMs = 15000) { return transport.request(url, options, timeoutMs); }

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`Server returned an unreadable response (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`The local API did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`);
    if (error instanceof TypeError) throw new Error('Cannot reach the local API. Start the MedOrchestrate server, then retry.');
    throw error;
  } finally { clearTimeout(timer); }
}

function setControlsEnabled(enabled) {
  ['case-select', 'as-of', 'search-case-select', 'search-as-of', 'question', 'route', 'corpus', 'search-button', 'compare-button', 'diagnostic-button', 'evaluation-button', 'benchmark-refresh-button'].forEach(id => {
    $(id).disabled = !enabled;
  });
}

function selectedContext() {
  return { case_id: $('case-select').value, as_of: $('as-of').value, question: $('question').value.trim(), corpus: $('corpus').value };
}

function updateContexts() {
  $('search-case-select').value = $('case-select').value;
  $('search-as-of').value = $('as-of').value;
  $('question-status').textContent = state.questionEdited ? 'Edited question · exploratory and unscored. Fixture metrics do not score this question.' : 'Suggested question · exploratory search. Evaluation reports use their own frozen queries.';
  const selected = state.cases.find(row => row.id === $('case-select').value);
  const caseName = selected?.name || 'No case selected';
  const date = $('as-of').value || 'No date selected';
  const corpus = state.corpora.find(row => row.id === $('corpus').value);
  const corpusName = corpus?.id === 'imported-local-v1' ? 'User supplied local records · unverified' : 'Fictional demonstration';
  const question = $('question').value.trim();
  const snippet = question ? `<span><strong>Question</strong> ${escapeHtml(question)}</span>` : '<span><strong>Question</strong> None entered</span>';
  $('search-context').innerHTML = `<span><strong>Case</strong> ${escapeHtml(caseName)}</span><span><strong>Facts through</strong> ${escapeHtml(date)}</span><span><strong>Corpus</strong> ${escapeHtml(corpusName)}</span>`;
  $('compare-context').innerHTML = `<span><strong>Case</strong> ${escapeHtml(caseName)}</span><span><strong>Facts through</strong> ${escapeHtml(date)}</span><span><strong>Corpus</strong> ${escapeHtml(corpusName)}</span>${snippet}`;
  $('question-count').textContent = String($('question').value.length);
}

function clearOutputs() {
  $('search-output').innerHTML = '<div class="empty-state">The context changed. Run a search to see current results.</div>';
  $('compare-output').innerHTML = '<div class="empty-state">The context changed. Compare routes again for current inputs.</div>';
}

async function loadCase() {
  const version = ++state.contextVersion;
  const caseId = $('case-select').value;
  const asOf = $('as-of').value;
  $('case-detail').innerHTML = '<div class="loading-state" role="status">Loading case facts…</div>';
  updateContexts();
  clearOutputs();
  try {
    const data = await json(`/api/cases/${encodeURIComponent(caseId)}?as_of=${encodeURIComponent(asOf)}`);
    if (version !== state.contextVersion) return;
    state.currentCase = data;
    if (!state.questionEdited) $('question').value = data.suggested_question || '';
    updateContexts();
    const facts = data.facts || [];
    $('case-detail').innerHTML = `<article class="panel case-card"><div class="section-heading"><div><p class="panel-kicker">FICTIONAL CASE</p><h2>${escapeHtml(data.name)}</h2></div><span class="count-pill">${facts.length} available fact${facts.length === 1 ? '' : 's'}</span></div><p>${escapeHtml(data.description)}</p><dl class="system-details"><div><dt>Identifier</dt><dd>${escapeHtml(data.id)}</dd></div><div><dt>Age</dt><dd>Adult; exact age not provided in the fixture</dd></div></dl><h3>Available history and fact timeline through ${escapeHtml(data.as_of)}</h3><div class="fact-list">${facts.map(fact => `<div class="fact"><span>${escapeHtml(fact.label)}</span><span class="meta">Available ${escapeHtml(fact.available_on)}</span></div>`).join('') || '<div class="empty-state compact">No facts were available on this date. Adaptive routing will use direct BM25.</div>'}</div><p class="field-hint">Suggested question: ${escapeHtml(data.suggested_question)}</p></article>`;
    $('patient-context').innerHTML = `<strong>${escapeHtml(data.id)} · Fictional adult</strong><p>${escapeHtml(facts.map(fact => fact.label).join(' · ') || 'No facts available at this cutoff.')}</p>`;
  } catch (error) {
    if (version !== state.contextVersion) return;
    state.currentCase = null;
    $('case-detail').innerHTML = errorPanel(error, true);
    $('search-output').innerHTML = errorPanel(error, true);
    $('compare-output').innerHTML = errorPanel(error, true);
  }
}

function validateQuestion() {
  const value = $('question').value.trim();
  if (!value || value.length > 500) {
    $('question').focus();
    $('search-output').innerHTML = errorPanel(new Error('Enter a research question of 1 to 500 characters.'), false);
    return false;
  }
  if (!state.currentCase) {
    $('search-output').innerHTML = errorPanel(new Error('Load a fictional case before searching.'), true);
    return false;
  }
  return true;
}

function searchPayload(route, context = selectedContext()) {
  return { ...context, route };
}

async function runSearch(route, context = selectedContext()) {
  return json('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(searchPayload(route, context)) });
}

function resultCards(data, compact = false) {
  const rows = data.results || [];
  if (!rows.length) return '<div class="empty-state compact">No matching records in the selected corpus for this query.</div>';
  return `<div class="results">${rows.map((row, index) => `<article class="result"><div class="result-top"><span class="rank">#${index + 1}</span><h3>${escapeHtml(row.title)}</h3></div><div class="result-meta"><span>${escapeHtml(row.id)}</span><span>${escapeHtml(row.source)}</span><span>${escapeHtml(row.published_on || row.year)}</span>${row.source_type ? `<span>${escapeHtml(row.source_type)}</span>` : ''}<span>BM25 ${escapeHtml(row.score)}</span><span class="fixture-tag">${row.fixture ? 'Invented record' : 'User supplied · unverified'}</span></div>${compact ? '' : `<p>${escapeHtml(row.abstract)}</p>${!row.fixture && /^https?:\/\//i.test(row.url || '') ? `<a class="source-link" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">Open user supplied source ↗</a>` : ''}`}</article>`).join('')}</div>`;
}

function traceCard(data) {
  const trace = data.trace || {};
  const facts = trace.available_facts || [];
  const additions = trace.added_terms || [];
  return `<details class="trace-panel"><summary>Execution trace <span>Inspect route decisions and calls</span></summary><div class="trace-content"><dl><div><dt>Requested route</dt><dd>${escapeHtml(routeNames[data.requested_route] || data.requested_route)}</dd></div><div><dt>Executed route</dt><dd>${escapeHtml(routeNames[data.executed_route] || data.executed_route)}</dd></div><div><dt>Reason</dt><dd>${escapeHtml(trace.rationale)}</dd></div><div><dt>Available facts</dt><dd>${escapeHtml(facts.join(', ') || 'None')}</dd></div><div><dt>Added terms</dt><dd>${escapeHtml(additions.join(', ') || 'None')}</dd></div><div><dt>Query used</dt><dd>${escapeHtml(data.query_used)}</dd></div><div><dt>Calls</dt><dd>Retrieval ${escapeHtml(trace.calls?.retrieval ?? 0)} · Rewrite ${escapeHtml(trace.calls?.rewrite ?? 0)} · Rerank ${escapeHtml(trace.calls?.rerank ?? 0)} · Probe ${escapeHtml(trace.calls?.probe ?? 0)}</dd></div><div><dt>Corpus</dt><dd>${escapeHtml(trace.corpus)}</dd></div></dl></div></details>`;
}

function summary(data) {
  return `<div class="result-summary"><span class="count-pill">${(data.results || []).length} matching records</span><span>Executed ${escapeHtml(routeNames[data.executed_route] || data.executed_route)}</span><span>${Number.isFinite(data.trace?.elapsed_ms) ? escapeHtml(data.trace.elapsed_ms) + ' ms measured by ' + (transport.mode === 'demo' ? 'browser engine' : 'backend engine') : 'Latency: Not measured'}</span><span>${escapeHtml(data.trace?.eligible_documents ?? 'Not measured')} date eligible records</span></div>`;
}

function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
  button.setAttribute('aria-busy', String(busy));
}

async function submitSearch(event) {
  event.preventDefault();
  if (!validateQuestion()) return;
  const button = $('search-button');
  const version = state.contextVersion;
  const context = selectedContext();
  const route = $('route').value;
  setBusy(button, true, 'Searching…', 'Run search');
  $('search-output').innerHTML = '<div class="loading-state" role="status">Searching the selected local corpus…</div>';
  try {
    const data = await runSearch(route, context);
    if (version !== state.contextVersion || context.question !== $('question').value.trim() || context.corpus !== $('corpus').value || route !== $('route').value) return;
    $('search-output').innerHTML = `<div class="section-heading"><div><p class="panel-kicker">SEARCH OUTPUT</p><h2>Ranked records</h2></div></div>${summary(data)}${resultCards(data)}${traceCard(data)}`;
    rememberSession(context, route);
  } catch (error) {
    if (version !== state.contextVersion) return;
    $('search-output').innerHTML = errorPanel(error, false);
  } finally { if (version === state.contextVersion) setBusy(button, false, 'Searching…', 'Run search'); }
}

async function compareRoutes() {
  if (!validateQuestion()) {
    $('compare-output').innerHTML = $('search-output').innerHTML;
    return;
  }
  const button = $('compare-button');
  const version = state.contextVersion;
  const context = selectedContext();
  const routes = ['direct_bm25', 'expanded_bm25', 'adaptive'];
  setBusy(button, true, 'Comparing…', 'Compare three routes');
  $('compare-output').innerHTML = '<div class="loading-state" role="status">Running all three routes on the same inputs…</div>';
  try {
    const response = await json('/api/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(context) });
    if (version !== state.contextVersion || context.question !== $('question').value.trim() || context.corpus !== $('corpus').value) return;
    const directIds = (response.comparisons.direct_bm25.results || []).slice(0, 5).map(row => row.id);
    const expandedIds = (response.comparisons.expanded_bm25.results || []).slice(0, 5).map(row => row.id);
    const common = directIds.filter(id => expandedIds.includes(id));
    const changed = expandedIds.filter(id => directIds.indexOf(id) !== expandedIds.indexOf(id));
    $('compare-output').innerHTML = `<div class="context-strip"><span>Top 5 overlap: ${common.length} records</span><span>Changed positions in expanded results: ${escapeHtml(changed.join(', ') || 'None')}</span><span>Question is exploratory and unscored.</span></div><div class="compare-grid">${routes.map((route, index) => {
      const data = response.comparisons[route];
      return `<article class="compare-card"><p class="panel-kicker">${index === 2 ? 'RULE SELECTED' : 'FIXED BASELINE'}</p><h2>${routeNames[route]}</h2>${summary(data)}<p class="query-line"><strong>Query used</strong> ${escapeHtml(data.query_used)}</p>${resultCards(data, true)}${traceCard(data)}</article>`;
    }).join('')}</div><div class="fixture-banner"><strong>How to read this</strong><span>These are local rankings of ${context.corpus === 'fictional-demo-v1' ? 'invented fixture records' : 'user supplied, unverified records'}. Differences do not establish clinical retrieval quality.</span></div>`;
  } catch (error) {
    if (version !== state.contextVersion) return;
    $('compare-output').innerHTML = errorPanel(error, false);
  } finally { if (version === state.contextVersion) setBusy(button, false, 'Comparing…', 'Compare three routes'); }
}

async function loadEvaluation() {
  if ($('corpus').value !== 'fictional-demo-v1') {
    $('evaluation-output').innerHTML = '<div class="empty-state">No compatible relevance judgments for the active imported corpus. Fixture scores are unavailable for this dataset.</div>';
    return;
  }
  const button = $('evaluation-button');
  setBusy(button, true, 'Loading…', 'Load fixture metrics');
  $('evaluation-output').innerHTML = '<div class="loading-state compact" role="status">Calculating fictional fixture metrics…</div>';
  try {
    const report = await json('/api/evaluation');
    const routes = ['direct_bm25', 'expanded_bm25', 'adaptive'];
    const metric = value => Number(value).toFixed(3);
    $('evaluation-output').innerHTML = `<p class="field-hint">${escapeHtml(report.query_count)} fictional queries · cutoff ${escapeHtml(report.k)} · ${escapeHtml(report.annotation)}</p><div class="table-scroll"><table class="metric-table"><caption>Fictional fixture metrics only</caption><thead><tr><th scope="col">Route</th><th scope="col">Recall@${escapeHtml(report.k)}</th><th scope="col">MRR@${escapeHtml(report.k)}</th><th scope="col">nDCG@${escapeHtml(report.k)}</th></tr></thead><tbody>${routes.map(route => `<tr><th scope="row">${routeNames[route]}</th><td>${metric(report.routes[route].mean_recall_at_k)}</td><td>${metric(report.routes[route].mean_mrr_at_k)}</td><td>${metric(report.routes[route].mean_ndcg_at_k)}</td></tr>`).join('')}</tbody></table></div><p class="field-hint">The labels and corpus were created for a software demonstration. Do not interpret these values as a validated study.</p>`;
  } catch (error) {
    $('evaluation-output').innerHTML = errorPanel(error, false);
  } finally { setBusy(button, false, 'Loading…', 'Load fixture metrics'); }
}

async function loadBenchmarkStatus() {
  const button = $('benchmark-refresh-button');
  setBusy(button, true, 'Checking…', 'Refresh benchmark status');
  $('benchmark-status-output').innerHTML = '<div class="loading-state compact" role="status">Checking local benchmark files and manifest…</div>';
  try {
    const report = await json('/api/benchmark/status');
    state.benchmarkAvailable = report.available === true;
    $('benchmark-run-button').hidden = !state.benchmarkAvailable;
    $('benchmark-run-button').disabled = !state.benchmarkAvailable;
    const details = [
      ['Dataset', report.dataset || 'NFCorpus'],
      ['Protocol', report.protocol || 'BEIR corpus, queries, and test qrels; direct BM25 only'],
      ['Split', report.split || 'test']
    ];
    if (state.benchmarkAvailable) {
      details.push(['Documents', report.document_count ?? '—']);
      details.push(['Queries', report.query_count ?? '—']);
      details.push(['Judged queries', report.judged_query_count ?? '—']);
      if (report.license_statement) details.push(['Declared license terms', report.license_statement]);
      if (report.citation) details.push(['Citation', report.citation]);
    }
    const sourceLink = /^https?:\/\//i.test(report.source_url || '') ? `<a href="${escapeHtml(report.source_url)}" target="_blank" rel="noopener noreferrer">Dataset source page ↗</a>` : '';
    const hashes = report.file_hashes && typeof report.file_hashes === 'object'
      ? `<details class="trace-panel"><summary>Verified file hashes <span>Local SHA-256 values</span></summary><div class="trace-content"><dl>${Object.entries(report.file_hashes).map(([name, hash]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(hash)}</dd></div>`).join('')}</dl></div></details>`
      : '';
    $('benchmark-status-output').innerHTML = `<div class="benchmark-state ${state.benchmarkAvailable ? 'available' : 'unavailable'}"><span class="benchmark-indicator" aria-hidden="true"></span><strong>${state.benchmarkAvailable ? 'Dataset available and hash matched' : 'Benchmark not available locally'}</strong></div>${!state.benchmarkAvailable && report.reason ? `<p class="benchmark-reason">${escapeHtml(report.reason)}</p>` : ''}<dl class="benchmark-details">${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${sourceLink ? `<p class="source-link">${sourceLink}</p>` : ''}${hashes}<p class="field-hint">Dataset availability and file hashes are checked locally. Any license statement is supplied by the dataset manifest and requires your own review.</p>`;
  } catch (error) {
    state.benchmarkAvailable = false;
    $('benchmark-run-button').hidden = true;
    $('benchmark-run-button').disabled = true;
    $('benchmark-status-output').innerHTML = errorPanel(error, false);
  } finally { setBusy(button, false, 'Checking…', 'Refresh benchmark status'); }
}

async function runBenchmarkEvaluation() {
  if (!state.benchmarkAvailable) return;
  const button = $('benchmark-run-button');
  setBusy(button, true, 'Running benchmark…', 'Run direct BM25 benchmark');
  $('benchmark-evaluation-output').innerHTML = '<div class="loading-state" role="status">Evaluating direct BM25 on the local NFCorpus test split. The first run can take up to two minutes…</div>';
  try {
    const report = await json('/api/benchmark/evaluation?k=10', {}, 120000);
    const metric = value => Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '—';
    const manifest = report.run_manifest && typeof report.run_manifest === 'object'
      ? `<details class="trace-panel"><summary>Run manifest <span>Inspect protocol and file hashes</span></summary><pre class="benchmark-manifest">${escapeHtml(JSON.stringify(report.run_manifest, null, 2))}</pre></details>`
      : '';
    $('benchmark-evaluation-output').innerHTML = `<div class="benchmark-result"><p class="panel-kicker">LOCAL BENCHMARK RUN</p><h3>Direct BM25 · ${escapeHtml(report.dataset)} · ${escapeHtml(report.split)}</h3><p class="field-hint">${escapeHtml(report.judged_query_count ?? report.query_count)} judged queries · cutoff ${escapeHtml(report.k)} · ${escapeHtml(report.kind)}</p><div class="benchmark-metrics"><div><span>Mean recall@${escapeHtml(report.k)}</span><strong>${metric(report.metrics?.mean_recall_at_k)}</strong></div><div><span>Mean MRR@${escapeHtml(report.k)}</span><strong>${metric(report.metrics?.mean_mrr_at_k)}</strong></div><div><span>Mean nDCG@${escapeHtml(report.k)}</span><strong>${metric(report.metrics?.mean_ndcg_at_k)}</strong></div></div>${manifest}<p class="field-hint">This run is a lexical baseline on the local benchmark test split. It does not validate adaptive routing or clinical decisions.</p></div>`;
  } catch (error) {
    $('benchmark-evaluation-output').innerHTML = errorPanel(error, false);
  } finally { setBusy(button, false, 'Running benchmark…', 'Run direct BM25 benchmark'); }
}

async function runDiagnostics() {
  const button = $('diagnostic-button');
  setBusy(button, true, 'Checking…', 'Run fixture checks');
  $('diagnostic-output').innerHTML = '<div class="loading-state compact" role="status">Checking API routes and date filtering…</div>';
  try {
    const status = await json('/api/status');
    const caseId = $('case-select').value;
    const early = await json(`/api/cases/${encodeURIComponent(caseId)}?as_of=1900-01-01`);
    const current = await json(`/api/cases/${encodeURIComponent(caseId)}?as_of=${encodeURIComponent($('as-of').value)}`);
    const context = { case_id: caseId, as_of: $('as-of').value, question: current.suggested_question, corpus: 'fictional-demo-v1' };
    const routes = ['direct_bm25', 'expanded_bm25', 'adaptive'];
    const responses = await Promise.all(routes.map(route => runSearch(route, context)));
    const checks = [
      { label: 'API status responds', pass: status.project === 'MedOrchestrate' },
      { label: 'All three routes return a trace', pass: responses.every(response => response.trace && Array.isArray(response.results)) },
      { label: 'Cutoff excludes facts from the future', pass: early.facts.length === 0 && current.facts.every(fact => fact.available_on <= current.as_of) },
      { label: 'Routes use the same invented corpus', pass: responses.every(response => response.trace.corpus === status.corpus) }
    ];
    $('diagnostic-output').innerHTML = `<div class="diagnostic-list">${checks.map(check => `<div class="${check.pass ? 'diagnostic-pass' : 'diagnostic-fail'}"><span aria-hidden="true">${check.pass ? '✓' : '×'}</span>${escapeHtml(check.label)}</div>`).join('')}</div><p class="field-hint">Diagnostic only · ${checks.filter(check => check.pass).length}/${checks.length} checks passed · No relevance judgments used.</p>`;
  } catch (error) {
    $('diagnostic-output').innerHTML = errorPanel(error, false);
  } finally { setBusy(button, false, 'Checking…', 'Run fixture checks'); }
}

async function initialize() {
  const initVersion = ++state.initVersion;
  const mode = transport.mode;
  const previousCase = $('case-select').value;
  const previousDate = $('as-of').value;
  state.currentCase = null;
  $('patient-context').textContent = 'Loading patient context…';
  showConnection(false, mode === 'demo' ? 'Loading offline demo…' : 'Connecting to local backend…');
  setControlsEnabled(false);
  try {
    const [status, rows] = await Promise.all([json('/api/status'), json('/api/cases')]);
    if (initVersion !== state.initVersion) return;
    if (!Array.isArray(rows) || !rows.length) throw new Error('The API returned no fictional cases.');
    const corpusResponse = await json('/api/corpora');
    if (initVersion !== state.initVersion) return;
    if (!Array.isArray(corpusResponse.corpora) || !corpusResponse.corpora.length) throw new Error('No source corpus is available from the selected engine.');
    state.cases = rows;
    state.corpora = corpusResponse.corpora;
    state.importError = corpusResponse.import_error || '';
    $('case-count').textContent = String(status.cases);
    $('doc-count').textContent = String(status.documents);
    $('route-count').textContent = String(status.available_routes.length);
    $('case-select').innerHTML = rows.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`).join('');
    if (rows.some(row => row.id === previousCase)) $('case-select').value = previousCase;
    $('search-case-select').innerHTML = $('case-select').innerHTML;
    $('corpus').innerHTML = state.corpora.map(row => `<option value="${escapeHtml(row.id)}">${row.id === 'fictional-demo-v1' ? 'Fictional demonstration' : 'Imported local records · unverified'} (${escapeHtml(row.documents ?? '—')} records)</option>`).join('');
    $('corpus-note').textContent = [state.corpora[0]?.provenance_note, state.importError ? `Imported corpus unavailable: ${state.importError}` : ''].filter(Boolean).join(' ');
    const now = new Date();
    $('as-of').value = previousDate || [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const details = [['Data mode', mode === 'demo' ? 'Demo Data · offline fictional fixture' : 'Live API · local Flask backend'], ['Corpus', status.corpus], ['Engine', mode === 'demo' ? status.engine : 'Existing Python BM25 and adaptive rule'], ['Available strategies', status.available_routes.map(route => routeNames[route] || route).join(', ')], ['Unavailable case-search models', (status.unavailable_routes || []).join(', ') || 'Not reported']];
    $('system-details').innerHTML = details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
    for (const option of $('route').options) option.disabled = !status.available_routes.includes(option.value);
    if (!status.available_routes.includes($('route').value)) $('route').value = status.available_routes[0];
    setControlsEnabled(true);
    await loadCase();
    if (initVersion !== state.initVersion) return;
    if (!state.currentCase) throw new Error('Patient context could not load from the selected engine. Retry the connection.');
    showConnection(true, mode === 'demo' ? 'Demo Data ready · offline fixture' : 'Local API connected · fictional case corpus');
    loadBenchmarkStatus();
  } catch (error) {
    if (initVersion !== state.initVersion) return;
    setControlsEnabled(false);
    showConnection(false, 'Local API unavailable');
    const panel = errorPanel(error, true);
    $('case-detail').innerHTML = panel;
    $('search-output').innerHTML = panel;
    $('compare-output').innerHTML = panel;
    $('diagnostic-output').innerHTML = panel;
    $('evaluation-output').innerHTML = panel;
    $('benchmark-status-output').innerHTML = panel;
    $('benchmark-evaluation-output').innerHTML = '';
    $('case-count').textContent = '—';
    $('doc-count').textContent = '—';
    $('route-count').textContent = '—';
    $('system-details').textContent = 'Selected engine unavailable. No demonstration fallback has been used.';
    $('patient-context').textContent = 'Patient context unavailable in the selected mode.';
    if (!$('dashboard-error')) {
      const holder = document.createElement('div');
      holder.id = 'dashboard-error';
      $('dashboard').querySelector('.hero').after(holder);
    }
    $('dashboard-error').innerHTML = panel;
  }
}

function renderSessions() {
  $('recent-sessions').innerHTML = sessions.length ? sessions.map((row, i) => `<button class="session-row" type="button" data-session="${i}"><strong>${escapeHtml(row.question)}</strong><span>${escapeHtml(row.case_id)} · ${escapeHtml(routeNames[row.route] || row.route)} · ${escapeHtml(row.mode || 'demo')} · ${escapeHtml(row.at || '')}</span></button>`).join('') : '<div class="empty-state compact">Your searches will appear here.</div>';
}
function rememberSession(context, route) {
  sessions = [{ ...context, route, mode: transport.mode, at: new Date().toISOString() }, ...sessions].slice(0, 10);
  try { localStorage.setItem('medorchestrate_sessions_v1', JSON.stringify(sessions)); } catch { /* Retrieval does not depend on storage. */ }
  renderSessions();
}
async function changeMode() {
  transport.setMode($('data-mode').value);
  ++state.contextVersion;
  $('dashboard-error')?.remove();
  $('mode-badge').textContent = transport.mode === 'demo' ? 'Demo Data' : 'Live API';
  $('mode-description').textContent = transport.mode === 'demo' ? 'Fictional cases and records. No internet or AI API required.' : 'Calls the local Flask endpoints. This mode is not an external PubMed or model service.';
  clearOutputs();
  $('evaluation-output').innerHTML = '';
  await initialize();
}

window.addEventListener('hashchange', () => setPage(location.hash.slice(1)));
document.addEventListener('click', event => {
  const session = event.target.closest('[data-session]');
  if (session) {
    const row = sessions[Number(session.dataset.session)];
    if (!row || !state.cases.some(item => item.id === row.case_id)) return;
    $('case-select').value = row.case_id;
    $('as-of').value = row.as_of;
    $('question').value = row.question;
    state.questionEdited = true;
    if (Array.from($('route').options).some(option => option.value === row.route && !option.disabled)) $('route').value = row.route;
    loadCase(); location.hash = '#search';
  }
  if (event.target.closest('.retry-button')) {
    event.preventDefault();
    $('dashboard-error')?.remove();
    initialize();
  }
});
$('data-mode').addEventListener('change', changeMode);
$('search-case-select').addEventListener('change', () => { $('case-select').value = $('search-case-select').value; loadCase(); });
$('search-as-of').addEventListener('change', () => { $('as-of').value = $('search-as-of').value; loadCase(); });
$('clear-sessions').addEventListener('click', () => { sessions = []; try { localStorage.removeItem('medorchestrate_sessions_v1'); } catch {} renderSessions(); });
$('case-select').addEventListener('change', () => loadCase());
$('as-of').addEventListener('change', () => loadCase());
$('question').addEventListener('input', () => {
  state.questionEdited = true;
  updateContexts();
  clearOutputs();
});
$('route').addEventListener('change', () => {
  const help = {
    adaptive: 'A simple rule chooses a BM25 route based on question length and available facts.',
    direct_bm25: 'Searches the question exactly as entered with BM25.',
    expanded_bm25: 'Adds terms from facts available by the selected date, then searches with BM25.'
  };
  $('route-help').textContent = help[$('route').value];
  $('search-output').innerHTML = '<div class="empty-state">The route changed. Run a search to see current results.</div>';
});
$('corpus').addEventListener('change', () => {
  $('evaluation-output').innerHTML = '';
  const corpus = state.corpora.find(row => row.id === $('corpus').value);
  $('corpus-note').textContent = [corpus?.provenance_note || 'Source provenance unavailable.', state.importError ? `Imported corpus unavailable: ${state.importError}` : ''].filter(Boolean).join(' ');
  updateContexts();
  clearOutputs();
});
$('search-form').addEventListener('submit', submitSearch);
$('compare-button').addEventListener('click', compareRoutes);
$('diagnostic-button').addEventListener('click', runDiagnostics);
$('evaluation-button').addEventListener('click', loadEvaluation);
$('benchmark-refresh-button').addEventListener('click', loadBenchmarkStatus);
$('benchmark-run-button').addEventListener('click', runBenchmarkEvaluation);
setPage(location.hash.slice(1));
renderSessions();
initialize();

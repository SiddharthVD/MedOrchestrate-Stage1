const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const routeNames = { direct_bm25: 'Direct BM25', expanded_bm25: 'Expanded BM25', adaptive: 'Adaptive rule' };
const pages = new Set(['dashboard', 'cases', 'search', 'compare', 'evaluation']);
const state = { cases: [], corpora: [], importError: '', currentCase: null, questionEdited: false, contextVersion: 0 };

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

async function json(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`Server returned an unreadable response (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The local API did not respond within 15 seconds.');
    if (error instanceof TypeError) throw new Error('Cannot reach the local API. Start the MedOrchestrate server, then retry.');
    throw error;
  } finally { clearTimeout(timer); }
}

function setControlsEnabled(enabled) {
  ['case-select', 'as-of', 'question', 'route', 'corpus', 'search-button', 'compare-button', 'diagnostic-button', 'evaluation-button'].forEach(id => {
    $(id).disabled = !enabled;
  });
}

function selectedContext() {
  return { case_id: $('case-select').value, as_of: $('as-of').value, question: $('question').value.trim(), corpus: $('corpus').value };
}

function updateContexts() {
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
    $('case-detail').innerHTML = `<article class="panel case-card"><div class="section-heading"><div><p class="panel-kicker">FICTIONAL CASE</p><h2>${escapeHtml(data.name)}</h2></div><span class="count-pill">${facts.length} available fact${facts.length === 1 ? '' : 's'}</span></div><p>${escapeHtml(data.description)}</p><h3>Facts available by ${escapeHtml(data.as_of)}</h3><div class="fact-list">${facts.map(fact => `<div class="fact"><span>${escapeHtml(fact.label)}</span><span class="meta">Available ${escapeHtml(fact.available_on)}</span></div>`).join('') || '<div class="empty-state compact">No facts were available on this date. Adaptive routing will use direct BM25.</div>'}</div><p class="field-hint">Suggested question: ${escapeHtml(data.suggested_question)}</p></article>`;
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
  return `<div class="result-summary"><span class="count-pill">${(data.results || []).length} matching records</span><span>Executed ${escapeHtml(routeNames[data.executed_route] || data.executed_route)}</span><span>${escapeHtml(data.trace?.elapsed_ms ?? '—')} ms on this machine</span><span>${escapeHtml(data.trace?.eligible_documents ?? '—')} date eligible records</span></div>`;
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
  } catch (error) {
    $('search-output').innerHTML = errorPanel(error, false);
  } finally { setBusy(button, false, 'Searching…', 'Run search'); }
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
    $('compare-output').innerHTML = `<div class="compare-grid">${routes.map((route, index) => {
      const data = response.comparisons[route];
      return `<article class="compare-card"><p class="panel-kicker">${index === 2 ? 'RULE SELECTED' : 'FIXED BASELINE'}</p><h2>${routeNames[route]}</h2>${summary(data)}<p class="query-line"><strong>Query used</strong> ${escapeHtml(data.query_used)}</p>${resultCards(data, true)}${traceCard(data)}</article>`;
    }).join('')}</div><div class="fixture-banner"><strong>How to read this</strong><span>These are local rankings of ${context.corpus === 'fictional-demo-v1' ? 'invented fixture records' : 'user supplied, unverified records'}. Differences do not establish clinical retrieval quality.</span></div>`;
  } catch (error) {
    $('compare-output').innerHTML = errorPanel(error, false);
  } finally { setBusy(button, false, 'Comparing…', 'Compare three routes'); }
}

async function loadEvaluation() {
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

async function runDiagnostics() {
  const button = $('diagnostic-button');
  setBusy(button, true, 'Checking…', 'Run fixture checks');
  $('diagnostic-output').innerHTML = '<div class="loading-state compact" role="status">Checking API routes and date filtering…</div>';
  try {
    const status = await json('/api/status');
    const caseId = $('case-select').value;
    const early = await json(`/api/cases/${encodeURIComponent(caseId)}?as_of=1900-01-01`);
    const current = await json(`/api/cases/${encodeURIComponent(caseId)}?as_of=${encodeURIComponent($('as-of').value)}`);
    const context = { case_id: caseId, as_of: $('as-of').value, question: current.suggested_question };
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
  showConnection(false, 'Connecting to local API…');
  setControlsEnabled(false);
  try {
    const [status, rows] = await Promise.all([json('/api/status'), json('/api/cases')]);
    if (!Array.isArray(rows) || !rows.length) throw new Error('The API returned no fictional cases.');
    const corpusResponse = await json('/api/corpora').catch(error => {
      return { import_error: error.message, corpora: [{ id: 'fictional-demo-v1', provenance_note: 'Every record is invented for this software demonstration.' }] };
    });
    state.cases = rows;
    state.corpora = corpusResponse.corpora;
    state.importError = corpusResponse.import_error || '';
    $('case-count').textContent = String(status.cases);
    $('doc-count').textContent = String(status.documents);
    $('route-count').textContent = String(status.available_routes.length);
    $('case-select').innerHTML = rows.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`).join('');
    $('corpus').innerHTML = state.corpora.map(row => `<option value="${escapeHtml(row.id)}">${row.id === 'fictional-demo-v1' ? 'Fictional demonstration' : 'Imported local records · unverified'} (${escapeHtml(row.documents ?? '—')} records)</option>`).join('');
    $('corpus-note').textContent = [state.corpora[0]?.provenance_note, state.importError ? `Imported corpus unavailable: ${state.importError}` : ''].filter(Boolean).join(' ');
    const now = new Date();
    $('as-of').value = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    setControlsEnabled(true);
    await loadCase();
    showConnection(true, 'Local API connected · research prototype');
  } catch (error) {
    showConnection(false, 'Local API unavailable');
    const panel = errorPanel(error, true);
    $('case-detail').innerHTML = panel;
    $('search-output').innerHTML = panel;
    $('compare-output').innerHTML = panel;
    $('diagnostic-output').innerHTML = panel;
    $('evaluation-output').innerHTML = panel;
    $('case-count').textContent = '—';
    $('doc-count').textContent = '—';
    $('route-count').textContent = '—';
    if (!$('dashboard-error')) {
      const holder = document.createElement('div');
      holder.id = 'dashboard-error';
      $('dashboard').querySelector('.hero').after(holder);
    }
    $('dashboard-error').innerHTML = panel;
  }
}

window.addEventListener('hashchange', () => setPage(location.hash.slice(1)));
document.addEventListener('click', event => {
  if (event.target.closest('.retry-button')) {
    event.preventDefault();
    $('dashboard-error')?.remove();
    initialize();
  }
});
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
  const corpus = state.corpora.find(row => row.id === $('corpus').value);
  $('corpus-note').textContent = [corpus?.provenance_note || 'Source provenance unavailable.', state.importError ? `Imported corpus unavailable: ${state.importError}` : ''].filter(Boolean).join(' ');
  updateContexts();
  clearOutputs();
});
$('search-form').addEventListener('submit', submitSearch);
$('compare-button').addEventListener('click', compareRoutes);
$('diagnostic-button').addEventListener('click', runDiagnostics);
$('evaluation-button').addEventListener('click', loadEvaluation);
setPage(location.hash.slice(1));
initialize();

/* MedOrchestrate research workspace. No patient data or external analytics. */
const R = window.MedResearch;
const $ = id => document.getElementById(id);
const escapeHtml = R.escapeHtml;
const COLLECTIONS_KEY = 'medorchestrate_research_collections_v1';
const HISTORY_KEY = 'medorchestrate_research_history_v1';
const state = {
  snapshot: null, snapshotDocs: [], docs: [], catalog: new Map(), topics: [],
  results: [], selectedId: '', compareIds: new Set(), graph: { nodes: [], edges: [] },
  collections: { version: 1, collections: [] }, activeCollectionId: '', history: [],
  researchWorker: null, modelWorker: null, modelReady: false, modelMeta: null,
  pending: new Map(), requestId: 0, embeddingCache: new Map(), snapshotEmbeddings: new Map(), searchToken: 0, searching: false,
  lastQuery: '', lastSource: 'snapshot'
};

function status(message, kind = 'info') {
  $('search-status').textContent = message;
  $('search-status').className = 'status-box ' + kind;
}

function setView(name) {
  const aliases = { dashboard: 'discover', search: 'discover' };
  const target = ['discover', 'map', 'collections', 'compare', 'history'].includes(aliases[name] || name) ? aliases[name] || name : 'discover';
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== target; view.classList.toggle('active', view.id === target); });
  document.querySelectorAll('.nav').forEach(link => {
    const active = link.dataset.view === target;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  const title = { discover: 'Discover', map: 'Evidence map', collections: 'Collections', compare: 'Compare studies', history: 'Search history' }[target];
  $('view-name').textContent = title;
  document.title = title + ' · MedOrchestrate';
  if (target === 'map') renderGraph();
  if (target === 'collections') renderCollections();
  if (target === 'compare') renderCompare();
  if (target === 'history') renderHistory();
}

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; }
}
function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function announceCollection(message, error = false) {
  $('collection-status').textContent = message;
  $('collection-status').className = error ? 'inline-alert error' : 'inline-alert success';
}
function download(name, content, mime = 'text/plain') {
  const objectUrl = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = objectUrl; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
function trustedLink(url, label, className = '') {
  const href = R.safeUrl(url);
  return href ? `<a class="${className}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>` : '';
}
function short(value, length = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? text.slice(0, length - 1) + '…' : text;
}
function routeLabel(route) { return ({ lexical: 'Lexical BM25', semantic: 'Trained model similarity', hybrid: 'Hybrid RRF' })[route] || route; }
function paperAuthors(doc) { return doc.authors.length ? short(doc.authors.slice(0, 3).join(', '), 110) + (doc.authors.length > 3 ? ' et al.' : '') : 'Authors not listed'; }
function paperMeta(doc) { return [paperAuthors(doc), doc.journal, doc.year].filter(Boolean).join(' · '); }
function citationLine(doc) { return [doc.title, paperAuthors(doc), doc.journal, doc.year].filter(Boolean).join('. '); }

async function loadSnapshot() {
  try {
    const response = await fetch('./data/research-corpus.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Snapshot returned HTTP ${response.status}`);
    const data = await response.json();
    if (!data || !Array.isArray(data.documents) || data.documents.length === 0) throw new Error('Research snapshot is empty or malformed');
    state.snapshot = data;
    state.snapshotDocs = R.uniqueDocuments(data.documents);
    state.docs = state.snapshotDocs;
    state.catalog = new Map(state.docs.map(doc => [doc.id, doc]));
    state.topics = Array.isArray(data.topics) ? data.topics.filter(topic => topic && topic.label && topic.query) : [];
    $('snapshot-status').textContent = `${state.snapshotDocs.length} source records · snapshot`;
    $('snapshot-status').classList.add('ready');
    $('activate-model').disabled = false;
    renderTopics();
    initializeResearchWorker();
    status('Snapshot ready. Search a topic; live Europe PMC will be attempted when selected.');
  } catch (error) {
    $('snapshot-status').textContent = 'Snapshot unavailable';
    $('snapshot-status').classList.add('error');
    status('The research snapshot could not load: ' + error.message, 'error');
    $('topic-grid').innerHTML = '<p class="muted">Topic suggestions are unavailable.</p>';
  }
}

function renderTopics() {
  const topics = state.topics.slice(0, 8);
  $('topic-count').textContent = topics.length ? topics.length + ' curated starting points' : '';
  $('topic-grid').innerHTML = topics.length ? topics.map((topic, index) =>
    `<button class="topic-card" type="button" data-topic="${index}"><span class="topic-icon" aria-hidden="true">${['✦', '◈', '◇', '✳'][index % 4]}</span><span class="topic-category">${escapeHtml(topic.category || 'Research topic')}</span><strong>${escapeHtml(topic.label)}</strong><span>Explore papers <b aria-hidden="true">→</b></span></button>`
  ).join('') : '<p class="muted">Enter a topic above to begin.</p>';
}

function initializeResearchWorker() {
  if (!('Worker' in window)) return;
  try {
    const worker = new Worker('./research-worker.js');
    worker.onmessage = event => {
      const message = event.data || {};
      const pending = state.pending.get('research:' + message.id);
      if (!pending) return;
      state.pending.delete('research:' + message.id);
      clearTimeout(pending.timer);
      if (message.type === 'error') pending.reject(new Error(message.error || 'Research worker failed'));
      else pending.resolve(message.result);
    };
    worker.onerror = () => {
      state.researchWorker = null;
      for (const [key, pending] of state.pending) {
        if (key.startsWith('research:')) { clearTimeout(pending.timer); pending.reject(new Error('Research worker unavailable')); state.pending.delete(key); }
      }
    };
    state.researchWorker = worker;
    workerCall('research', 'init', { documents: state.docs }).catch(() => { state.researchWorker = null; });
  } catch { state.researchWorker = null; }
}

function workerCall(kind, type, payload, timeoutMs = 120000) {
  const worker = kind === 'model' ? state.modelWorker : state.researchWorker;
  if (!worker) return Promise.reject(new Error(kind === 'model' ? 'Model worker unavailable' : 'Research worker unavailable'));
  const id = ++state.requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { state.pending.delete(kind + ':' + id); reject(new Error('Worker timed out')); }, timeoutMs);
    state.pending.set(kind + ':' + id, { resolve, reject, timer });
    worker.postMessage({ id, type, ...payload });
  });
}

async function activateModel() {
  if (state.modelReady) return true;
  const button = $('activate-model');
  button.disabled = true;
  button.textContent = 'Loading model…';
  $('model-status').textContent = 'Loading trained model files in this browser. Size is shown by the model loader.';
  try {
    if (!('Worker' in window)) throw new Error('This browser does not support model workers');
    if (!state.modelWorker) {
      const worker = new Worker('./model-worker.js', { type: 'module' });
      worker.onmessage = event => {
        const message = event.data || {};
        if (message.type === 'progress') { $('model-status').textContent = String(message.message || 'Loading trained model…'); return; }
        const pending = state.pending.get('model:' + message.id);
        if (!pending) return;
        state.pending.delete('model:' + message.id);
        clearTimeout(pending.timer);
        if (message.type === 'error') pending.reject(new Error(message.error || 'Model inference failed'));
        else if (message.type === 'result') pending.resolve(message);
      };
      worker.onerror = () => {
        state.modelReady = false;
        $('model-status').textContent = 'Model worker failed. Lexical search is still available.';
        for (const [key, pending] of state.pending) {
          if (key.startsWith('model:')) { clearTimeout(pending.timer); pending.reject(new Error('Model worker failed')); state.pending.delete(key); }
        }
      };
      state.modelWorker = worker;
    }
    const warm = await workerCall('model', 'init', {}, 180000);
    if (!warm.model?.version || warm.model.dimensions !== 384) throw new Error('Model manifest is incomplete');
    state.modelMeta = warm.model;
    await loadSnapshotEmbeddings();
    state.modelReady = true;
    $('model-status').textContent = state.snapshotEmbeddings.size
      ? `Model ready · ${state.snapshotEmbeddings.size} snapshot study vectors`
      : 'Model ready · snapshot vectors will be generated locally';
    button.textContent = 'Model ready';
    button.classList.add('ready');
    return true;
  } catch (error) {
    state.modelReady = false;
    $('model-status').textContent = 'Model unavailable: ' + error.message + '. Lexical search remains available.';
    button.textContent = 'Retry model load';
    button.disabled = false;
    return false;
  }
}

async function loadSnapshotEmbeddings() {
  state.snapshotEmbeddings.clear();
  try {
    const response = await fetch('./data/research-embeddings.json');
    if (!response.ok) throw new Error('Precomputed vectors not published');
    const payload = await response.json();
    if (payload.model_version !== state.modelMeta?.version || payload.model_sha256 !== state.modelMeta?.sha256 || payload.corpus_version !== state.snapshot?.version || payload.corpus_updated_at !== state.snapshot?.updated_at || payload.dimensions !== 384 || !Array.isArray(payload.documents)) {
      throw new Error('Precomputed vectors do not match the active model and corpus');
    }
    const known = new Set(state.snapshotDocs.map(doc => doc.id));
    for (const row of payload.documents) {
      if (!known.has(row.id) || !Array.isArray(row.embedding) || row.embedding.length !== 384 || row.embedding.some(value => !Number.isFinite(value))) continue;
      state.snapshotEmbeddings.set(row.id, row.embedding);
    }
  } catch (error) {
    $('model-status').textContent = 'Model ready; ' + error.message + '. Missing vectors will be generated locally.';
  }
}

function modelKey(doc) {
  const version = String(state.modelMeta?.version || state.modelMeta?.model_version || JSON.stringify(state.modelMeta || {}));
  return version + '|' + doc.id + '|' + doc.title + '|' + doc.abstract;
}
async function encodeTexts(texts) {
  const response = await workerCall('model', 'encode', { texts }, 180000);
  if (!Array.isArray(response.embeddings) || response.embeddings.length !== texts.length ||
      response.embeddings.some(row => !Array.isArray(row) || row.length !== 384 || row.some(value => !Number.isFinite(value)))) {
    throw new Error('Model returned invalid embeddings');
  }
  state.modelMeta = response.model || state.modelMeta;
  return response.embeddings;
}
async function modelRerank(query, candidates, route) {
  const queryEmbedding = (await encodeTexts([query]))[0];
  const embeddings = new Array(candidates.length);
  const missing = [];
  candidates.forEach((row, index) => {
    const value = row.doc.source === 'live-europe-pmc'
      ? state.embeddingCache.get(modelKey(row.doc))
      : state.snapshotEmbeddings.get(row.doc.id) || state.embeddingCache.get(modelKey(row.doc));
    if (value) embeddings[index] = value;
    else missing.push({ index, row });
  });
  for (let offset = 0; offset < missing.length; offset += 8) {
    const batch = missing.slice(offset, offset + 8);
    const texts = batch.map(item => item.row.doc.title + ' ' + item.row.doc.abstract);
    const vectors = await encodeTexts(texts);
    batch.forEach((item, index) => {
      embeddings[item.index] = vectors[index];
      state.embeddingCache.set(modelKey(item.row.doc), vectors[index]);
    });
    status(`Model reranking ${Math.min(offset + 8, missing.length)} of ${missing.length} uncached candidates…`, 'loading');
  }
  return R.rerank(candidates, queryEmbedding, embeddings, route);
}

async function fetchLive(topic, yearFrom, yearTo) {
  if (location.pathname.startsWith('/research/')) {
    const params = new URLSearchParams({query: topic, mode: 'live', limit: '40'});
    if (yearFrom) params.set('year_from', yearFrom);
    if (yearTo) params.set('year_to', yearTo);
    if ($('publication-type').value !== 'all') params.set('publication_type', $('publication-type').value);
    const response = await fetch('/api/research/search?' + params, {signal: AbortSignal.timeout(45000)});
    const output = await response.json();
    if (!response.ok) throw new Error(output.error || 'Local research API failed');
    return R.uniqueDocuments(output.results.map(doc => ({...doc, source: 'live-europe-pmc'})));
  }
  const query = R.europePmcQuery(topic);
  const terms = [query];
  if (yearFrom || yearTo) terms.push(`FIRST_PDATE:[${yearFrom || 1900}-01-01 TO ${yearTo || new Date().getFullYear()}-12-31]`);
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  url.search = new URLSearchParams({ query: terms.join(' AND '), format: 'json', resultType: 'core', pageSize: '50' }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url.href, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Europe PMC returned HTTP ' + response.status);
    const payload = await response.json();
    const rows = payload.resultList?.result;
    if (!Array.isArray(rows)) throw new Error('Europe PMC returned an unexpected response');
    return R.uniqueDocuments(rows.map(R.fromEuropePmc).filter(Boolean));
  } finally { clearTimeout(timer); }
}

async function lexicalRank(query, docs, filters) {
  if (state.researchWorker) {
    try {
      await workerCall('research', 'init', { documents: docs }, 30000);
      const result = await workerCall('research', 'search', { query, filters, limit: 150 }, 30000);
      const map = new Map(docs.map(doc => [doc.id, doc]));
      return { ranked: result.matches.map(row => ({ doc: map.get(row.id), lexical: row.lexical })).filter(row => row.doc), filteredCount: result.filtered_count };
    } catch { state.researchWorker = null; }
  }
  const filtered = R.filterDocuments(docs, filters);
  return { ranked: R.bm25(query, filtered).slice(0, 150), filteredCount: filtered.length };
}

function getFilters() {
  const from = $('year-from').value;
  const to = $('year-to').value;
  const current = new Date().getFullYear();
  if ((from && (+from < 1900 || +from > current)) || (to && (+to < 1900 || +to > current)) || (from && to && +from > +to)) throw new Error('Choose a valid publication year range');
  return { yearFrom: from, yearTo: to, type: $('publication-type').value, openAccess: false };
}

async function runSearch(topic = $('topic-input').value.trim()) {
  topic = String(topic || '').trim();
  if (topic.length < 2 || topic.length > 200) { status('Enter a research topic of 2 to 200 characters.', 'error'); $('topic-input').focus(); return; }
  if (!state.snapshotDocs.length) { status('Research snapshot is not available. Try reloading the page.', 'error'); return; }
  let filters;
  try { filters = getFilters(); } catch (error) { status(error.message, 'error'); return; }
  const route = $('route-select').value;
  if (route !== 'lexical' && !state.modelReady) {
    status('Enable the trained model in the sidebar before running a model rerank. Lexical BM25 is available now.', 'warning');
    $('activate-model').focus();
    return;
  }
  const token = ++state.searchToken;
  state.searching = true;
  $('search-button').disabled = true;
  $('search-button').textContent = 'Searching…';
  $('results-list').innerHTML = '<div class="loading-card">Looking through publication records…</div>';
  $('detail-panel').innerHTML = '<div class="detail-empty"><span aria-hidden="true">⌕</span><p>Searching source records…</p></div>';
  status('Searching the curated source snapshot…', 'loading');
  try {
    let live = [], liveNote = '';
    if ($('live-search').checked) {
      status('Contacting Europe PMC for current CC BY open-access records…', 'loading');
      try { live = await fetchLive(topic, filters.yearFrom, filters.yearTo); }
      catch (error) { throw new Error('Live Europe PMC is unavailable: ' + error.message + '. Uncheck live search to explicitly use the saved source snapshot. No data fallback was used.'); }
    }
    if (token !== state.searchToken) return;
    const docs = R.uniqueDocuments([...live, ...state.snapshotDocs]);
    state.docs = docs;
    state.catalog = new Map(docs.map(doc => [doc.id, doc]));
    const { ranked, filteredCount } = await lexicalRank(topic, docs, filters);
    if (token !== state.searchToken) return;
    let output = ranked;
    let candidateNote = '';
    if (route !== 'lexical') {
      const snapshotEligible = R.filterDocuments(state.snapshotDocs, filters);
      const liveIds = new Set(live.map(doc => doc.id));
      const liveCandidates = ranked.filter(row => liveIds.has(row.doc.id)).slice(0, 40);
      const lexicalById = new Map(ranked.map(row => [row.doc.id, row.lexical]));
      const candidates = [
        ...snapshotEligible.map(doc => ({ doc, lexical: lexicalById.get(doc.id) || 0 })),
        ...liveCandidates.filter(row => !snapshotEligible.some(doc => doc.id === row.doc.id))
      ];
      status(`Model ranking all ${snapshotEligible.length} eligible snapshot studies and ${liveCandidates.length} live lexical candidates…`, 'loading');
      output = await modelRerank(topic, candidates, route);
      candidateNote = `Model ranked ${snapshotEligible.length} eligible snapshot records${liveCandidates.length ? ' plus ' + liveCandidates.length + ' live lexical candidates' : ''}.`;
    }
    if (token !== state.searchToken) return;
    state.results = output;
    state.lastQuery = topic;
    state.lastSource = live.length ? 'live + snapshot' : 'snapshot';
    state.selectedId = output[0]?.doc.id || '';
    renderResults(route);
    buildMap();
    pushHistory({ topic, route, source: state.lastSource, count: output.length, at: new Date().toISOString() });
    const routeNote = route === 'lexical' ? 'Lexical BM25.' : candidateNote;
    const liveSummary = live.length ? `${live.length} exact-license live records joined the snapshot.` : (liveNote || 'Snapshot only.');
    status(`${output.length} ranked studies from ${filteredCount} filtered records. ${routeNote}. ${liveSummary}`, output.length ? 'success' : 'warning');
    $('result-count').textContent = output.length ? output.length + ' studies' : 'No matches';
  } catch (error) {
    if (token === state.searchToken) {
      state.results = [];
      $('results-list').innerHTML = '<div class="empty-card">Search could not finish. Try lexical BM25 or a shorter topic.</div>';
      status('Search failed: ' + error.message, 'error');
    }
  } finally {
    if (token === state.searchToken) {
      state.searching = false;
      $('search-button').disabled = false;
      $('search-button').innerHTML = 'Search literature <span aria-hidden="true">→</span>';
    }
  }
}

function renderResults(route = $('route-select').value) {
  if (!state.results.length) {
    $('results-list').innerHTML = '<div class="empty-card"><strong>No matching studies.</strong><p>Try a broader topic, a different year range, or all publication types.</p></div>';
    $('detail-panel').innerHTML = '<div class="detail-empty"><span aria-hidden="true">◇</span><h3>Nothing to inspect yet</h3></div>';
    return;
  }
  $('results-list').innerHTML = state.results.slice(0, 50).map((row, index) => {
    const doc = row.doc;
    const source = doc.source === 'live-europe-pmc' ? 'Live Europe PMC' : 'Curated snapshot';
    const selected = doc.id === state.selectedId;
    const compared = state.compareIds.has(doc.id);
    return `<article class="paper-card ${selected ? 'selected' : ''}" data-doc="${escapeHtml(doc.id)}"><div class="paper-head"><span class="paper-index">${String(index + 1).padStart(2, '0')}</span><span class="paper-source">${escapeHtml(source)}</span><span class="paper-license">${escapeHtml(doc.license || 'License not listed')}</span></div><h3><button type="button" data-action="detail" data-id="${escapeHtml(doc.id)}">${escapeHtml(doc.title)}</button></h3><p class="paper-meta">${escapeHtml(paperMeta(doc))}</p><p class="paper-abstract">${escapeHtml(short(doc.abstract, 260) || 'Abstract unavailable. Open the source record.')}</p><div class="paper-footer"><span>${route === 'lexical' ? 'BM25 ' + row.lexical.toFixed(2) : route === 'semantic' ? 'Model cosine ' + row.semantic.toFixed(3) : 'Hybrid ' + row.score.toFixed(3)}</span><div><button class="text-button" type="button" data-action="save" data-id="${escapeHtml(doc.id)}">Save</button><button class="text-button ${compared ? 'chosen' : ''}" type="button" data-action="compare" data-id="${escapeHtml(doc.id)}">${compared ? 'Selected' : 'Compare'}</button></div></div></article>`;
  }).join('');
  renderDetail();
}

function renderDetail() {
  const doc = state.catalog.get(state.selectedId);
  if (!doc) return;
  const source = doc.source === 'live-europe-pmc' ? 'Live Europe PMC' : 'Curated source snapshot';
  const concepts = doc.concepts.slice(0, 14);
  const links = [
    trustedLink(doc.source_url, 'Source record', 'link-button'),
    /^\d+$/.test(doc.pmid) ? trustedLink('https://pubmed.ncbi.nlm.nih.gov/' + doc.pmid + '/', 'PubMed record', 'link-button') : '',
    /^PMC\d+$/.test(doc.pmcid) ? trustedLink('https://pmc.ncbi.nlm.nih.gov/articles/' + doc.pmcid + '/', 'PMC full text', 'link-button') : '',
    trustedLink(doc.fulltext_url, 'Full text', 'link-button'),
    trustedLink(doc.pdf_url, 'PDF', 'link-button')
  ].filter(Boolean);
  $('detail-panel').innerHTML = `<div class="detail-top"><span class="eyebrow">STUDY DETAIL</span><button type="button" class="icon-button" data-action="close-detail" aria-label="Close details">×</button></div><div class="detail-scroll"><div class="detail-badges"><span>${escapeHtml(source)}</span><span>${escapeHtml(doc.license || 'License unlisted')}</span></div><h2>${escapeHtml(doc.title)}</h2><p class="detail-meta">${escapeHtml(paperMeta(doc))}</p><div class="identifier-row">${doc.pmid ? `<span>PMID ${escapeHtml(doc.pmid)}</span>` : ''}${doc.pmcid ? `<span>PMCID ${escapeHtml(doc.pmcid)}</span>` : ''}${doc.doi ? `<span>DOI ${escapeHtml(doc.doi)}</span>` : ''}</div><div class="detail-actions"><button type="button" class="primary small" data-action="save" data-id="${escapeHtml(doc.id)}">Save to collection</button><button type="button" class="secondary small" data-action="compare" data-id="${escapeHtml(doc.id)}">${state.compareIds.has(doc.id) ? 'Remove comparison' : 'Compare'}</button></div><div class="detail-block"><h3>Abstract</h3><p>${escapeHtml(doc.abstract || 'Abstract unavailable in this record. Use the source link to review the publication.')}</p></div><div class="detail-block"><h3>Indexed concepts</h3><div class="concept-tags">${concepts.length ? concepts.map(item => `<span>${escapeHtml(item.label)}</span>`).join('') : '<p class="muted">No concepts supplied for this record.</p>'}</div></div><div class="detail-block"><h3>Publication links</h3><div class="source-links">${links.length ? links.join('') : '<p class="muted">No trusted source link supplied.</p>'}</div><p class="helper">Links come from the source record. Full text and PDF appear only when a legitimate URL was supplied.</p></div><div class="detail-block"><h3>Citation</h3><p class="citation-line">${escapeHtml(citationLine(doc))}</p><div class="detail-actions"><button class="quiet-button" type="button" data-action="bibtex-one" data-id="${escapeHtml(doc.id)}">Download BibTeX</button><button class="quiet-button" type="button" data-action="ris-one" data-id="${escapeHtml(doc.id)}">Download RIS</button></div></div><p class="provenance">${escapeHtml(doc.provenance || 'Source metadata from Europe PMC.')}</p></div>`;
}

function buildMap() {
  state.graph = R.buildGraph(state.results.map(row => row.doc), 12, 12);
  renderGraph();
}

function renderGraph() {
  const { nodes, edges } = state.graph;
  if (!edges.length) {
    $('map-status').textContent = state.results.length ? 'The current studies do not include concept links.' : 'Run a search to build a study–concept map.';
    $('graph-svg').innerHTML = '';
    $('graph-list').innerHTML = '<p class="muted">No connections to show.</p>';
    $('edge-detail').textContent = 'Select a connection to inspect its source study.';
    return;
  }
  $('map-status').textContent = `${nodes.filter(node => node.type === 'study').length} studies · ${nodes.filter(node => node.type === 'concept').length} concepts · ${edges.length} source linked connections`;
  const studies = nodes.filter(node => node.type === 'study');
  const concepts = nodes.filter(node => node.type === 'concept');
  const positions = new Map();
  studies.forEach((node, index) => positions.set(node.id, { x: 680, y: 60 + (index + 0.5) * 440 / studies.length }));
  concepts.forEach((node, index) => positions.set(node.id, { x: 245, y: 60 + (index + 0.5) * 440 / concepts.length }));
  const lines = edges.map((edge, index) => {
    const a = positions.get(edge.from), b = positions.get(edge.to);
    if (!a || !b) return '';
    return `<path class="graph-edge" d="M${a.x},${a.y} C${a.x - 180},${a.y} ${b.x + 180},${b.y} ${b.x},${b.y}" data-edge="${index}" tabindex="0" role="button" aria-label="Connection from study to concept" />`;
  }).join('');
  const circles = nodes.map(node => {
    const p = positions.get(node.id);
    const label = short(node.label, node.type === 'study' ? 35 : 28);
    return `<g class="graph-node ${node.type}" data-node="${escapeHtml(node.id)}" tabindex="0" role="button" aria-label="${escapeHtml(node.type + ': ' + node.label)}"><circle cx="${p.x}" cy="${p.y}" r="${node.type === 'study' ? 11 : 13}" /><text x="${node.type === 'study' ? p.x + 20 : p.x - 22}" y="${p.y + 4}" text-anchor="${node.type === 'study' ? 'start' : 'end'}">${escapeHtml(label)}</text></g>`;
  }).join('');
  $('graph-svg').innerHTML = lines + circles;
  $('graph-list').innerHTML = edges.slice(0, 50).map((edge, index) => {
    const doc = state.catalog.get(edge.study_id);
    const concept = nodes.find(node => node.id === edge.to);
    return `<button type="button" data-edge="${index}"><strong>${escapeHtml(concept?.label || 'Concept')}</strong><span>${escapeHtml(short(doc?.title, 72))}</span></button>`;
  }).join('');
}

function selectGraphEdge(index) {
  const edge = state.graph.edges[index];
  if (!edge) return;
  const doc = state.catalog.get(edge.study_id);
  const concept = state.graph.nodes.find(node => node.id === edge.to);
  $('edge-detail').innerHTML = `<span class="eyebrow">EVIDENCE LINK</span><h3>${escapeHtml(concept?.label || 'Concept')}</h3><p>${escapeHtml(edge.relation || 'Associated')} in <strong>${escapeHtml(doc?.title || 'Source study')}</strong>.</p><p class="helper">${escapeHtml(edge.source || 'Publication metadata')}</p>${trustedLink(edge.source_url, 'Open source record', 'link-button')}`;
  $('graph-svg').querySelectorAll('.graph-edge').forEach((path, i) => path.classList.toggle('active', i === index));
}

function loadCollections() {
  try { state.collections = R.validCollections(loadLocal(COLLECTIONS_KEY, { version: 1, collections: [] })); }
  catch { state.collections = { version: 1, collections: [] }; }
  state.activeCollectionId = state.collections.collections[0]?.id || '';
  const history = loadLocal(HISTORY_KEY, []);
  state.history = Array.isArray(history) ? history.filter(row => row && typeof row.topic === 'string').slice(0, 30) : [];
}
function persistCollections() { if (!saveLocal(COLLECTIONS_KEY, state.collections)) announceCollection('Browser storage is unavailable; export your collection before leaving.', true); }
function collectionById(id) { return state.collections.collections.find(row => row.id === id); }
function activeCollection() { return collectionById(state.activeCollectionId); }
function makeCollection(name) {
  const clean = String(name || '').trim().slice(0, 100);
  if (!clean) throw new Error('Enter a collection name');
  if (state.collections.collections.length >= 50) throw new Error('Collection limit reached');
  const row = { id: 'collection-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), name: clean, created_at: new Date().toISOString(), documents: [] };
  state.collections.collections.push(row);
  state.activeCollectionId = row.id;
  persistCollections();
  renderCollections();
  return row;
}
function saveStudy(id) {
  const doc = state.catalog.get(id);
  if (!doc) return;
  let collection = activeCollection();
  if (!collection) collection = makeCollection('Reading list');
  if (collection.documents.some(row => row.id === doc.id)) { announceCollection('Already in ' + collection.name + '.'); return; }
  collection.documents.push(R.citationMetadata(doc));
  persistCollections();
  announceCollection('Saved to ' + collection.name + '.');
  renderCollections();
}
function renderCollections() {
  const rows = state.collections.collections;
  $('collections-list').innerHTML = rows.length ? rows.map(row => `<button class="collection-row ${row.id === state.activeCollectionId ? 'active' : ''}" type="button" data-collection="${escapeHtml(row.id)}"><span>▤</span><strong>${escapeHtml(row.name)}</strong><small>${row.documents.length}</small></button>`).join('') : '<div class="empty-card">No collections yet. Create one or save a study from Discover.</div>';
  const active = activeCollection();
  if (!active) { $('collection-detail').innerHTML = '<div class="empty-card">Your saved citations will appear here.</div>'; return; }
  $('collection-detail').innerHTML = `<div class="collection-head"><div><p class="eyebrow">YOUR COLLECTION</p><h2>${escapeHtml(active.name)}</h2><span>${active.documents.length} saved studies</span></div><button class="quiet-button danger" type="button" data-action="delete-collection">Delete collection</button></div><div class="export-row"><button class="secondary small" type="button" data-action="export-json">Export JSON</button><button class="secondary small" type="button" data-action="export-bibtex">Export BibTeX</button><button class="secondary small" type="button" data-action="export-ris">Export RIS</button></div><div class="saved-list">${active.documents.length ? active.documents.map(doc => `<div class="saved-item"><div><strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml([doc.authors?.[0], doc.journal, doc.year].filter(Boolean).join(' · '))}</small></div><button type="button" class="icon-button" data-action="remove-saved" data-id="${escapeHtml(doc.id)}" aria-label="Remove ${escapeHtml(doc.title)}">×</button></div>`).join('') : '<div class="empty-card">Save studies from a search to build this collection.</div>'}</div>`;
}
async function importCollections(file) {
  if (!file) return;
  if (file.size > 2_000_000) { announceCollection('Import file is too large (2 MB maximum).', true); return; }
  try {
    const incoming = R.validCollections(JSON.parse(await file.text()));
    let added = 0;
    for (const row of incoming.collections) {
      if (state.collections.collections.length >= 50) break;
      const renamed = { ...row, id: row.id + '-import-' + Date.now().toString(36) + '-' + added };
      state.collections.collections.push(renamed);
      added++;
    }
    if (added) state.activeCollectionId = state.collections.collections.at(-1).id;
    persistCollections();
    renderCollections();
    announceCollection(`Imported ${added} collection${added === 1 ? '' : 's'}; existing collections were preserved.`);
  } catch (error) { announceCollection('Import rejected: ' + error.message, true); }
  $('collection-import-file').value = '';
}
function exportCollection(kind) {
  const active = activeCollection();
  if (!active) return;
  const stem = active.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'collection';
  if (kind === 'json') download(stem + '.json', JSON.stringify({ version: 1, collections: [active] }, null, 2), 'application/json');
  if (kind === 'bibtex') download(stem + '.bib', R.bibtex(active.documents), 'application/x-bibtex');
  if (kind === 'ris') download(stem + '.ris', R.ris(active.documents), 'application/x-research-info-systems');
}

function renderCompare() {
  const docs = [...state.compareIds].map(id => state.catalog.get(id)).filter(Boolean).slice(0, 3);
  if (!docs.length) { $('compare-content').innerHTML = '<div class="status-box">Select up to three studies from Discover to compare them here.</div>'; return; }
  $('compare-content').innerHTML = `<div class="compare-toolbar"><span>${docs.length} of 3 selected</span><button class="quiet-button" type="button" data-action="clear-compare">Clear selection</button></div><div class="compare-grid">${docs.map(doc => `<article class="compare-study"><button class="icon-button" type="button" data-action="compare" data-id="${escapeHtml(doc.id)}" aria-label="Remove study">×</button><span class="paper-source">${escapeHtml(doc.source === 'live-europe-pmc' ? 'Live Europe PMC' : 'Curated snapshot')}</span><h2>${escapeHtml(doc.title)}</h2><p>${escapeHtml(paperMeta(doc))}</p><dl><div><dt>Publication type</dt><dd>${escapeHtml(doc.publication_types.join(', ') || 'Not listed')}</dd></div><div><dt>Year</dt><dd>${escapeHtml(doc.year || 'Not listed')}</dd></div><div><dt>License</dt><dd>${escapeHtml(doc.license || 'Not listed')}</dd></div><div><dt>Indexed concepts</dt><dd>${escapeHtml(doc.concepts.slice(0, 8).map(item => item.label).join(', ') || 'Not supplied')}</dd></div></dl><h3>Abstract</h3><p class="compare-abstract">${escapeHtml(doc.abstract || 'Abstract unavailable.')}</p>${trustedLink(doc.source_url, 'Read source record', 'link-button')}</article>`).join('')}</div><p class="helper">This side-by-side view compares publication metadata. It does not assess study quality or treatment effects.</p>`;
}

function pushHistory(row) {
  state.history = [row, ...state.history.filter(item => !(item.topic === row.topic && item.route === row.route))].slice(0, 30);
  saveLocal(HISTORY_KEY, state.history);
  renderHistory();
}
function renderHistory() {
  $('history-list').innerHTML = state.history.length ? state.history.map((row, index) => `<button class="history-row" type="button" data-history="${index}"><span class="history-mark" aria-hidden="true">↗</span><span><strong>${escapeHtml(row.topic)}</strong><small>${escapeHtml(routeLabel(row.route))} · ${escapeHtml(row.source)} · ${escapeHtml(row.count)} results</small></span><time>${escapeHtml(new Date(row.at).toLocaleDateString())}</time></button>`).join('') : '<div class="empty-card">Your searches will appear here. History stays in this browser.</div>';
}

function handleAction(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === 'detail') { state.selectedId = id; renderResults(); return; }
  if (action === 'close-detail') { $('detail-panel').innerHTML = '<div class="detail-empty"><span aria-hidden="true">▤</span><p>Select a study to inspect it.</p></div>'; return; }
  if (action === 'save') { saveStudy(id); return; }
  if (action === 'compare') {
    if (state.compareIds.has(id)) state.compareIds.delete(id);
    else if (state.compareIds.size < 3) state.compareIds.add(id);
    else { status('Compare up to three studies. Remove one before adding another.', 'warning'); return; }
    renderResults(); renderCompare(); return;
  }
  if (action === 'bibtex-one' || action === 'ris-one') {
    const doc = state.catalog.get(id);
    if (!doc) return;
    const item = R.citationMetadata(doc);
    download(doc.id.replace(/[^a-z0-9_-]/gi, '-') + (action === 'bibtex-one' ? '.bib' : '.ris'), action === 'bibtex-one' ? R.bibtex([item]) : R.ris([item]));
    return;
  }
  if (action === 'remove-saved') {
    const collection = activeCollection();
    if (!collection) return;
    collection.documents = collection.documents.filter(item => item.id !== id);
    persistCollections(); renderCollections(); return;
  }
  if (action === 'delete-collection') {
    const collection = activeCollection();
    if (!collection || !window.confirm('Delete collection "' + collection.name + '" from this browser? Export it first if needed.')) return;
    state.collections.collections = state.collections.collections.filter(item => item.id !== collection.id);
    state.activeCollectionId = state.collections.collections[0]?.id || '';
    persistCollections(); renderCollections(); announceCollection('Collection deleted.'); return;
  }
  if (action === 'export-json') exportCollection('json');
  if (action === 'export-bibtex') exportCollection('bibtex');
  if (action === 'export-ris') exportCollection('ris');
  if (action === 'clear-compare') { state.compareIds.clear(); renderCompare(); renderResults(); }
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (action) { handleAction(action); return; }
  const topic = event.target.closest('[data-topic]');
  if (topic) {
    const item = state.topics[Number(topic.dataset.topic)];
    if (item) { $('topic-input').value = item.query; location.hash = '#discover'; runSearch(item.query); }
    return;
  }
  const collection = event.target.closest('[data-collection]');
  if (collection) { state.activeCollectionId = collection.dataset.collection; renderCollections(); return; }
  const history = event.target.closest('[data-history]');
  if (history) {
    const item = state.history[Number(history.dataset.history)];
    if (item) { $('topic-input').value = item.topic; $('route-select').value = item.route; location.hash = '#discover'; runSearch(item.topic); }
    return;
  }
  const edge = event.target.closest('[data-edge]');
  if (edge) { selectGraphEdge(Number(edge.dataset.edge)); return; }
  const node = event.target.closest('[data-node]');
  if (node && node.dataset.node.startsWith('study:')) {
    state.selectedId = node.dataset.node.slice(6); location.hash = '#discover'; renderResults();
  }
  if (node && node.dataset.node.startsWith('concept:')) {
    const conceptId = node.dataset.node.slice(8);
    const concept = state.graph.nodes.find(item => item.id === node.dataset.node);
    const matching = state.results.filter(row => row.doc.concepts.some(item => item.id === conceptId));
    $('edge-detail').innerHTML = `<span class="eyebrow">CONCEPT EXPLORATION</span><h3>${escapeHtml(concept?.label)}</h3><p>${matching.length} current studies are linked to this concept.</p>${matching.slice(0, 12).map(row => `<p>${trustedLink(row.doc.source_url, row.doc.title, 'link-button')}</p>`).join('')}<p class="helper">Connections describe mentions or indexing, not treatment or causal claims.</p>`;
  }
});
document.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-edge], [data-node]')) {
    event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
});
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
$('search-form').addEventListener('submit', event => { event.preventDefault(); runSearch(); });
$('route-select').addEventListener('change', () => {
  $('route-note').textContent = $('route-select').value === 'lexical'
    ? 'Lexical BM25 searches immediately. Model routes rerank up to 40 lexical candidates after you enable the local model.'
    : 'This route uses the trained local model to rerank up to 40 lexical candidates. Enable it in the sidebar before searching.';
});
$('activate-model').addEventListener('click', activateModel);
$('new-collection-form').addEventListener('submit', event => {
  event.preventDefault();
  try { makeCollection($('collection-name').value); $('collection-name').value = ''; announceCollection('Collection created.'); }
  catch (error) { announceCollection(error.message, true); }
});
$('collection-import-file').addEventListener('change', event => importCollections(event.target.files?.[0]));
$('clear-history').addEventListener('click', () => {
  if (!state.history.length) return;
  if (window.confirm('Clear search history from this browser?')) { state.history = []; saveLocal(HISTORY_KEY, []); renderHistory(); }
});
setView(location.hash.slice(1));
loadCollections();
renderCollections();
renderCompare();
renderHistory();
loadSnapshot();

/* Keeps lexical ranking and graph assembly off the main browser thread. */
importScripts('./research-core.js');
const core = self.MedResearch;
let documents = [];

self.onmessage = event => {
  const { id, type } = event.data || {};
  try {
    let result;
    if (type === 'init') {
      documents = core.uniqueDocuments(event.data.documents || []);
      result = { count: documents.length };
    } else if (type === 'search') {
      const filtered = core.filterDocuments(documents, event.data.filters || {});
      const ranked = core.bm25(event.data.query || '', filtered).slice(0, Math.min(Number(event.data.limit) || 100, 200));
      result = { matches: ranked.map(row => ({ id: row.doc.id, lexical: row.lexical })), filtered_count: filtered.length };
    } else if (type === 'graph') {
      const ids = new Set(event.data.document_ids || []);
      result = core.buildGraph(documents.filter(doc => ids.has(doc.id)), 14, 12);
    } else throw new Error('Unknown research worker request');
    self.postMessage({ id, type: 'result', result });
  } catch (error) {
    self.postMessage({ id, type: 'error', error: String(error.message || error) });
  }
};

/* Browser/Node retrieval core for the explicitly fictional static demonstration. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MedOrchestrateCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STOP = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'with', 'what', 'which', 'how', 'does', 'do', 'among']);
  const ROUTES = ['direct_bm25', 'expanded_bm25', 'adaptive'];

  function strictDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date must use YYYY-MM-DD');
    const date = new Date(value + 'T00:00:00Z');
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date');
    return value;
  }

  function tokens(value) {
    return (String(value).toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => !STOP.has(word));
  }

  function validFacts(caseRow, asOf) {
    const cutoff = strictDate(asOf);
    return caseRow.facts.filter(fact => strictDate(fact.available_on) <= cutoff);
  }

  function expandedQuery(question, facts) {
    const questionTerms = new Set(tokens(question));
    const added = [];
    for (const fact of facts) {
      for (const term of tokens(fact.search_phrase)) {
        if (!questionTerms.has(term) && !added.includes(term)) added.push(term);
      }
    }
    return { query: (question + ' ' + added.join(' ')).trim(), added };
  }

  function counter(words) {
    const counts = new Map();
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    return counts;
  }

  function bm25(query, documents, limit = 10) {
    if (limit < 1) return [];
    const fields = documents.map(doc => tokens(doc.title + ' ' + doc.abstract));
    const lengths = fields.map(words => words.length);
    const average = lengths.reduce((sum, length) => sum + length, 0) / Math.max(lengths.length, 1);
    const frequencies = fields.map(counter);
    const documentFrequency = new Map();
    for (const words of fields) {
      for (const term of new Set(words)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
    const scored = [];
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const counts = frequencies[i];
      const length = lengths[i];
      let score = 0;
      for (const term of new Set(tokens(query))) {
        const n = documentFrequency.get(term) || 0;
        const idf = Math.log(1 + (documents.length - n + 0.5) / (n + 0.5));
        const tf = counts.get(term) || 0;
        if (tf) score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * length / Math.max(average, 1)));
      }
      if (score > 0) scored.push({
        id: doc.id, title: doc.title, source: doc.source, year: doc.year,
        url: doc.url, abstract: doc.abstract, score: Number(score.toFixed(4)),
        fixture: true, published_on: doc.published_on || null, source_type: doc.source_type || null
      });
    }
    return scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
  }

  function runSearch(question, caseRow, asOf, route, documents) {
    strictDate(asOf);
    if (!ROUTES.includes(route)) throw new Error('Unavailable route');
    if (typeof question !== 'string' || !question.trim() || question.length > 500) throw new Error('Question must be 1 to 500 characters');
    const facts = validFacts(caseRow, asOf);
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let selected = route;
    let rationale = 'User selected a fixed route.';
    if (route === 'adaptive') {
      selected = facts.length && tokens(question).length < 12 ? 'expanded_bm25' : 'direct_bm25';
      rationale = selected === 'expanded_bm25'
        ? 'Rule selected expansion for a short question with available patient facts.'
        : 'Rule selected direct BM25 because the question is long or no facts are available.';
    }
    const expansion = selected === 'expanded_bm25' ? expandedQuery(question, facts) : { query: question, added: [] };
    const eligible = documents.filter(doc => (doc.published_on || `${doc.year}-12-31`) <= asOf);
    const results = bm25(expansion.query, eligible);
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      case_id: caseRow.id, question, as_of: asOf, requested_route: route, executed_route: selected,
      query_used: expansion.query, results,
      trace: {
        rationale, available_facts: facts.map(fact => fact.label), added_terms: expansion.added,
        calls: { retrieval: 1, rewrite: 0, rerank: 0, probe: 0 },
        elapsed_ms: Number((end - start).toFixed(3)), corpus: 'fictional-demo-v1',
        eligible_documents: eligible.length, result_count: results.length
      }
    };
  }

  function recallAtK(ranked, relevant, k) {
    const ids = Object.keys(relevant);
    return ids.length ? ranked.slice(0, k).filter(id => Object.prototype.hasOwnProperty.call(relevant, id)).length / ids.length : 0;
  }

  function mrrAtK(ranked, relevant, k) {
    const position = ranked.slice(0, k).findIndex(id => (relevant[id] || 0) > 0);
    return position < 0 ? 0 : 1 / (position + 1);
  }

  function ndcgAtK(ranked, relevant, k) {
    const dcg = grades => grades.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
    const ideal = dcg(Object.values(relevant).sort((a, b) => b - a).slice(0, k));
    return ideal ? dcg(ranked.slice(0, k).map(id => relevant[id] || 0)) / ideal : 0;
  }

  function evaluate(cases, documents, qrels, k = 5) {
    if (k < 1) throw new Error('k must be positive');
    if (qrels.dataset !== 'fictional-demo-v1' || !Array.isArray(qrels.queries) || !qrels.queries.length) throw new Error('Only nonempty fictional demo judgments are supported');
    const caseMap = new Map(cases.map(row => [row.id, row]));
    const routes = {};
    for (const route of ROUTES) {
      const queries = qrels.queries.map(query => {
        const caseRow = caseMap.get(query.case_id);
        if (!caseRow) throw new Error('Unknown case in fictional judgments');
        const result = runSearch(query.question, caseRow, query.as_of, route, documents);
        const ranked = result.results.map(record => record.id);
        return {
          query_id: query.id, executed_route: result.executed_route, ranked_ids: ranked.slice(0, k),
          recall_at_k: recallAtK(ranked, query.relevance, k),
          mrr_at_k: mrrAtK(ranked, query.relevance, k),
          ndcg_at_k: ndcgAtK(ranked, query.relevance, k)
        };
      });
      const mean = key => queries.reduce((sum, row) => sum + row[key], 0) / queries.length;
      routes[route] = {
        mean_recall_at_k: mean('recall_at_k'),
        mean_mrr_at_k: mean('mrr_at_k'),
        mean_ndcg_at_k: mean('ndcg_at_k'),
        queries
      };
    }
    return { dataset: qrels.dataset, annotation: qrels.annotation, query_count: qrels.queries.length, k, routes };
  }

  return { ROUTES, strictDate, tokens, validFacts, expandedQuery, bm25, runSearch, evaluate, recallAtK, mrrAtK, ndcgAtK };
});

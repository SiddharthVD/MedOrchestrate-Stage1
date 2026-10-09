/* Pure research-workspace helpers. Browser global and CommonJS for smoke tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MedResearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STOP = new Set('a an and are as at be by for from how in into is it of on or the these this to using was were what which with'.split(' '));
  const TRUSTED_HOSTS = ['europepmc.org', 'www.ebi.ac.uk', 'ebi.ac.uk', 'pmc.ncbi.nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov', 'doi.org'];
  const MAX_COLLECTIONS = 50;
  const MAX_ITEMS = 500;
  const text = value => String(value ?? '').trim();
  const tokens = value => (text(value).toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => !STOP.has(word));
  const escapeHtml = value => text(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function safeUrl(value) {
    try {
      const parsed = new URL(text(value));
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
      const host = parsed.hostname.toLowerCase();
      if (!TRUSTED_HOSTS.some(allowed => host === allowed || host.endsWith('.' + allowed))) return '';
      return parsed.href;
    } catch { return ''; }
  }

  function normalizeConcept(concept) {
    if (!concept || typeof concept !== 'object') return null;
    const label = text(concept.label).slice(0, 100);
    if (!label) return null;
    return {
      id: text(concept.id || label.toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, 100),
      label, type: text(concept.type || 'topic').slice(0, 40),
      source_url: safeUrl(concept.source_url), relation: text(concept.relation || 'mentioned').slice(0, 80),
      source: text(concept.source || 'record metadata').slice(0, 80)
    };
  }

  function normalizeDocument(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = text(raw.id || raw.pmid || raw.pmcid || raw.doi).slice(0, 120);
    const title = text(raw.title).slice(0, 1000);
    if (!id || !title) return null;
    const authors = Array.isArray(raw.authors)
      ? raw.authors.map(text).filter(Boolean).slice(0, 40)
      : text(raw.authors).split(/,\s*|;\s*/).filter(Boolean).slice(0, 40);
    const concepts = (Array.isArray(raw.concepts) ? raw.concepts : []).map(normalizeConcept).filter(Boolean).slice(0, 30);
    const year = Number(raw.year);
    return {
      id, title, abstract: text(raw.abstract).slice(0, 20000), authors,
      journal: text(raw.journal).slice(0, 300), year: Number.isInteger(year) && year >= 1800 && year <= 2100 ? year : null,
      published_on: text(raw.published_on).slice(0, 30), pmid: text(raw.pmid).slice(0, 40),
      pmcid: text(raw.pmcid).slice(0, 40), doi: text(raw.doi).slice(0, 200),
      source_url: safeUrl(raw.source_url), fulltext_url: safeUrl(raw.fulltext_url), pdf_url: safeUrl(raw.pdf_url),
      license: text(raw.license).slice(0, 200), concepts,
      publication_types: Array.isArray(raw.publication_types) ? raw.publication_types.map(text).filter(Boolean).slice(0, 20) : [],
      curation_topics: Array.isArray(raw.curation_topics) ? raw.curation_topics.map(text).filter(Boolean).slice(0, 20) : [],
      source: text(raw.source || 'snapshot').slice(0, 50),
      provenance: text(raw.provenance || '').slice(0, 150)
    };
  }

  function uniqueDocuments(documents) {
    const seen = new Set();
    const unique = [];
    for (const raw of documents) {
      const doc = normalizeDocument(raw);
      if (!doc) continue;
      const key = (doc.pmid && 'pmid:' + doc.pmid) || (doc.doi && 'doi:' + doc.doi.toLowerCase()) || doc.id;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(doc);
    }
    return unique;
  }

  function bm25(query, documents) {
    const words = documents.map(doc => tokens(doc.title + ' ' + doc.title + ' ' + doc.abstract + ' ' + doc.concepts.map(item => item.label).join(' ')));
    const lengths = words.map(row => row.length);
    const avg = lengths.reduce((sum, value) => sum + value, 0) / Math.max(words.length, 1);
    const df = new Map();
    for (const row of words) for (const term of new Set(row)) df.set(term, (df.get(term) || 0) + 1);
    const q = new Set(tokens(query));
    return documents.map((doc, index) => {
      const frequency = new Map();
      for (const term of words[index]) frequency.set(term, (frequency.get(term) || 0) + 1);
      let score = 0;
      for (const term of q) {
        const tf = frequency.get(term) || 0;
        if (!tf) continue;
        const idf = Math.log(1 + (documents.length - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
        score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * lengths[index] / Math.max(avg, 1)));
      }
      return { doc, lexical: score };
    }).filter(row => row.lexical > 0).sort((a, b) => b.lexical - a.lexical || a.doc.id.localeCompare(b.doc.id));
  }

  function cosine(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) throw new Error('Model embeddings are unavailable or mismatched');
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i];
    }
    return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
  }

  function rerank(candidates, queryEmbedding, embeddings, route) {
    if (!['semantic', 'hybrid'].includes(route)) throw new Error('Unknown model route');
    if (candidates.length !== embeddings.length) throw new Error('Model embeddings do not match candidates');
    const withScores = candidates.map((row, index) => {
      const semantic = cosine(queryEmbedding, embeddings[index]);
      return { ...row, semantic, score: semantic };
    });
    if (route === 'semantic') return withScores.sort((a, b) => b.semantic - a.semantic || a.doc.id.localeCompare(b.doc.id));
    const denseRank = new Map([...withScores].sort((a, b) => b.semantic - a.semantic || a.doc.id.localeCompare(b.doc.id)).map((row, index) => [row.doc.id, index + 1]));
    const lexicalRank = new Map([...withScores].filter(row => row.lexical > 0).sort((a, b) => b.lexical - a.lexical || a.doc.id.localeCompare(b.doc.id)).map((row, index) => [row.doc.id, index + 1]));
    for (const row of withScores) {
      const lexical = lexicalRank.get(row.doc.id);
      row.score = 1 / (60 + denseRank.get(row.doc.id)) + (lexical ? 1 / (60 + lexical) : 0);
    }
    return withScores.sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));
  }

  function filterDocuments(documents, { yearFrom, yearTo, type, openAccess } = {}) {
    const from = Number(yearFrom) || 0;
    const to = Number(yearTo) || 9999;
    return documents.filter(doc => {
      if (doc.year && (doc.year < from || doc.year > to)) return false;
      if (type && type !== 'all' && !doc.publication_types.some(item => item.toLowerCase().includes(type.toLowerCase()))) return false;
      if (openAccess && !/cc\s*[- ]?by\b/i.test(doc.license)) return false;
      return true;
    });
  }

  function buildGraph(documents, maxStudies = 12, maxConcepts = 12) {
    const studies = documents.slice(0, maxStudies);
    const counts = new Map();
    for (const doc of studies) {
      for (const concept of doc.concepts) {
        const key = concept.id || concept.label.toLowerCase();
        const old = counts.get(key) || { ...concept, count: 0 };
        old.count += 1;
        counts.set(key, old);
      }
    }
    const concepts = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, maxConcepts);
    const allowed = new Set(concepts.map(item => item.id));
    const nodes = [
      ...studies.map(doc => ({ id: 'study:' + doc.id, label: doc.title, type: 'study', study_id: doc.id })),
      ...concepts.map(item => ({ id: 'concept:' + item.id, label: item.label, type: 'concept', count: item.count, source_url: item.source_url }))
    ];
    const edges = [];
    for (const doc of studies) {
      for (const concept of doc.concepts) {
        if (!allowed.has(concept.id)) continue;
        edges.push({
          id: doc.id + '::' + concept.id, from: 'study:' + doc.id, to: 'concept:' + concept.id,
          study_id: doc.id, relation: concept.relation, source: concept.source,
          source_url: doc.source_url || concept.source_url
        });
      }
    }
    return { nodes, edges };
  }

  function buildAssertionGraph(assertions, documents) {
    const catalog = new Map(documents.map(doc => [doc.id, doc]));
    const nodes = new Map(), edges = [];
    for (const a of assertions.slice(0, 20)) {
      const doc = catalog.get(a.study_id);
      if (!doc || !doc.abstract.includes(a.evidence) || !safeUrl(a.source_url)) continue;
      for (const concept of [a.subject, a.object]) nodes.set('concept:' + concept.id, {id:'concept:' + concept.id, label:concept.label, type:'concept', concept_type:concept.type});
      nodes.set('study:' + doc.id, {id:'study:' + doc.id,label:doc.title,type:'study',study_id:doc.id});
      edges.push({id:a.id,from:'concept:' + a.subject.id,to:'concept:' + a.object.id,study_id:doc.id,relation:a.predicate,source_url:doc.source_url,assertion:a});
      edges.push({id:a.id+'-source',from:'study:'+doc.id,to:'concept:'+a.subject.id,study_id:doc.id,relation:'SOURCE_FOR_ASSERTION',source_url:doc.source_url,assertion:a});
    }
    return {nodes:[...nodes.values()],edges};
  }

  function citationMetadata(doc) {
    return {
      id: text(doc.id).slice(0, 120), title: text(doc.title).slice(0, 1000),
      authors: Array.isArray(doc.authors) ? doc.authors.map(text).slice(0, 40) : [],
      year: Number(doc.year) || null, journal: text(doc.journal).slice(0, 300),
      doi: text(doc.doi).slice(0, 200), pmid: text(doc.pmid).slice(0, 40),
      source_url: safeUrl(doc.source_url)
    };
  }

  function validCollections(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.collections) || value.collections.length > MAX_COLLECTIONS) throw new Error('Expected collections export version 1');
    const ids = new Set();
    const collections = value.collections.map(row => {
      if (!row || typeof row !== 'object') throw new Error('Invalid collection');
      const id = text(row.id).slice(0, 80);
      const name = text(row.name).slice(0, 100);
      if (!id || !name || ids.has(id) || !Array.isArray(row.documents) || row.documents.length > MAX_ITEMS) throw new Error('Invalid collection name or item count');
      ids.add(id);
      const seen = new Set();
      const documents = row.documents.map(item => {
        const doc = citationMetadata(item);
        if (!doc.id || !doc.title || seen.has(doc.id)) throw new Error('Invalid or duplicate collection item');
        seen.add(doc.id);
        return doc;
      });
      return { id, name, created_at: text(row.created_at).slice(0, 40), documents };
    });
    return { version: 1, collections };
  }

  function bibtex(documents) {
    const clean = value => text(value).replace(/[{}\\]/g, '').replace(/[\r\n]+/g, ' ');
    return documents.map((doc, index) => {
      const key = clean((doc.authors?.[0] || 'Study').split(/\s+/).pop()).replace(/[^A-Za-z0-9]/g, '') + (doc.year || 'nd') + (index + 1);
      return `@article{${key},\n  title = {${clean(doc.title)}},\n  author = {${(doc.authors || []).map(clean).join(' and ')}},\n  journal = {${clean(doc.journal)}},\n  year = {${doc.year || ''}},\n  doi = {${clean(doc.doi)}}\n}`;
    }).join('\n\n');
  }

  function ris(documents) {
    const clean = value => text(value).replace(/[\r\n]+/g, ' ');
    return documents.map(doc => [
      'TY  - JOUR', 'TI  - ' + clean(doc.title),
      ...(doc.authors || []).map(author => 'AU  - ' + clean(author)),
      'JO  - ' + clean(doc.journal), 'PY  - ' + (doc.year || ''),
      doc.doi ? 'DO  - ' + clean(doc.doi) : '',
      doc.source_url ? 'UR  - ' + clean(doc.source_url) : '',
      'ER  -'
    ].filter(Boolean).join('\n')).join('\n\n');
  }

  function europePmcQuery(topic) {
    const terms = tokens(topic).slice(0, 12).map(term => term.replace(/[^a-z0-9]/g, ''));
    if (!terms.length) throw new Error('Enter a research topic');
    return '(' + terms.join(' ') + ') AND OPEN_ACCESS:Y AND LICENSE:"CC BY"';
  }

  function fromEuropePmc(record) {
    if (!record || !record.title || !text(record.abstractText)) return null;
    const license = text(record.license).toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!['cc by', 'cc by 4.0', 'cc0', 'cc zero', 'cc0 1.0'].includes(license)) return null;
    const published = text(record.firstPublicationDate);
    if (published && published.slice(0, 10) > new Date().toISOString().slice(0, 10)) return null;
    const links = Array.isArray(record.fullTextUrlList?.fullTextUrl) ? record.fullTextUrlList.fullTextUrl : [];
    const oaLinks = links.filter(item => item.availabilityCode === 'OA' && safeUrl(item.url));
    const full = oaLinks.find(item => item.documentStyle !== 'pdf')?.url || '';
    const pdf = oaLinks.find(item => item.documentStyle === 'pdf')?.url || '';
    const mesh = Array.isArray(record.meshHeadingList?.meshHeading) ? record.meshHeadingList.meshHeading : [];
    const concepts = mesh.map(item => ({
      id: 'mesh:' + text(item.descriptorName).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label: text(item.descriptorName), type: 'MeSH', source: 'Europe PMC MeSH heading', relation: 'INDEXED_WITH'
    })).filter(item => item.label);
    const pmcid = text(record.pmcid);
    const id = pmcid || text(record.id);
    const raw = {
      id, title: record.title, abstract: record.abstractText || '',
      authors: text(record.authorString).split(/,\s*/).filter(Boolean),
      journal: record.journalTitle || record.journalInfo?.journal?.title || '',
      year: Number(record.pubYear), published_on: published,
      pmid: record.source === 'MED' ? record.id : record.pmid || '',
      pmcid, doi: record.doi || '',
      source_url: pmcid ? 'https://europepmc.org/articles/' + encodeURIComponent(pmcid) : 'https://europepmc.org/article/' + encodeURIComponent(record.source || 'MED') + '/' + encodeURIComponent(record.id),
      fulltext_url: full, pdf_url: pdf, license: record.license,
      publication_types: record.pubTypeList?.pubType || [], concepts, source: 'live-europe-pmc',
      provenance: 'Europe PMC REST core result; OA and exact license checked'
    };
    return normalizeDocument(raw);
  }

  return { tokens, escapeHtml, safeUrl, normalizeDocument, uniqueDocuments, bm25, cosine, rerank, filterDocuments, buildGraph, buildAssertionGraph, citationMetadata, validCollections, bibtex, ris, europePmcQuery, fromEuropePmc };
});

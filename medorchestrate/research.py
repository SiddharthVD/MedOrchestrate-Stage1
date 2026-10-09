"""Permission-filtered Europe PMC discovery and a separate research pilot.

Only API records with an explicit CC BY or CC0 full-text license are copied
into the snapshot. The graph contains indexed headings and literal mentions,
never inferred clinical or causal relationships.
"""

from __future__ import annotations

import html
import json
import re
import time
from collections import OrderedDict
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from .benchmark import BM25Index


ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "data" / "research" / "pilot.json"
EP_API = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
EP_RIGHTS = "https://dev.europepmc.org/Copyright"
VERSION = "research-pilot-v1"
LICENSES = {"cc by", "cc-by", "cc by 4.0", "cc-by 4.0", "cc0", "cc 0", "cc0 1.0"}
SOURCES = {"all", "MED", "PMC"}
PUBLICATION_TYPES = {"all", "Review", "Clinical Trial", "Randomized Controlled Trial", "Journal Article", "Meta-Analysis", "Systematic Review"}

# Each topic is a literal title/abstract search, not a clinical ontology claim.
TOPICS = [
    {"id": "diabetes", "label": "Type 2 diabetes", "query": "type 2 diabetes", "category": "disease"},
    {"id": "kidney", "label": "Chronic kidney disease", "query": "chronic kidney disease", "category": "disease"},
    {"id": "asthma", "label": "Asthma", "query": "asthma", "category": "disease"},
    {"id": "hypertension", "label": "Hypertension", "query": "hypertension", "category": "disease"},
    {"id": "obesity", "label": "Obesity", "query": "obesity", "category": "disease"},
    {"id": "arthritis", "label": "Rheumatoid arthritis", "query": "rheumatoid arthritis", "category": "disease"},
    {"id": "pain", "label": "Chronic pain", "query": "chronic pain", "category": "symptom"},
    {"id": "fatigue", "label": "Fatigue", "query": "fatigue", "category": "symptom"},
    {"id": "dyspnea", "label": "Dyspnea", "query": "dyspnea", "category": "symptom"},
    {"id": "glp1", "label": "GLP-1 receptor agonists", "query": "GLP-1 receptor agonist", "category": "intervention"},
    {"id": "inhaled-steroids", "label": "Inhaled corticosteroids", "query": "inhaled corticosteroid", "category": "intervention"},
    {"id": "exercise", "label": "Exercise therapy", "query": "exercise therapy", "category": "intervention"},
    {"id": "biomarkers", "label": "Biomarkers", "query": "biomarker", "category": "topic"},
    {"id": "screening", "label": "Screening", "query": "screening", "category": "topic"},
    {"id": "quality-life", "label": "Quality of life", "query": "quality of life", "category": "topic"},
]


class ResearchError(Exception):
    """A cleanly reportable upstream or validation error."""


class _PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in {"p", "br", "h3", "h4", "li"}:
            self.parts.append(" ")


def plain_text(value: str) -> str:
    parser = _PlainText()
    parser.feed(value)
    return re.sub(r"\s+", " ", html.unescape(" ".join(parser.parts))).strip()


def allowed_license(raw: object) -> str | None:
    if not isinstance(raw, str):
        return None
    normalized = re.sub(r"\s+", " ", raw.strip().lower())
    return raw.strip() if normalized in LICENSES else None


def _valid_url(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    return value if parsed.scheme == "https" and parsed.netloc else None


def _publication_date(raw: object, *, today: date) -> str | None:
    if not isinstance(raw, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        return None
    try:
        published = date.fromisoformat(raw)
    except ValueError:
        return None
    return raw if published <= today else None


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:96]


def _concepts(record: dict, article_url: str, text: str) -> list[dict]:
    concepts = []
    seen = set()
    headings = record.get("meshHeadingList") or {}
    if isinstance(headings, dict):
        for heading in headings.get("meshHeading", []) or []:
            label = heading.get("descriptorName") if isinstance(heading, dict) else None
            if not isinstance(label, str) or not label.strip():
                continue
            identifier = "mesh-label:" + _slug(label)
            key = (identifier, "INDEXED_WITH")
            if key not in seen:
                concepts.append({"id": identifier, "label": label, "type": "MeSH heading", "source_url": article_url,
                                 "relation": "INDEXED_WITH", "source": "Europe PMC meshHeadingList.descriptorName"})
                seen.add(key)
    for topic in TOPICS:
        # Phrase boundaries prevent partial-word matches (e.g. pain in painting).
        if re.search(r"(?<!\w)" + re.escape(topic["query"]) + r"(?!\w)", text, re.IGNORECASE):
            identifier = "literal:" + topic["id"]
            key = (identifier, "MENTIONS")
            if key not in seen:
                concepts.append({"id": identifier, "label": topic["label"], "type": topic["category"],
                                 "source_url": article_url, "relation": "MENTIONS",
                                 "source": "Exact phrase in Europe PMC title or abstract"})
                seen.add(key)
    return concepts[:40]


def normalize_record(record: dict, *, retrieved_at: str | None = None, today: date | None = None) -> dict | None:
    """Return a reusable publication or None; no citation/link fabrication."""
    if not isinstance(record, dict) or record.get("isOpenAccess") != "Y":
        return None
    license_value = allowed_license(record.get("license"))
    if not license_value:
        return None
    today = today or date.today()
    published_on = _publication_date(record.get("firstPublicationDate"), today=today)
    title = plain_text(record.get("title", "")) if isinstance(record.get("title"), str) else ""
    abstract = plain_text(record.get("abstractText", "")) if isinstance(record.get("abstractText"), str) else ""
    if not published_on or not title or len(abstract) < 80:
        return None
    source = record.get("source")
    article_id = record.get("id")
    if source not in {"MED", "PMC"} or not isinstance(article_id, str) or not article_id:
        return None
    pmid = record.get("pmid") if isinstance(record.get("pmid"), str) else None
    pmcid = record.get("pmcid") if isinstance(record.get("pmcid"), str) else None
    doi = record.get("doi") if isinstance(record.get("doi"), str) else None
    source_url = f"https://europepmc.org/article/{source}/{article_id}"
    links = ((record.get("fullTextUrlList") or {}).get("fullTextUrl") or [])
    fulltext_url = pdf_url = None
    for link in links:
        if not isinstance(link, dict) or link.get("availabilityCode") != "OA":
            continue
        url = _valid_url(link.get("url"))
        if not url:
            continue
        if link.get("documentStyle") == "html" and fulltext_url is None:
            fulltext_url = url
        elif link.get("documentStyle") == "pdf" and pdf_url is None:
            pdf_url = url
    # A source-provided open full-text link is required for rights auditing.
    if not fulltext_url:
        return None
    author_data = (record.get("authorList") or {}).get("author") or []
    authors = [row["fullName"].strip() for row in author_data if isinstance(row, dict) and isinstance(row.get("fullName"), str) and row["fullName"].strip()]
    journal_data = (record.get("journalInfo") or {}).get("journal") or {}
    journal = journal_data.get("title") if isinstance(journal_data, dict) else None
    types = (record.get("pubTypeList") or {}).get("pubType") or []
    publication_types = [item for item in types if isinstance(item, str)]
    retrieved_at = retrieved_at or datetime.now(timezone.utc).isoformat()
    return {
        "id": f"{source}:{article_id}", "title": title, "abstract": abstract,
        "authors": authors, "journal": journal if isinstance(journal, str) else None,
        "year": int(published_on[:4]), "published_on": published_on,
        "pmid": pmid, "pmcid": pmcid, "doi": doi, "source_url": source_url,
        "fulltext_url": fulltext_url, "pdf_url": pdf_url, "license": license_value,
        "concepts": _concepts(record, source_url, title + " " + abstract),
        "publication_types": publication_types, "retrieved_at": retrieved_at,
        "source": source, "curation_topics": [],
    }


def validate_search(*, query: str, year_from: int | None = None, year_to: int | None = None,
                    publication_type: str = "all", source: str = "all", limit: int = 20) -> dict:
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 200 or not re.search(r"[A-Za-z0-9]", query):
        raise ValueError("Query must contain 2 to 200 characters and a search term")
    if any(char in query for char in '"[]{}*\\'):
        raise ValueError("Query contains unsupported search syntax")
    current = date.today().year
    if year_from is not None and (type(year_from) is not int or not 1900 <= year_from <= current):
        raise ValueError("Invalid year_from")
    if year_to is not None and (type(year_to) is not int or not 1900 <= year_to <= current):
        raise ValueError("Invalid year_to")
    if year_from is not None and year_to is not None and year_from > year_to:
        raise ValueError("year_from cannot exceed year_to")
    if publication_type not in PUBLICATION_TYPES:
        raise ValueError("Unsupported publication_type")
    if source not in SOURCES:
        raise ValueError("Unsupported source")
    if type(limit) is not int or not 1 <= limit <= 50:
        raise ValueError("limit must be 1 to 50")
    return {"query": query.strip(), "year_from": year_from, "year_to": year_to,
            "publication_type": publication_type, "source": source, "limit": limit}


def ep_query(query: str, *, year_from: int | None = None, year_to: int | None = None,
             source: str = "all") -> str:
    # A quoted title/abstract phrase cannot inject Europe PMC field operators.
    cleaned = re.sub(r"\s+", " ", query.strip()).replace('"', "")
    parts = [f'TITLE_ABS:"{cleaned}"', "OPEN_ACCESS:y", '(LICENSE:"CC BY" OR LICENSE:CC0)']
    if year_from is not None or year_to is not None:
        parts.append(f"FIRST_PDATE:[{year_from or 1900}-01-01 TO {year_to or date.today().year}-12-31]")
    if source != "all":
        parts.append(f"SRC:{source}")
    return " AND ".join(parts)


class EuropePMCClient:
    def __init__(self, *, timeout: float = 12, ttl: float = 900, max_cache: int = 48):
        self.timeout, self.ttl, self.max_cache = timeout, ttl, max_cache
        self._cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()
        self._lock = Lock()

    def fetch_page(self, query: str, *, page_size: int = 100, cursor: str = "*") -> dict:
        if not 1 <= page_size <= 100:
            raise ValueError("page_size must be 1 to 100")
        url = EP_API + "?" + urlencode({"query": query, "format": "json", "resultType": "core",
                                        "pageSize": page_size, "cursorMark": cursor})
        now = time.monotonic()
        with self._lock:
            cached = self._cache.get(url)
            if cached and now - cached[0] < self.ttl:
                self._cache.move_to_end(url)
                return cached[1]
        try:
            request = Request(url, headers={"User-Agent": "MedOrchestrate/1.0 (academic research prototype)", "Accept": "application/json"})
            with urlopen(request, timeout=self.timeout) as response:
                body = response.read(10_000_001)
            if len(body) > 10_000_000:
                raise ResearchError("Europe PMC response exceeded size limit")
            payload = json.loads(body)
            if not isinstance(payload, dict) or "resultList" not in payload:
                raise ResearchError("Europe PMC returned an unexpected response")
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise ResearchError(f"Europe PMC request failed: {exc}") from exc
        with self._lock:
            self._cache[url] = (now, payload)
            self._cache.move_to_end(url)
            while len(self._cache) > self.max_cache:
                self._cache.popitem(last=False)
        return payload


def _filter_documents(documents: list[dict], filters: dict) -> list[dict]:
    selected = []
    for doc in documents:
        if filters["year_from"] is not None and doc["year"] < filters["year_from"]:
            continue
        if filters["year_to"] is not None and doc["year"] > filters["year_to"]:
            continue
        if filters["source"] != "all" and doc["source"] != filters["source"]:
            continue
        if filters["publication_type"] != "all" and filters["publication_type"].casefold() not in {value.casefold() for value in doc["publication_types"]}:
            continue
        selected.append(doc)
    return selected


def _rank(documents: list[dict], query: str, limit: int) -> list[dict]:
    if not documents:
        return []
    index = BM25Index({doc["id"]: {"title": doc["title"], "text": doc["abstract"]} for doc in documents})
    by_id = {doc["id"]: doc for doc in documents}
    return [{**by_id[doc_id], "score": round(score, 5)} for doc_id, score in index.rank_scored(query, limit)]


def search_snapshot(query: str, *, corpus: dict | None = None, **filters) -> dict:
    validated = validate_search(query=query, **filters)
    corpus = corpus or load_snapshot()
    selected = _filter_documents(corpus["documents"], validated)
    results = _rank(selected, validated["query"], validated["limit"])
    return {"mode": "snapshot", "source": "Europe PMC licensed pilot", "query": validated["query"],
            "filters": validated, "retrieved_at": corpus["updated_at"], "result_count": len(results),
            "candidate_count": len(selected), "results": results}


def search_live(query: str, *, client: EuropePMCClient | None = None, **filters) -> dict:
    validated = validate_search(query=query, **filters)
    client = client or EuropePMCClient()
    request_query = ep_query(validated["query"], year_from=validated["year_from"],
                             year_to=validated["year_to"], source=validated["source"])
    documents: dict[str, dict] = {}
    cursor = "*"
    total_hits = None
    for _ in range(3):
        page = client.fetch_page(request_query, page_size=100, cursor=cursor)
        total_hits = page.get("hitCount")
        records = ((page.get("resultList") or {}).get("result") or [])
        for record in records:
            doc = normalize_record(record)
            if doc:
                documents.setdefault(doc["id"], doc)
        next_cursor = page.get("nextCursorMark")
        if len(documents) >= validated["limit"] * 2 or not records or not next_cursor or next_cursor == cursor:
            break
        cursor = next_cursor
    selected = _filter_documents(list(documents.values()), validated)
    results = _rank(selected, validated["query"], validated["limit"])
    return {"mode": "live", "source": "Europe PMC REST core", "query": validated["query"],
            "filters": validated, "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "source_query": request_query, "total_source_hits": total_hits,
            "candidate_count": len(selected), "result_count": len(results), "results": results}


def load_snapshot(path: Path = SNAPSHOT) -> dict:
    try:
        corpus = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ResearchError(f"Research snapshot unavailable or malformed: {exc}") from exc
    if not isinstance(corpus, dict) or corpus.get("version") != VERSION or not isinstance(corpus.get("documents"), list):
        raise ResearchError("Research snapshot has incompatible schema")
    ids = set()
    for doc in corpus["documents"]:
        if not isinstance(doc, dict) or not isinstance(doc.get("id"), str) or doc["id"] in ids or not allowed_license(doc.get("license")):
            raise ResearchError("Research snapshot contains invalid or unlicensed records")
        ids.add(doc["id"])
    return corpus


def graph_neighborhood(corpus: dict, concept_id: str, limit: int = 30) -> dict:
    if not isinstance(concept_id, str) or not concept_id or not 1 <= limit <= 100:
        raise ValueError("Invalid concept or limit")
    studies = []
    edges = []
    concept = None
    for doc in corpus["documents"]:
        matches = [item for item in doc["concepts"] if item["id"] == concept_id]
        if not matches:
            continue
        if concept is None:
            concept = {key: matches[0][key] for key in ("id", "label", "type")}
        studies.append({"id": doc["id"], "title": doc["title"], "source_url": doc["source_url"], "year": doc["year"]})
        for match in matches:
            edges.append({"source": doc["id"], "target": concept_id, "relation": match["relation"],
                          "study_url": doc["source_url"], "provenance": match["source"]})
        if len(studies) >= limit:
            break
    return {"concept": concept, "studies": studies, "edges": edges, "count": len(studies)}


def status(corpus: dict | None = None) -> dict:
    try:
        corpus = corpus or load_snapshot()
    except ResearchError as exc:
        return {"available": False, "reason": str(exc), "live_available": True, "source": "Europe PMC REST core"}
    return {"available": True, "version": corpus["version"], "updated_at": corpus["updated_at"],
            "document_count": len(corpus["documents"]), "topic_count": len(corpus["topics"]),
            "license_policy": corpus["source"]["license_policy"], "live_available": True}


def build_pilot(*, client: EuropePMCClient | None = None, target: int = 225,
                today: date | None = None, topics: list[dict] | None = None) -> dict:
    """Curate a balanced local pilot from live, explicitly reusable results."""
    if not 1 <= target <= 250:
        raise ValueError("target must be 1 to 250")
    today = today or date.today()
    client = client or EuropePMCClient(timeout=20)
    topics = topics or TOPICS
    retrieved_at = datetime.now(timezone.utc).isoformat()
    pools: dict[str, list[dict]] = {}
    query_log = []
    for topic in topics:
        source_query = ep_query(topic["query"], year_from=2018, year_to=today.year)
        # First publication date and license are checked again after retrieval.
        cursor = "*"
        pool = []
        seen = set()
        fetched = 0
        hits = 0
        for _ in range(2):
            page = client.fetch_page(source_query, page_size=100, cursor=cursor)
            hits = page.get("hitCount", hits)
            records = ((page.get("resultList") or {}).get("result") or [])
            fetched += len(records)
            for record in records:
                doc = normalize_record(record, retrieved_at=retrieved_at, today=today)
                if doc and doc["year"] >= 2018 and doc["id"] not in seen:
                    seen.add(doc["id"])
                    pool.append(doc)
            next_cursor = page.get("nextCursorMark")
            if len(pool) >= 30 or not records or not next_cursor or next_cursor == cursor:
                break
            cursor = next_cursor
        pools[topic["id"]] = pool
        query_log.append({"topic_id": topic["id"], "source_query": source_query,
                          "hit_count": hits, "fetched_count": fetched, "eligible_count": len(pool)})
    selected: OrderedDict[str, dict] = OrderedDict()
    # Guarantee broad topic coverage before filling the rest round robin.
    positions = {topic["id"]: 0 for topic in topics}
    first_quota = max(1, min(12, target // len(topics)))
    for topic in topics:
        topic_id = topic["id"]
        added = 0
        while positions[topic_id] < len(pools[topic_id]) and added < first_quota and len(selected) < target:
            doc = pools[topic_id][positions[topic_id]]
            positions[topic_id] += 1
            if doc["id"] not in selected:
                selected[doc["id"]] = doc
                added += 1
            if topic_id not in selected[doc["id"]]["curation_topics"]:
                selected[doc["id"]]["curation_topics"].append(topic_id)
    while len(selected) < target:
        progress = False
        for topic in topics:
            topic_id = topic["id"]
            if positions[topic_id] >= len(pools[topic_id]):
                continue
            doc = pools[topic_id][positions[topic_id]]
            positions[topic_id] += 1
            progress = True
            if doc["id"] not in selected:
                selected[doc["id"]] = doc
            if topic_id not in selected[doc["id"]]["curation_topics"]:
                selected[doc["id"]]["curation_topics"].append(topic_id)
            if len(selected) >= target:
                break
        if not progress:
            break
    if len(selected) < target:
        raise ResearchError(f"Only {len(selected)} licensed, distinct records were available for target {target}")
    return {
        "version": VERSION,
        "updated_at": retrieved_at,
        "source": {"name": "Europe PMC", "api_url": EP_API, "rights_url": EP_RIGHTS,
                   "license_policy": "Explicit CC BY or CC0 full-text license in Europe PMC core response; open-access HTML URL required"},
        "topics": topics,
        "query_log": query_log,
        "document_count": len(selected),
        "documents": list(selected.values()),
    }

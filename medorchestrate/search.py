"""Small, inspectable lexical retrieval routes for the fictional fixture."""

from __future__ import annotations

import json
import math
import re
import time
from collections import Counter
from datetime import date
from pathlib import Path

from .corpus import validate_documents


DATA = Path(__file__).resolve().parent.parent / "data"
STOP = {"a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "of", "on", "or", "the", "to", "with", "what", "which", "how", "does", "do", "among"}
DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}\Z")


def strict_date(value: object) -> str:
    """Return canonical calendar dates; reject compact and ISO week forms."""
    if not isinstance(value, str) or not DATE_PATTERN.fullmatch(value):
        raise ValueError("Date must use YYYY-MM-DD")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Invalid calendar date") from exc
    return value


def tokens(value: str) -> list[str]:
    return [word for word in re.findall(r"[a-z0-9]+", value.lower()) if word not in STOP]


def load_fixture() -> tuple[list[dict], list[dict]]:
    cases = json.loads((DATA / "cases.json").read_text(encoding="utf-8"))
    documents = json.loads((DATA / "documents.json").read_text(encoding="utf-8"))
    validate_documents(documents, imported=False)
    return cases, documents


def valid_facts(case: dict, as_of: str) -> list[dict]:
    cutoff = strict_date(as_of)
    return [fact for fact in case["facts"] if strict_date(fact["available_on"]) <= cutoff]


def expanded_query(question: str, facts: list[dict]) -> tuple[str, list[str]]:
    question_terms = set(tokens(question))
    additions = []
    for fact in facts:
        for term in tokens(fact["search_phrase"]):
            if term not in question_terms and term not in additions:
                additions.append(term)
    return (question + " " + " ".join(additions)).strip(), additions


def bm25(query: str, documents: list[dict], limit: int = 10) -> list[dict]:
    if limit < 1:
        return []
    fields = [tokens(doc["title"] + " " + doc["abstract"]) for doc in documents]
    lengths = [len(words) for words in fields]
    average = sum(lengths) / max(len(lengths), 1)
    frequencies = [Counter(words) for words in fields]
    document_frequency = Counter(term for words in fields for term in set(words))
    scored = []
    for doc, counts, length in zip(documents, frequencies, lengths):
        score = 0.0
        for term in set(tokens(query)):
            n = document_frequency[term]
            idf = math.log(1 + (len(documents) - n + 0.5) / (n + 0.5))
            tf = counts[term]
            if tf:
                score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * length / max(average, 1)))
        if score > 0:
            scored.append({"id": doc["id"], "title": doc["title"], "source": doc["source"], "year": doc["year"], "url": doc["url"], "abstract": doc["abstract"], "score": round(score, 4), "fixture": doc.get("source_type") is None, "published_on": doc.get("published_on"), "source_type": doc.get("source_type")})
    return sorted(scored, key=lambda row: (-row["score"], row["id"]))[:limit]


def run_search(question: str, case: dict, as_of: str, route: str, documents: list[dict], corpus_id: str = "fictional-demo-v1") -> dict:
    as_of = strict_date(as_of)
    if route not in {"direct_bm25", "expanded_bm25", "adaptive"}:
        raise ValueError("Unavailable route")
    if not question.strip() or len(question) > 500:
        raise ValueError("Question must be 1 to 500 characters")
    facts = valid_facts(case, as_of)
    start = time.perf_counter()
    selected = route
    rationale = "User selected a fixed route."
    if route == "adaptive":
        selected = "expanded_bm25" if facts and len(tokens(question)) < 12 else "direct_bm25"
        rationale = "Rule selected expansion for a short question with available patient facts." if selected == "expanded_bm25" else "Rule selected direct BM25 because the question is long or no facts are available."
    final_query, additions = expanded_query(question, facts) if selected == "expanded_bm25" else (question, [])
    # A citation cannot be retrieved before it was published. Demo records only
    # have a year, so exclude the current year when the exact date is unknown.
    eligible = [doc for doc in documents if (doc.get("published_on", f"{doc['year']}-12-31") <= as_of)]
    rankings = bm25(final_query, eligible)
    elapsed = round((time.perf_counter() - start) * 1000, 3)
    return {"case_id": case["id"], "question": question, "as_of": as_of, "requested_route": route, "executed_route": selected, "query_used": final_query, "results": rankings, "trace": {"rationale": rationale, "available_facts": [f["label"] for f in facts], "added_terms": additions, "calls": {"retrieval": 1, "rewrite": 0, "rerank": 0, "probe": 0}, "elapsed_ms": elapsed, "corpus": corpus_id, "eligible_documents": len(eligible), "result_count": len(rankings)}}

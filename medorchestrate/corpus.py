"""Validated local corpora. Imported citations are user supplied, not verified online."""

from __future__ import annotations

import argparse
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


DATA = Path(__file__).resolve().parent.parent / "data"
IMPORTED = DATA / "imported_documents.json"
SOURCE_TYPES = {"journal", "guideline", "registry", "repository", "other"}
IMPORTED_KIND = "user_supplied_citations"
PROVENANCE_NOTE = "Metadata and source URLs were supplied locally; authenticity and full text were not verified online."


def validate_record(record: dict, *, imported: bool) -> dict:
    if not isinstance(record, dict):
        raise ValueError("Each document must be an object")
    required = ("id", "title", "abstract", "source", "year")
    for field in required:
        if not isinstance(record.get(field), str if field != "year" else int) or not record[field]:
            raise ValueError(f"Document needs a nonempty {field}")
    if isinstance(record["year"], bool) or not 1800 <= record["year"] <= date.today().year + 1:
        raise ValueError(f"Invalid year for {record['id']}")
    if imported:
        for field in ("published_on", "source_type", "url"):
            if not isinstance(record.get(field), str) or not record[field].strip():
                raise ValueError(f"Imported document {record['id']} needs {field}")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", record["published_on"]):
            raise ValueError(f"Invalid published_on for {record['id']}")
        try:
            published = date.fromisoformat(record["published_on"])
        except ValueError as exc:
            raise ValueError(f"Invalid published_on for {record['id']}") from exc
        if published.year != record["year"]:
            raise ValueError(f"Year and published_on disagree for {record['id']}")
        if record["source_type"] not in SOURCE_TYPES:
            raise ValueError(f"Invalid source_type for {record['id']}")
        parsed = urlparse(record["url"])
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError(f"Imported document {record['id']} needs an HTTP(S) source URL")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,79}", record["id"]):
            raise ValueError(f"Invalid ID for {record['id']}")
    return record


def validate_documents(documents: list[dict], *, imported: bool) -> list[dict]:
    if not isinstance(documents, list) or not documents:
        raise ValueError("Corpus must contain at least one document")
    ids: set[str] = set()
    for record in documents:
        validate_record(record, imported=imported)
        if record["id"] in ids:
            raise ValueError(f"Duplicate document ID: {record['id']}")
        ids.add(record["id"])
    return documents


def read_imported(path: Path = IMPORTED) -> dict | None:
    if not path.exists():
        return None
    corpus = json.loads(path.read_text(encoding="utf-8"))
    if (
        not isinstance(corpus, dict)
        or corpus.get("corpus_id") != "imported-local-v1"
        or corpus.get("kind") != IMPORTED_KIND
        or corpus.get("provenance_note") != PROVENANCE_NOTE
        or not isinstance(corpus.get("imported_at"), str)
    ):
        raise ValueError("Imported corpus has an invalid manifest")
    try:
        datetime.fromisoformat(corpus["imported_at"])
    except ValueError as exc:
        raise ValueError("Imported corpus has an invalid import timestamp") from exc
    validate_documents(corpus.get("documents"), imported=True)
    return corpus


def ingest_jsonl(source: Path, destination: Path = IMPORTED) -> dict:
    """Import citation metadata provided by the user; no network verification occurs."""
    documents = []
    for line_number, line in enumerate(source.read_text(encoding="utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        try:
            documents.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON on line {line_number}") from exc
    validate_documents(documents, imported=True)
    manifest = {
        "corpus_id": "imported-local-v1",
        "kind": IMPORTED_KIND,
        "provenance_note": PROVENANCE_NOTE,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "documents": documents,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(destination)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Import locally supplied, attributable citation metadata")
    parser.add_argument("jsonl", type=Path, help="JSONL with id, title, abstract, source, year, published_on, source_type and url")
    parser.add_argument("--output", type=Path, default=IMPORTED)
    args = parser.parse_args()
    manifest = ingest_jsonl(args.jsonl, args.output)
    print(f"Imported {len(manifest['documents'])} records into {args.output}")
    print(manifest["provenance_note"])


if __name__ == "__main__":
    main()

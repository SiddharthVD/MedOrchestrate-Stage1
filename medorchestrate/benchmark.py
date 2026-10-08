"""BEIR-format benchmark loader and reproducible lexical baseline.

This module never downloads data. It does not use fictional cases or demo qrels.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from .evaluate import mrr_at_k, ndcg_at_k, recall_at_k
from .search import tokens


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = ROOT / "data" / "benchmark" / "nfcorpus"
MANIFEST_NAME = "benchmark_manifest.json"
FILES = ("corpus.jsonl", "queries.jsonl", "qrels/test.tsv")
OTHER_QRELS = ("qrels/train.tsv", "qrels/dev.tsv")
BEIR_NFCORPUS_ARCHIVE_MD5 = "a89dba18a62ef92f7d323ec890a0d38d"
NFCORPUS_FILE_SHA256 = {
    "corpus.jsonl": "10cc83ef1826b1425e6a87090b5140b39b27755d5a27e48215a88611c899991f",
    "queries.jsonl": "d024e6621b84925d485ae473d316a0c3af31c62c8068a59fb29d22f7613aef2a",
    "qrels/test.tsv": "f8fba6ef3d4dd9c3a242a8ba4ae38276fc3622fce7dcbae764766d564542fd2a",
    "qrels/dev.tsv": "b1d38b5e8f78c4a5820bce2b7ec2db54911d7690dc601e76811846b211180bd8",
    "qrels/train.tsv": "6336b80f9bffc4f063f3aa450047ad35c0b7c534efe4a6ba35e16dbace047f6a",
}
FORMAT = "beir-jsonl-tsv-v1"
RIGHTS_REVIEW = "source_reviewed_academic_local_use"


def benchmark_dir() -> Path:
    value = os.environ.get("MEDORCHESTRATE_BENCHMARK_DIR")
    return Path(value).expanduser().resolve() if value else DEFAULT_DATA_DIR


def digest(path: Path, algorithm: str = "sha256") -> str:
    hasher = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Manifest requires nonempty {field}")
    return value.strip()


def _url(value: object, field: str) -> str:
    text = _text(value, field)
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"Manifest requires an HTTP(S) {field}")
    return text


def _read_jsonl(path: Path, *, kind: str) -> dict[str, dict] | dict[str, str]:
    records = {}
    with path.open("r", encoding="utf-8-sig") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON in {path.name} line {line_number}") from exc
            if not isinstance(record, dict) or not isinstance(record.get("_id"), str) or not record["_id"].strip():
                raise ValueError(f"Invalid ID in {path.name} line {line_number}")
            identifier = record["_id"]
            if identifier in records:
                raise ValueError(f"Duplicate {kind} ID: {identifier}")
            if kind == "document":
                title = record.get("title", "")
                body = record.get("text")
                if not isinstance(title, str) or not isinstance(body, str) or not (title.strip() or body.strip()):
                    raise ValueError(f"Document {identifier} needs text or title")
                records[identifier] = {"title": title, "text": body}
            else:
                body = record.get("text")
                if not isinstance(body, str) or not body.strip():
                    raise ValueError(f"Query {identifier} needs text")
                records[identifier] = body
    if not records:
        raise ValueError(f"No {kind}s in {path.name}")
    return records


def _read_qrels(path: Path, documents: dict, queries: dict) -> dict[str, dict[str, int]]:
    qrels: dict[str, dict[str, int]] = defaultdict(dict)
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        if reader.fieldnames != ["query-id", "corpus-id", "score"]:
            raise ValueError("Qrels header must be query-id<TAB>corpus-id<TAB>score")
        for line_number, row in enumerate(reader, 2):
            if None in row or any(row.get(field) is None for field in reader.fieldnames):
                raise ValueError(f"Malformed qrels row {line_number}")
            query_id, doc_id, score_text = (row[field] for field in reader.fieldnames)
            if query_id not in queries or doc_id not in documents:
                raise ValueError(f"Unknown query/document ID in qrels row {line_number}")
            if not re.fullmatch(r"\d+", score_text):
                raise ValueError(f"Invalid relevance score in qrels row {line_number}")
            if doc_id in qrels[query_id]:
                raise ValueError(f"Duplicate qrel for {query_id}/{doc_id}")
            qrels[query_id][doc_id] = int(score_text)
    if not qrels:
        raise ValueError("Qrels file has no judgments")
    if any(not any(score > 0 for score in grades.values()) for grades in qrels.values()):
        raise ValueError("Each judged query needs at least one positive relevance score")
    return dict(qrels)


def _load_files(data_dir: Path) -> tuple[dict, dict, dict]:
    missing = [relative for relative in FILES if not (data_dir / relative).is_file()]
    if missing:
        raise ValueError("Missing BEIR files: " + ", ".join(missing))
    documents = _read_jsonl(data_dir / "corpus.jsonl", kind="document")
    queries = _read_jsonl(data_dir / "queries.jsonl", kind="query")
    qrels = _read_qrels(data_dir / "qrels" / "test.tsv", documents, queries)
    return documents, queries, qrels


def _validate_splits(data_dir: Path, documents: dict, queries: dict, test_qrels: dict,
                     dataset_id: str) -> dict[str, int]:
    seen = set(test_qrels)
    counts = {"test": len(test_qrels)}
    for relative in OTHER_QRELS:
        path = data_dir / relative
        split = path.stem
        if not path.is_file():
            if dataset_id == "nfcorpus":
                raise ValueError(f"BEIR NFCorpus requires {relative}")
            continue
        qrels = _read_qrels(path, documents, queries)
        overlap = seen & set(qrels)
        if overlap:
            raise ValueError(f"Query IDs overlap across qrels splits: {split}")
        seen.update(qrels)
        counts[split] = len(qrels)
    return counts


def freeze_manifest(data_dir: Path, *, dataset_id: str, edition: str, source_url: str,
                    license_statement: str, citation: str, rights_reviewed: bool,
                    rights_source_url: str,
                    archive: Path | None = None) -> dict:
    """Freeze BEIR files after reviewing source terms for local academic use."""
    data_dir = data_dir.resolve()
    if not rights_reviewed:
        raise ValueError("Review source rights and pass rights_reviewed=True before freezing")
    if dataset_id == "fictional-demo-v1" or not re.fullmatch(r"[a-z][a-z0-9_-]{1,49}", dataset_id):
        raise ValueError("Invalid real benchmark dataset ID")
    source_url = _url(source_url, "source_url")
    rights_source_url = _url(rights_source_url, "rights_source_url")
    documents, queries, test_qrels = _load_files(data_dir)
    split_counts = _validate_splits(data_dir, documents, queries, test_qrels, dataset_id)
    archive_md5 = None
    if archive is not None:
        archive_md5 = digest(archive, "md5")
    if dataset_id == "nfcorpus" and archive_md5 != BEIR_NFCORPUS_ARCHIVE_MD5:
        raise ValueError("BEIR NFCorpus requires the original archive with its published MD5 checksum")
    file_hashes = {relative: digest(data_dir / relative) for relative in
                   (*FILES, *(item for item in OTHER_QRELS if (data_dir / item).is_file()))}
    if dataset_id == "nfcorpus" and file_hashes != NFCORPUS_FILE_SHA256:
        raise ValueError("Extracted NFCorpus files do not match the pinned BEIR edition")
    manifest = {
        "schema_version": 1,
        "kind": "real_benchmark",
        "format": FORMAT,
        "dataset_id": dataset_id,
        "edition": _text(edition, "edition"),
        "split": "test",
        "source_url": source_url,
        "rights_source_url": rights_source_url,
        "license_statement": _text(license_statement, "license_statement"),
        "citation": _text(citation, "citation"),
        "rights_review": RIGHTS_REVIEW,
        "frozen_at": datetime.now(timezone.utc).isoformat(),
        "archive_md5": archive_md5,
        "split_query_counts": split_counts,
        "file_sha256": file_hashes,
    }
    (data_dir / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def load_benchmark(data_dir: Path | None = None) -> tuple[dict, dict, dict, dict]:
    data_dir = (data_dir or benchmark_dir()).resolve()
    manifest_path = data_dir / MANIFEST_NAME
    if not manifest_path.is_file():
        raise ValueError(f"Benchmark manifest missing at {manifest_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("Benchmark manifest is unreadable or invalid JSON") from exc
    if not isinstance(manifest, dict) or any(manifest.get(key) != value for key, value in {
        "schema_version": 1, "kind": "real_benchmark", "format": FORMAT,
        "split": "test", "rights_review": RIGHTS_REVIEW}.items()):
        raise ValueError("Benchmark manifest has an incompatible schema")
    if manifest.get("dataset_id") == "fictional-demo-v1":
        raise ValueError("Fictional fixture cannot be used as a real benchmark")
    for key in ("dataset_id", "edition", "license_statement", "citation", "frozen_at"):
        _text(manifest.get(key), key)
    _url(manifest.get("source_url"), "source_url")
    _url(manifest.get("rights_source_url"), "rights_source_url")
    if manifest["dataset_id"] == "nfcorpus" and manifest.get("archive_md5") != BEIR_NFCORPUS_ARCHIVE_MD5:
        raise ValueError("NFCorpus archive MD5 does not match the BEIR transformed edition")
    hashes = manifest.get("file_sha256")
    expected_files = set(FILES) | {item for item in OTHER_QRELS if (data_dir / item).is_file()}
    if manifest["dataset_id"] == "nfcorpus":
        expected_files.update(OTHER_QRELS)
    if not isinstance(hashes, dict) or set(hashes) != expected_files:
        raise ValueError("Benchmark manifest has incomplete file hashes")
    if manifest["dataset_id"] == "nfcorpus" and hashes != NFCORPUS_FILE_SHA256:
        raise ValueError("NFCorpus hashes do not match the pinned BEIR edition")
    for relative in sorted(expected_files):
        expected = hashes[relative]
        if not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected):
            raise ValueError(f"Invalid SHA-256 for {relative}")
        file_path = data_dir / relative
        if not file_path.is_file() or digest(file_path) != expected:
            raise ValueError(f"Benchmark file missing or SHA-256 mismatch: {relative}")
    documents, queries, qrels = _load_files(data_dir)
    split_counts = _validate_splits(data_dir, documents, queries, qrels, manifest["dataset_id"])
    if manifest.get("split_query_counts") != split_counts:
        raise ValueError("Benchmark split counts do not match the manifest")
    return manifest, documents, queries, qrels


class BM25Index:
    """Small, deterministic in-memory lexical index for BEIR-format data."""

    def __init__(self, documents: dict[str, dict]):
        self.counts = {}
        self.lengths = {}
        self.postings: dict[str, list[tuple[str, int]]] = defaultdict(list)
        for doc_id, record in documents.items():
            counts = Counter(tokens(record["title"] + " " + record["text"]))
            self.counts[doc_id] = counts
            self.lengths[doc_id] = sum(counts.values())
            for term, frequency in counts.items():
                self.postings[term].append((doc_id, frequency))
        self.total = len(documents)
        self.average = sum(self.lengths.values()) / max(self.total, 1)

    def rank_scored(self, query: str, k: int) -> list[tuple[str, float]]:
        scores: dict[str, float] = defaultdict(float)
        for term in set(tokens(query)):
            postings = self.postings.get(term, ())
            document_frequency = len(postings)
            if not document_frequency:
                continue
            idf = math.log(1 + (self.total - document_frequency + 0.5) / (document_frequency + 0.5))
            for doc_id, frequency in postings:
                length = self.lengths[doc_id]
                scores[doc_id] += idf * frequency * 2.2 / (
                    frequency + 1.2 * (0.25 + 0.75 * length / max(self.average, 1))
                )
        return sorted(scores.items(), key=lambda item: (-item[1], item[0]))[:k]

    def rank(self, query: str, k: int) -> list[str]:
        return [doc_id for doc_id, _ in self.rank_scored(query, k)]


def evaluate_benchmark(data_dir: Path | None = None, *, k: int = 10, include_run: bool = False) -> dict:
    if not isinstance(k, int) or isinstance(k, bool) or k < 1 or k > 1000:
        raise ValueError("k must be an integer from 1 to 1000")
    manifest, documents, queries, qrels = load_benchmark(data_dir)
    index = BM25Index(documents)
    scores = []
    run_rows = []
    for query_id in sorted(qrels):
        relevant = {doc_id: grade for doc_id, grade in qrels[query_id].items() if grade > 0}
        scored = index.rank_scored(queries[query_id], k)
        ranked = [doc_id for doc_id, _ in scored]
        if include_run:
            run_rows.extend({"query_id": query_id, "document_id": doc_id, "rank": rank, "score": score}
                            for rank, (doc_id, score) in enumerate(scored, 1))
        scores.append({
            "recall_at_k": recall_at_k(ranked, relevant, k),
            "mrr_at_k": mrr_at_k(ranked, relevant, k),
            "ndcg_at_k": ndcg_at_k(ranked, relevant, k),
        })
    metrics = {"mean_" + key: sum(row[key] for row in scores) / len(scores) for key in scores[0]}
    report = {
        "dataset": manifest["dataset_id"], "edition": manifest["edition"], "kind": "real_benchmark",
        "split": manifest["split"], "route": "direct_bm25", "k": k,
        "document_count": len(documents), "query_count": len(queries), "judged_query_count": len(qrels),
        "split_query_counts": manifest["split_query_counts"], "relevance_threshold": ">0",
        "metrics": metrics,
        "run_manifest": {
            "format": manifest["format"], "source_url": manifest["source_url"],
            "license_statement": manifest["license_statement"], "rights_source_url": manifest["rights_source_url"],
            "rights_review": manifest["rights_review"], "citation": manifest["citation"],
            "archive_md5": manifest.get("archive_md5"), "file_sha256": manifest["file_sha256"],
            "retriever": "local_bm25_k1_1.2_b_0.75", "tokenizer": "lowercase_ascii_alphanumeric_stopwords_v1",
        },
    }
    if include_run:
        report["run"] = run_rows
    return report


def benchmark_status(data_dir: Path | None = None) -> dict:
    protocol = "BEIR corpus.jsonl + queries.jsonl + qrels/test.tsv; direct BM25 only"
    try:
        manifest, documents, queries, qrels = load_benchmark(data_dir)
    except (ValueError, OSError) as error:
        return {"available": False, "dataset": "nfcorpus", "protocol": protocol, "reason": str(error)}
    return {
        "available": True, "dataset": manifest["dataset_id"], "edition": manifest["edition"],
        "kind": "real_benchmark", "split": "test", "protocol": protocol,
        "document_count": len(documents), "query_count": len(queries), "judged_query_count": len(qrels),
        "split_query_counts": manifest["split_query_counts"], "relevance_threshold": ">0",
        "source_url": manifest["source_url"], "license_statement": manifest["license_statement"],
        "rights_source_url": manifest["rights_source_url"], "rights_review": manifest["rights_review"],
        "citation": manifest["citation"], "file_hashes": manifest["file_sha256"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Freeze or evaluate a locally provided BEIR-format benchmark")
    commands = parser.add_subparsers(dest="command", required=True)
    freeze = commands.add_parser("freeze", help="Validate and hash a locally provided dataset")
    freeze.add_argument("--data-dir", type=Path, default=benchmark_dir())
    freeze.add_argument("--dataset-id", required=True)
    freeze.add_argument("--edition", required=True)
    freeze.add_argument("--source-url", required=True)
    freeze.add_argument("--license-statement", required=True)
    freeze.add_argument("--rights-source-url", required=True)
    freeze.add_argument("--citation", required=True)
    freeze.add_argument("--rights-reviewed", action="store_true")
    freeze.add_argument("--archive", type=Path)
    run = commands.add_parser("evaluate", help="Evaluate direct BM25 against the frozen test qrels")
    run.add_argument("--data-dir", type=Path, default=benchmark_dir())
    run.add_argument("--k", type=int, default=10)
    run.add_argument("--output", type=Path)
    run.add_argument("--run-output", type=Path, help="Write deterministic six-column TREC rankings")
    args = parser.parse_args()
    if args.command == "freeze":
        result = freeze_manifest(args.data_dir, dataset_id=args.dataset_id, edition=args.edition,
                                 source_url=args.source_url, license_statement=args.license_statement,
                                 citation=args.citation, rights_reviewed=args.rights_reviewed,
                                 rights_source_url=args.rights_source_url, archive=args.archive)
    else:
        result = evaluate_benchmark(args.data_dir, k=args.k, include_run=bool(args.run_output))
        if args.run_output:
            rows = result.pop("run")
            args.run_output.parent.mkdir(parents=True, exist_ok=True)
            lines = [f"{row['query_id']}\tQ0\t{row['document_id']}\t{row['rank']}\t{row['score']:.12g}\tmedorchestrate-bm25-v1" for row in rows]
            args.run_output.write_text("\n".join(lines) + "\n", encoding="utf-8")
            result["run_manifest"]["run_sha256"] = digest(args.run_output)
            result["run_manifest"]["run_format"] = "trec-six-column-v1"
            result["run_manifest"]["run_file"] = args.run_output.name
    report = json.dumps(result, indent=2)
    if args.command == "evaluate" and args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report + "\n", encoding="utf-8")
        print(args.output)
    else:
        print(report)


if __name__ == "__main__":
    main()

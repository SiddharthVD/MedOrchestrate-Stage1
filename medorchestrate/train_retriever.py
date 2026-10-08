"""Local, optional MiniLM training and honest NFCorpus comparisons.

Only aggregate reports belong in Git. Dataset text, raw runs, caches and weights
stay under ignored local directories.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import random
import time
from pathlib import Path

from .benchmark import BM25Index, _read_qrels, digest, load_benchmark
from .evaluate import mrr_at_k, ndcg_at_k, recall_at_k


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "benchmark" / "nfcorpus"
RUN_DIR = ROOT / "data" / "benchmark" / "training_runs"
MODEL_DIR = ROOT / "models" / "nfcorpus-minilm-v1"
BASE_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
BASE_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
SEED = 42
MAX_LENGTH = 128


def load_real_splits(data_dir: Path = DATA_DIR) -> tuple[dict, dict, dict, dict, dict, dict]:
    manifest, documents, queries, test = load_benchmark(data_dir)
    train = _read_qrels(data_dir / "qrels" / "train.tsv", documents, queries)
    dev = _read_qrels(data_dir / "qrels" / "dev.tsv", documents, queries)
    if set(train) & set(dev) or set(train) & set(test) or set(dev) & set(test):
        raise ValueError("Train/dev/test query IDs overlap")
    if not all(grade > 0 for grades in train.values() for grade in grades.values()):
        raise ValueError("This training recipe needs positive-only train qrels")
    return manifest, documents, queries, train, dev, test


def sample_positive_pairs(train: dict, *, seed: int, limit: int) -> list[tuple[str, str]]:
    if limit < 1:
        raise ValueError("Pair limit must be positive")
    rng = random.Random(seed)
    query_ids = sorted(train)
    rng.shuffle(query_ids)
    pairs = [(query_id, rng.choice(sorted(train[query_id]))) for query_id in query_ids[:limit]]
    if len(pairs) < 2:
        raise ValueError("At least two train queries are required")
    return pairs


def safe_batches(pairs: list[tuple[str, str]], train: dict, batch_size: int) -> list[list[tuple[str, str]]]:
    """Do not make another batch positive a known positive for this query."""
    if batch_size < 2:
        raise ValueError("Batch size must be at least two")
    batches = []
    batch: list[tuple[str, str]] = []
    for query_id, doc_id in pairs:
        conflict = any(doc_id in train[other_query] or other_doc in train[query_id]
                       for other_query, other_doc in batch)
        if conflict or len(batch) == batch_size:
            if len(batch) > 1:
                batches.append(batch)
            batch = []
        batch.append((query_id, doc_id))
    if len(batch) > 1:
        batches.append(batch)
    if not batches:
        raise ValueError("No safe contrastive batches could be constructed")
    return batches


def document_text(record: dict) -> str:
    return (record["title"].strip() + " " + record["text"].strip()).strip()


def _packages() -> dict[str, str]:
    import numpy
    import sentence_transformers
    import torch

    return {"python": platform.python_version(), "torch": torch.__version__,
            "sentence_transformers": sentence_transformers.__version__, "numpy": numpy.__version__}


def _base_model(cache_dir: Path):
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(BASE_MODEL, revision=BASE_REVISION, cache_folder=str(cache_dir))
    model.max_seq_length = MAX_LENGTH
    return model


def _model_files_hash(model_dir: Path) -> str:
    files = sorted(path for path in model_dir.rglob("*")
                   if path.is_file() and path.name != "training_manifest.json")
    value = hashlib.sha256()
    for path in files:
        value.update(path.relative_to(model_dir).as_posix().encode("utf-8"))
        value.update(digest(path).encode("ascii"))
    return value.hexdigest()


def train_model(*, data_dir: Path = DATA_DIR, model_dir: Path = MODEL_DIR,
                max_pairs: int = 512, batch_size: int = 8, seed: int = SEED,
                learning_rate: float = 2e-5) -> dict:
    import torch
    import torch.nn.functional as functional

    manifest, documents, queries, train, dev, test = load_real_splits(data_dir)
    pairs = sample_positive_pairs(train, seed=seed, limit=max_pairs)
    batches = safe_batches(pairs, train, batch_size)
    torch.manual_seed(seed)
    torch.set_num_threads(min(4, max(1, torch.get_num_threads())))
    cache_dir = model_dir.parent / "hf-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    model = _base_model(cache_dir)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    model.train()
    start = time.perf_counter()
    loss_total = 0.0
    for index, batch in enumerate(batches, 1):
        query_features = model.tokenize([queries[query_id] for query_id, _ in batch])
        doc_features = model.tokenize([document_text(documents[doc_id]) for _, doc_id in batch])
        optimizer.zero_grad(set_to_none=True)
        query_vectors = functional.normalize(model(query_features)["sentence_embedding"], dim=1)
        doc_vectors = functional.normalize(model(doc_features)["sentence_embedding"], dim=1)
        scores = 20.0 * query_vectors @ doc_vectors.T
        loss = functional.cross_entropy(scores, torch.arange(len(batch)))
        loss.backward()
        optimizer.step()
        loss_total += float(loss.detach())
        if index % 10 == 0 or index == len(batches):
            print(f"train step {index}/{len(batches)} mean_loss={loss_total / index:.4f}", flush=True)
    model_dir.mkdir(parents=True, exist_ok=True)
    model.save(str(model_dir))
    config = {
        "dataset": manifest["dataset_id"], "split": "train", "input_file_sha256": manifest["file_sha256"],
        "train_query_count": len(train), "dev_query_count": len(dev), "test_query_count": len(test),
        "sampled_query_count": len(pairs), "trained_pair_count": sum(map(len, batches)),
        "steps": len(batches), "batch_size": batch_size, "seed": seed, "epochs": 1,
        "learning_rate": learning_rate, "max_seq_length": MAX_LENGTH,
        "document_text": "title + space + text", "query_text": "raw query text",
        "loss": "in_batch_multiple_negatives_cosine_cross_entropy_scale_20",
        "negative_note": "Only known train positives are screened; other in-batch pairs may be unlabeled positives.",
        "base_model": BASE_MODEL, "base_revision": BASE_REVISION, "base_license": "Apache-2.0",
        "packages": _packages(), "device": "cpu", "training_seconds": time.perf_counter() - start,
        "mean_training_loss": loss_total / len(batches),
    }
    config["weights_sha256"] = _model_files_hash(model_dir)
    (model_dir / "training_manifest.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    return config


def _rank_dense(model, documents: dict, queries: dict, qrels: dict, *, k: int) -> tuple[dict, float]:
    import numpy as np

    document_ids = sorted(documents)
    query_ids = sorted(qrels)
    start = time.perf_counter()
    document_vectors = model.encode([document_text(documents[doc_id]) for doc_id in document_ids],
                                    batch_size=32, normalize_embeddings=True, show_progress_bar=False)
    query_vectors = model.encode([queries[query_id] for query_id in query_ids], batch_size=32,
                                 normalize_embeddings=True, show_progress_bar=False)
    matrix = np.asarray(query_vectors) @ np.asarray(document_vectors).T
    ranked = {}
    for query_id, scores in zip(query_ids, matrix):
        indices = np.lexsort((np.asarray(document_ids), -scores))[:k]
        ranked[query_id] = [(document_ids[int(i)], float(scores[i])) for i in indices]
    return ranked, time.perf_counter() - start


def _rank_bm25(documents: dict, queries: dict, qrels: dict, *, k: int) -> tuple[dict, float]:
    start = time.perf_counter()
    index = BM25Index(documents)
    ranked = {query_id: index.rank_scored(queries[query_id], k) for query_id in sorted(qrels)}
    return ranked, time.perf_counter() - start


def _hybrid(bm25: dict, dense: dict, *, k: int) -> dict:
    result = {}
    for query_id in sorted(bm25):
        scores = {}
        for rows in (bm25[query_id], dense[query_id]):
            for rank, (doc_id, _) in enumerate(rows, 1):
                scores[doc_id] = scores.get(doc_id, 0.0) + 1 / (60 + rank)
        result[query_id] = sorted(scores.items(), key=lambda row: (-row[1], row[0]))[:k]
    return result


def _metrics(runs: dict, qrels: dict, *, k: int) -> dict:
    per_query = {}
    for query_id in sorted(qrels):
        ranked = [doc_id for doc_id, _ in runs[query_id][:k]]
        relevant = {doc_id: grade for doc_id, grade in qrels[query_id].items() if grade > 0}
        per_query[query_id] = {
            "recall": recall_at_k(ranked, relevant, k),
            "mrr": mrr_at_k(ranked, relevant, k),
            "ndcg": ndcg_at_k(ranked, relevant, k),
        }
    aggregate = {key: sum(row[key] for row in per_query.values()) / len(per_query)
                 for key in ("recall", "mrr", "ndcg")}
    return {"aggregate": aggregate, "per_query": per_query}


def _paired_ndcg_difference(candidate: dict, baseline: dict) -> dict:
    """Seeded paired query bootstrap; descriptive under incomplete qrels."""
    query_ids = sorted(baseline)
    differences = [candidate[query_id]["ndcg"] - baseline[query_id]["ndcg"]
                   for query_id in query_ids]
    rng = random.Random(SEED)
    samples = sorted(sum(rng.choice(differences) for _ in differences) / len(differences)
                     for _ in range(1000))
    return {"mean_delta": sum(differences) / len(differences),
            "bootstrap_95_percent_interval": [samples[24], samples[974]],
            "query_wins": sum(value > 0 for value in differences),
            "query_losses": sum(value < 0 for value in differences),
            "query_ties": sum(value == 0 for value in differences)}


def _write_run(path: Path, run: dict, route: str) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{query_id}\tQ0\t{doc_id}\t{rank}\t{score:.12g}\t{route}"
             for query_id in sorted(run) for rank, (doc_id, score) in enumerate(run[query_id], 1)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return digest(path)


def evaluate_models(*, split: str, data_dir: Path = DATA_DIR,
                    model_dir: Path = MODEL_DIR, run_dir: Path = RUN_DIR,
                    k: int = 10) -> dict:
    from sentence_transformers import SentenceTransformer

    if split not in {"dev", "test"} or k != 10:
        raise ValueError("Only the frozen dev/test @10 protocol is supported")
    manifest, documents, queries, _, dev, test = load_real_splits(data_dir)
    qrels = dev if split == "dev" else test
    if not (model_dir / "training_manifest.json").is_file():
        raise ValueError("A trained model with training manifest is required")
    training = json.loads((model_dir / "training_manifest.json").read_text(encoding="utf-8"))
    if training["input_file_sha256"] != manifest["file_sha256"]:
        raise ValueError("Model was trained on a different dataset edition")
    if training["weights_sha256"] != _model_files_hash(model_dir):
        raise ValueError("Trained model files have changed")
    selection_path = run_dir / "selection.json"
    if split == "test" and not selection_path.is_file():
        raise ValueError("Freeze development selection before test evaluation")
    if split == "test":
        selection = json.loads(selection_path.read_text(encoding="utf-8"))
        if (selection["weights_sha256"] != training["weights_sha256"] or
                selection["dataset_file_sha256"] != manifest["file_sha256"]):
            raise ValueError("Frozen model hash differs from the trained model")
    cache_dir = model_dir.parent / "hf-cache"
    base = _base_model(cache_dir)
    trained = SentenceTransformer(str(model_dir))
    trained.max_seq_length = MAX_LENGTH
    bm25, bm25_seconds = _rank_bm25(documents, queries, qrels, k=k)
    base_dense, base_seconds = _rank_dense(base, documents, queries, qrels, k=k)
    trained_dense, trained_seconds = _rank_dense(trained, documents, queries, qrels, k=k)
    routes = {
        "bm25": bm25,
        "untuned_dense": base_dense,
        "trained_dense": trained_dense,
        "bm25_trained_dense_rrf60": _hybrid(bm25, trained_dense, k=k),
    }
    result = {
        "dataset": manifest["dataset_id"], "edition": manifest["edition"], "split": split,
        "judged_query_count": len(qrels), "document_count": len(documents), "k": k,
        "binary_relevance_threshold": ">0", "ndcg": "graded", "primary_metric": "ndcg@10",
        "model": BASE_MODEL, "base_revision": BASE_REVISION,
        "trained_weights_sha256": training["weights_sha256"],
        "file_sha256": manifest["file_sha256"],
        "times_seconds": {"bm25_index_and_search": bm25_seconds,
                          "untuned_encode_and_search": base_seconds,
                          "trained_encode_and_search": trained_seconds},
        "routes": {},
    }
    measures_by_route = {}
    for route, run in routes.items():
        measures = _metrics(run, qrels, k=k)
        measures_by_route[route] = measures
        run_hash = _write_run(run_dir / f"{split}-{route}-k{k}.trec", run, route)
        result["routes"][route] = {"metrics": measures["aggregate"], "run_sha256": run_hash}
    result["paired_ndcg_vs_bm25"] = {
        route: _paired_ndcg_difference(measures_by_route[route]["per_query"],
                                       measures_by_route["bm25"]["per_query"])
        for route in routes if route != "bm25"
    }
    if split == "dev":
        selected = max(routes, key=lambda route: (result["routes"][route]["metrics"]["ndcg"], -list(routes).index(route)))
        selection = {"selected_route": selected, "primary_metric": "ndcg@10",
                     "dev_metric": result["routes"][selected]["metrics"]["ndcg"],
                     "weights_sha256": training["weights_sha256"], "dataset_file_sha256": manifest["file_sha256"]}
        run_dir.mkdir(parents=True, exist_ok=True)
        selection_path.write_text(json.dumps(selection, indent=2) + "\n", encoding="utf-8")
        result["selection"] = selection
    else:
        result["selection"] = selection
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / f"{split}-aggregate.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--data-dir", type=Path, default=DATA_DIR)
    train = commands.add_parser("train")
    train.add_argument("--data-dir", type=Path, default=DATA_DIR)
    train.add_argument("--model-dir", type=Path, default=MODEL_DIR)
    train.add_argument("--max-pairs", type=int, default=512)
    train.add_argument("--batch-size", type=int, default=8)
    evaluate = commands.add_parser("evaluate")
    evaluate.add_argument("--split", choices=("dev", "test"), required=True)
    evaluate.add_argument("--data-dir", type=Path, default=DATA_DIR)
    evaluate.add_argument("--model-dir", type=Path, default=MODEL_DIR)
    evaluate.add_argument("--run-dir", type=Path, default=RUN_DIR)
    args = parser.parse_args()
    if args.command == "prepare":
        manifest, documents, queries, train_qrels, dev_qrels, test_qrels = load_real_splits(args.data_dir)
        report = {"dataset": manifest["dataset_id"], "documents": len(documents), "queries": len(queries),
                  "split_queries": {"train": len(train_qrels), "dev": len(dev_qrels), "test": len(test_qrels)},
                  "train_positive_pairs": sum(map(len, train_qrels.values())),
                  "file_sha256": manifest["file_sha256"]}
    elif args.command == "train":
        report = train_model(data_dir=args.data_dir, model_dir=args.model_dir,
                             max_pairs=args.max_pairs, batch_size=args.batch_size)
    else:
        report = evaluate_models(split=args.split, data_dir=args.data_dir,
                                 model_dir=args.model_dir, run_dir=args.run_dir)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

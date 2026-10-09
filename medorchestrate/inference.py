"""Optional server inference using the same trained ONNX artifact as the browser."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "site/model"
EMBEDDINGS = ROOT / "site/data/research-embeddings.json"
_encoder = None
_lock = Lock()


def text_hash(document):
    return hashlib.sha256((document["title"] + " " + document["abstract"]).encode()).hexdigest()


class ModelUnavailable(Exception):
    pass


class ResearchEncoder:
    def __init__(self):
        try:
            import numpy as np
            import onnxruntime as ort
            from tokenizers import Tokenizer
        except ImportError as exc:
            raise ModelUnavailable("Install requirements-inference.txt for server model search; the browser model remains available.") from exc
        self.np = np
        self.manifest = json.loads((MODEL / "manifest.json").read_text())
        model_file = MODEL / self.manifest["file"]
        if hashlib.sha256(model_file.read_bytes()).hexdigest() != self.manifest["sha256"]:
            raise ModelUnavailable("Model integrity check failed")
        self.tokenizer = Tokenizer.from_file(str(MODEL / "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=self.manifest["max_length"])
        self.tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        self.session = ort.InferenceSession(str(model_file), sess_options=options, providers=["CPUExecutionProvider"])

    def encode(self, texts):
        vectors = []
        for start in range(0, len(texts), 8):
            batch = self.tokenizer.encode_batch(texts[start:start + 8])
            feeds = {name: self.np.array([getattr(item, attr) for item in batch], dtype=self.np.int64)
                     for name, attr in (("input_ids", "ids"), ("attention_mask", "attention_mask"), ("token_type_ids", "type_ids"))}
            vectors.extend(self.session.run(["embeddings"], feeds)[0].tolist())
        return vectors


def encoder():
    global _encoder
    with _lock:
        if _encoder is None:
            _encoder = ResearchEncoder()
    return _encoder


def rank_model(query, documents, route="semantic", limit=20):
    from .research import _rank
    if route not in {"semantic", "hybrid"}:
        raise ValueError("Unknown research model route")
    if not documents:
        return []
    model = encoder()
    saved = {}
    try:
        payload = json.loads(EMBEDDINGS.read_text())
        if payload["model_sha256"] == model.manifest["sha256"]:
            saved = {row["id"]: row for row in payload["documents"]}
    except (OSError, ValueError, KeyError):
        pass
    missing = [doc for doc in documents if doc["id"] not in saved or saved[doc["id"]].get("text_sha256") != text_hash(doc)]
    for doc, embedding in zip(missing, model.encode([doc["title"] + " " + doc["abstract"] for doc in missing])):
        saved[doc["id"]] = {"embedding": embedding, "text_sha256": text_hash(doc)}
    query_vector = model.np.array(model.encode([query])[0])
    dense = sorted(((doc, float(model.np.dot(query_vector, saved[doc["id"]]["embedding"]))) for doc in documents),
                   key=lambda row: (-row[1], row[0]["id"]))
    if route == "semantic":
        return [{**doc, "score": score, "semantic_score": score} for doc, score in dense[:limit]]
    lexical_ranks = {doc["id"]: i + 1 for i, doc in enumerate(_rank(documents, query, len(documents)))}
    fused = [{**doc, "semantic_score": score,
              "score": 1 / (60 + i + 1) + (1 / (60 + lexical_ranks[doc["id"]]) if doc["id"] in lexical_ranks else 0)}
             for i, (doc, score) in enumerate(dense)]
    return sorted(fused, key=lambda doc: (-doc["score"], doc["id"]))[:limit]

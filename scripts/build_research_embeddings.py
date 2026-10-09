"""Version and precompute the licensed pilot with the deployed trained model."""
import hashlib
import json
from medorchestrate.inference import EMBEDDINGS, ROOT, ResearchEncoder, text_hash


def main():
    corpus_path = ROOT / "site/data/research-corpus.json"
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    model = ResearchEncoder()
    documents = corpus["documents"]
    vectors = model.encode([doc["title"] + " " + doc["abstract"] for doc in documents])
    payload = {"model_version": model.manifest["version"], "model_sha256": model.manifest["sha256"],
               "corpus_version": corpus["version"], "corpus_updated_at": corpus["updated_at"],
               "corpus_sha256": hashlib.sha256(corpus_path.read_bytes()).hexdigest(),
               "dimensions": model.manifest["dimensions"],
               "documents": [{"id": doc["id"], "text_sha256": text_hash(doc),
                              "embedding": [round(value, 8) for value in vector]}
                             for doc, vector in zip(documents, vectors)]}
    temporary = EMBEDDINGS.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    temporary.replace(EMBEDDINGS)
    print(json.dumps({"documents": len(documents), "model": payload["model_version"],
                      "corpus_sha256": payload["corpus_sha256"], "bytes": EMBEDDINGS.stat().st_size}))


if __name__ == "__main__":
    main()

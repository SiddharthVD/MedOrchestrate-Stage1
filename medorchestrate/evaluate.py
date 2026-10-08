"""Reproducible retrieval checks against explicitly fictional relevance judgments."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from .search import DATA, load_fixture, run_search


ROUTES = ("direct_bm25", "expanded_bm25", "adaptive")


def recall_at_k(ranked: list[str], relevant: dict[str, int], k: int) -> float:
    return len(set(ranked[:k]) & set(relevant)) / len(relevant) if relevant else 0.0


def mrr_at_k(ranked: list[str], relevant: dict[str, int], k: int) -> float:
    return next((1 / position for position, doc_id in enumerate(ranked[:k], 1) if relevant.get(doc_id, 0) > 0), 0.0)


def ndcg_at_k(ranked: list[str], relevant: dict[str, int], k: int) -> float:
    def dcg(grades: list[int]) -> float:
        return sum((2 ** grade - 1) / math.log2(position + 1) for position, grade in enumerate(grades, 1))

    ideal = dcg(sorted(relevant.values(), reverse=True)[:k])
    return dcg([relevant.get(doc_id, 0) for doc_id in ranked[:k]]) / ideal if ideal else 0.0


def evaluate(qrels_path: Path = DATA / "demo_qrels.json", k: int = 5) -> dict:
    if k < 1:
        raise ValueError("k must be positive")
    cases, documents = load_fixture()
    case_map = {case["id"]: case for case in cases}
    doc_ids = {doc["id"] for doc in documents}
    qrels = json.loads(qrels_path.read_text(encoding="utf-8"))
    if qrels.get("dataset") != "fictional-demo-v1" or not qrels.get("queries"):
        raise ValueError("Only nonempty fictional demo judgments are supported")
    query_ids: set[str] = set()
    for query in qrels["queries"]:
        if query["id"] in query_ids or query["case_id"] not in case_map:
            raise ValueError("Duplicate query ID or unknown case ID")
        query_ids.add(query["id"])
        grades = query["relevance"]
        if not grades or not set(grades) <= doc_ids or any(type(grade) is not int or grade not in (1, 2) for grade in grades.values()):
            raise ValueError(f"Invalid relevance judgments for {query['id']}")
    routes = {}
    for route in ROUTES:
        per_query = []
        for query in qrels["queries"]:
            result = run_search(query["question"], case_map[query["case_id"]], query["as_of"], route, documents)
            ranked = [record["id"] for record in result["results"]]
            grades = query["relevance"]
            per_query.append({"query_id": query["id"], "executed_route": result["executed_route"], "ranked_ids": ranked[:k], "recall_at_k": recall_at_k(ranked, grades, k), "mrr_at_k": mrr_at_k(ranked, grades, k), "ndcg_at_k": ndcg_at_k(ranked, grades, k)})
        routes[route] = {
            "mean_recall_at_k": sum(row["recall_at_k"] for row in per_query) / len(per_query),
            "mean_mrr_at_k": sum(row["mrr_at_k"] for row in per_query) / len(per_query),
            "mean_ndcg_at_k": sum(row["ndcg_at_k"] for row in per_query) / len(per_query),
            "queries": per_query,
        }
    return {"dataset": qrels["dataset"], "annotation": qrels["annotation"], "query_count": len(qrels["queries"]), "k": k, "routes": routes}


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate lexical routes on fictional demo qrels")
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = json.dumps(evaluate(k=args.k), indent=2)
    if args.output:
        args.output.write_text(report + "\n", encoding="utf-8")
        print(args.output)
    else:
        print(report)


if __name__ == "__main__":
    main()

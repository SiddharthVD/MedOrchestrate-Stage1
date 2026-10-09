"""HTTP application for a local research workbench demonstration."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory

from .benchmark import benchmark_status, evaluate_benchmark
from .corpus import read_imported
from .evaluate import evaluate
from .search import load_fixture, run_search, strict_date, valid_facts


ROOT = Path(__file__).resolve().parent.parent
app = Flask(__name__, template_folder=str(ROOT / "templates"), static_folder=str(ROOT / "static"))
CASES, DOCUMENTS = load_fixture()


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/demo-data/<filename>")
def demo_data(filename):
    if filename not in {"cases.json", "documents.json", "demo_qrels.json"}:
        return jsonify({"error": "Unknown demonstration fixture"}), 404
    return send_from_directory(ROOT / "data", filename)


@app.get("/research/")
def research_home():
    return send_from_directory(ROOT / "site", "index.html")


@app.get("/research/<path:filename>")
def research_assets(filename):
    if filename.endswith("/"):
        filename += "index.html"
    return send_from_directory(ROOT / "site", filename)


@app.get("/api/research/status")
def research_status():
    from .research import status as source_status
    return jsonify(source_status())


@app.get("/api/research/search")
def research_search():
    from .research import ResearchError, search_live, search_snapshot
    try:
        mode = request.args.get("mode", "snapshot")
        if mode not in {"live", "snapshot"}:
            raise ValueError("Unknown research source mode")
        filters = {"year_from": int(request.args["year_from"]) if request.args.get("year_from") else None,
                   "year_to": int(request.args["year_to"]) if request.args.get("year_to") else None,
                   "publication_type": request.args.get("publication_type", "all"),
                   "source": request.args.get("source", "all"), "limit": int(request.args.get("limit", "20"))}
        output = (search_live if mode == "live" else search_snapshot)(request.args.get("query", ""), **filters)
        output["executed_route"] = "research_bm25"
        output["evaluation"] = "Exploratory literature discovery; not the evaluated patient-aware engine"
        return jsonify(output)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except ResearchError as error:
        return jsonify({"error": str(error), "mode": request.args.get("mode", "snapshot"), "fallback_used": False}), 502


@app.get("/api/status")
def status():
    imported, import_error = _optional_imported()
    response = {"project": "MedOrchestrate", "corpus": "fictional-demo-v1", "cases": len(CASES), "documents": len(DOCUMENTS), "available_corpora": ["fictional-demo-v1"] + (["imported-local-v1"] if imported else []), "available_routes": ["direct_bm25", "expanded_bm25", "adaptive"], "unavailable_routes": ["dense", "hybrid", "base_rewrite", "lora_rewrite"], "evaluation": "fictional fixture qrels; no clinical validation"}
    if import_error:
        response["import_error"] = import_error
    return jsonify(response)


def _optional_imported() -> tuple[dict | None, str | None]:
    try:
        return read_imported(), None
    except (ValueError, OSError) as error:
        return None, f"Imported corpus invalid: {error}"


@app.get("/api/corpora")
def corpora():
    options = [{"id": "fictional-demo-v1", "kind": "fictional_demo", "documents": len(DOCUMENTS), "provenance_note": "Every record is invented for this software demonstration."}]
    imported, import_error = _optional_imported()
    if imported:
        options.append({"id": imported["corpus_id"], "kind": imported["kind"], "documents": len(imported["documents"]), "provenance_note": imported["provenance_note"]})
    response = {"corpora": options}
    if import_error:
        response["import_error"] = import_error
    return jsonify(response)


@app.get("/api/cases")
def cases():
    return jsonify([{key: value for key, value in case.items() if key != "facts"} for case in CASES])


@app.get("/api/cases/<case_id>")
def case_detail(case_id):
    case = next((row for row in CASES if row["id"] == case_id), None)
    if not case:
        return jsonify({"error": "Unknown case"}), 404
    as_of = request.args.get("as_of", date.today().isoformat())
    try:
        as_of = strict_date(as_of)
    except ValueError:
        return jsonify({"error": "Invalid as_of date"}), 400
    return jsonify({**case, "facts": valid_facts(case, as_of), "as_of": as_of})


@app.post("/api/search")
def search():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Expected a JSON object"}), 400
    try:
        case, as_of, documents, corpus_id, question = _search_context(payload)
        output = run_search(question, case, as_of, str(payload.get("route", "adaptive")), documents, corpus_id)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    return jsonify(output)


def _search_context(payload: dict) -> tuple[dict, str, list[dict], str, str]:
    case = next((row for row in CASES if row["id"] == payload.get("case_id")), None)
    if not case:
        raise ValueError("Select a known fictional case")
    as_of = strict_date(payload.get("as_of", date.today().isoformat()))
    question = payload.get("question", "")
    if not isinstance(question, str):
        raise ValueError("Question must be text")
    if not question.strip() or len(question) > 500:
        raise ValueError("Question must be 1 to 500 characters")
    corpus_id = payload.get("corpus", "fictional-demo-v1")
    if corpus_id == "fictional-demo-v1":
        documents = DOCUMENTS
    elif corpus_id == "imported-local-v1":
        imported = read_imported()
        if imported is None:
            raise ValueError("No imported corpus is available")
        documents = imported["documents"]
    else:
        raise ValueError("Unknown corpus")
    return case, as_of, documents, corpus_id, question


@app.post("/api/compare")
def compare():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Expected a JSON object"}), 400
    try:
        case, as_of, documents, corpus_id, question = _search_context(payload)
        comparisons = {route: run_search(question, case, as_of, route, documents, corpus_id) for route in ("direct_bm25", "expanded_bm25", "adaptive")}
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    return jsonify({"case_id": case["id"], "as_of": as_of, "question": question, "corpus": corpus_id, "comparisons": comparisons})


@app.get("/api/evaluation")
def evaluation():
    return jsonify(evaluate())


@app.get("/api/benchmark/status")
def real_benchmark_status():
    return jsonify(benchmark_status())


@app.get("/api/benchmark/evaluation")
def real_benchmark_evaluation():
    try:
        k = int(request.args.get("k", "10"))
        report = evaluate_benchmark(k=k)
    except (ValueError, OSError) as error:
        return jsonify({"error": str(error)}), 409
    return jsonify(report)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=False)

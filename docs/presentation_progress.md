# Faculty progress checkpoint

Date: 8 October 2026. Target presentation: 9 October 2026.

## Verified result

A runnable local workbench now demonstrates fictional case inspection, date limited facts, a research question, ranked fixture evidence, adaptive lexical route selection, and a transparent execution trace. Direct, expanded, and adaptive routes can be compared on the same invented corpus.

The fixture contains **3 fictional cases and 12 invented records**. It contains no real papers or clinical judgments. The handoff's earlier report of 45 cases, 60 documents, and 33 tests was not verified because the existing repository was not found.

## Commands and outcomes

`python --version` reported Python 3.13.0. Flask 3.1.3 was installed locally. `python -m unittest discover -s tests -v` passed 13 tests. See `artifacts/demo/tests.txt` for raw output. `python launch.py` bound the server, and HTTP requests to the page, assets, status, search, compare, and evaluation succeeded. `artifacts/demo/http_smoke.json` contains the search response. `artifacts/demo/fixture_evaluation.json` contains metrics for six invented questions. Browser access from the Codex in-app browser was blocked; a browser check through `start.cmd` on the user's machine remains.

## Limitations

The adaptive route is a simple rule, not a trained controller. BM25 scores and evaluation metrics concern invented records only. No external benchmark relevance, clinical benefit, model fine tuning, or superiority claim follows from this demonstration.

## Next research step

Locate and inspect the original repository if it exists. Then select a licensed biomedical benchmark, verify corpus and qrels compatibility, freeze evaluation splits and budgets, and build a strong fixed baseline before testing adaptive improvements.

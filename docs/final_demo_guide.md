# MedOrchestrate faculty demonstration

## Launch

Double-click `start.cmd` from the project folder. It checks Python and Flask, binds the server, then opens http://127.0.0.1:8000 in the default browser. Keep the terminal window open during the demonstration. If the browser is already open, refresh after the terminal says MedOrchestrate is ready. If startup fails, run `python -m pip install -r requirements.txt` in a fresh PowerShell terminal, then `python launch.py`.

## Walkthrough

1. On Dashboard, point out the fixture counts and route availability.
2. Open Patient Case Explorer. Select **Fictional type 2 diabetes case**, date `2026-10-08`, and show the available facts. Change the date to `2026-03-01` to show that albuminuria is excluded before availability, then restore `2026-10-08`.
3. Open Medical Evidence Search. Use the suggested question and **Adaptive rule**. Run the search. Show ranked invented records and expand the execution trace to explain the route, added terms, available facts, and retrieval calls.
4. Open Strategy Comparison and run the fixed direct, fixed expanded, and adaptive routes. Explain that rank and timing differences are local fixture observations, not evidence of medical relevance improvement.
5. Open Research Evaluation. Its Recall@5, MRR@5 and nDCG@5 values use six hand-labeled invented questions and records. Explain the external benchmark and independent judgments still needed.

## Offline backup

If the browser or server fails, open `artifacts/demo/http_smoke.json`, `artifacts/demo/fixture_evaluation.json`, and `artifacts/demo/tests.txt`. Explain the case, selected route, top ranked fixture records, and actual test result from those saved files. The records are explicitly invented. `artifacts/demo/environment.json` records the machine snapshot used for this checkpoint.

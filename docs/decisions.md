# Decisions

- 2026-10-08: Siddharth confirmed there is no existing code repository. Build Stage 1 from scratch in this project folder.
- 2026-10-08: Used invented records with no publisher links to avoid implying that the demonstration retrieves real papers.
- 2026-10-08: Kept retrieval CPU friendly and dependency light. Dense models and training wait for data, hardware, and protocol checks.
- 2026-10-08: Added hand-labeled judgments for invented records solely to exercise retrieval metrics. They cannot support a research claim.
- 2026-10-08: Run the local server through `start.cmd` or `python launch.py`; the server must remain running for the workbench URL to load.

"""Refresh the permission-filtered Europe PMC research pilot."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from medorchestrate.research import ROOT, SNAPSHOT, build_pilot


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a curated Europe PMC pilot from licensed OA core records")
    parser.add_argument("--target", type=int, default=225, help="Target 200-250 real records (default 225)")
    args = parser.parse_args()
    if not 200 <= args.target <= 250:
        parser.error("--target must be 200 to 250 for the published pilot")
    corpus = build_pilot(target=args.target)
    payload = json.dumps(corpus, ensure_ascii=False, separators=(",", ":")) + "\n"
    destinations = (SNAPSHOT, ROOT / "site" / "data" / "research-corpus.json")
    for destination in destinations:
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        temporary.write_text(payload, encoding="utf-8")
        temporary.replace(destination)
    sha256 = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    (SNAPSHOT.parent / "pilot.sha256").write_text(sha256 + "  pilot.json\n", encoding="ascii")
    print(json.dumps({"documents": len(corpus["documents"]), "topics": len(corpus["topics"]),
                      "updated_at": corpus["updated_at"], "sha256": sha256,
                      "snapshot": str(SNAPSHOT)}, indent=2))


if __name__ == "__main__":
    main()

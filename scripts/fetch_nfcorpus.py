"""Fetch the pinned BEIR NFCorpus package for local academic evaluation.

Dataset files stay under the ignored data/benchmark/ directory. This script
does not grant redistribution rights; consult the original NFCorpus terms.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
URL = "https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/nfcorpus.zip"
ARCHIVE_BYTES = 2_448_432
ARCHIVE_MD5 = "a89dba18a62ef92f7d323ec890a0d38d"
ARCHIVE_SHA256 = "efe5be03f8c5b86a5870102d0599d227c8c6e2484328e68c6522560385671b0b"
FILES = {
    "corpus.jsonl": "10cc83ef1826b1425e6a87090b5140b39b27755d5a27e48215a88611c899991f",
    "queries.jsonl": "d024e6621b84925d485ae473d316a0c3af31c62c8068a59fb29d22f7613aef2a",
    "qrels/train.tsv": "6336b80f9bffc4f063f3aa450047ad35c0b7c534efe4a6ba35e16dbace047f6a",
    "qrels/dev.tsv": "b1d38b5e8f78c4a5820bce2b7ec2db54911d7690dc601e76811846b211180bd8",
    "qrels/test.tsv": "f8fba6ef3d4dd9c3a242a8ba4ae38276fc3622fce7dcbae764766d564542fd2a",
}


def digest(path: Path, algorithm: str) -> str:
    value = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def fetch(root: Path) -> dict:
    root.mkdir(parents=True, exist_ok=True)
    archive = root / "nfcorpus.zip"
    if not archive.exists():
        temporary = root / "nfcorpus.zip.partial"
        try:
            with urllib.request.urlopen(URL, timeout=60) as source, temporary.open("wb") as target:
                shutil.copyfileobj(source, target)
            if temporary.stat().st_size != ARCHIVE_BYTES or digest(temporary, "md5") != ARCHIVE_MD5 or digest(temporary, "sha256") != ARCHIVE_SHA256:
                raise ValueError("The downloaded archive does not match the pinned BEIR edition")
            os.replace(temporary, archive)
        finally:
            temporary.unlink(missing_ok=True)
    if archive.stat().st_size != ARCHIVE_BYTES or digest(archive, "md5") != ARCHIVE_MD5 or digest(archive, "sha256") != ARCHIVE_SHA256:
        raise ValueError("The local archive does not match the pinned BEIR edition")

    dataset = root / "nfcorpus"
    with zipfile.ZipFile(archive) as bundle:
        for relative, expected in FILES.items():
            member = bundle.getinfo("nfcorpus/" + relative)
            if member.file_size > 100_000_000:
                raise ValueError(f"Unexpectedly large archive member: {relative}")
            target = dataset / relative
            if target.exists() and digest(target, "sha256") == expected:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + ".partial")
            try:
                with bundle.open(member) as source, temporary.open("wb") as output:
                    shutil.copyfileobj(source, output)
                if digest(temporary, "sha256") != expected:
                    raise ValueError(f"Extracted file hash mismatch: {relative}")
                os.replace(temporary, target)
            finally:
                temporary.unlink(missing_ok=True)

    return {
        "dataset_dir": str(dataset),
        "archive_sha256": ARCHIVE_SHA256,
        "files_sha256": FILES,
        "terms": "Original NFCorpus permits academic use; public redistribution is not established.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT / "data" / "benchmark")
    args = parser.parse_args()
    print(json.dumps(fetch(args.root), indent=2))


if __name__ == "__main__":
    main()

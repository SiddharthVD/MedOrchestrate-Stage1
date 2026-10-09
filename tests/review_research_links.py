"""Independent, bounded review of research-record source links.

Usage: python tests/review_research_links.py path/to/snapshot.json [--live --sample 3]

The default run is offline. --live checks a small sample of official links using
HEAD and, when necessary, a ranged GET. It never downloads article full text.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


OFFICIAL_HOSTS = (
    "europepmc.org",
    "ebi.ac.uk",
    "pmc.ncbi.nlm.nih.gov",
    "pubmed.ncbi.nlm.nih.gov",
    "doi.org",
)
LINK_FIELDS = ("source_url", "fulltext_url", "pdf_url")
ALLOWED_LICENSES = {"cc by", "cc by 4.0", "cc0", "cc0 1.0", "cc zero"}
MAX_READ = 4096


def host_allowed(host: str) -> bool:
    return any(host == allowed or host.endswith("." + allowed) for allowed in OFFICIAL_HOSTS)


def safe_official_url(value: object) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme == "https"
            and bool(parsed.hostname)
            and host_allowed(parsed.hostname.lower())
            and not parsed.username
            and not parsed.password
            and parsed.port in (None, 443)
            and not any(ord(char) < 32 for char in value)
        )
    except ValueError:
        return False


def records_from(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = next((payload[key] for key in ("documents", "records", "results") if isinstance(payload.get(key), list)), None)
    else:
        rows = None
    if not isinstance(rows, list) or not rows:
        raise ValueError("Expected a nonempty record list or documents/records/results array")
    if not all(isinstance(row, dict) for row in rows):
        raise ValueError("Every research record must be an object")
    return rows


def structural_findings(records: list[dict], *, today: date) -> list[str]:
    findings: list[str] = []
    ids: set[str] = set()
    for index, record in enumerate(records):
        label = str(record.get("id") or f"row {index + 1}")
        if label in ids:
            findings.append(f"{label}: duplicate ID")
        ids.add(label)
        if not str(record.get("title") or "").strip():
            findings.append(f"{label}: missing title")
        if not safe_official_url(record.get("source_url")):
            findings.append(f"{label}: missing or unsafe official source_url")
        for field in ("fulltext_url", "pdf_url"):
            value = record.get(field)
            if value and not safe_official_url(value):
                findings.append(f"{label}: unsafe {field}")
        license_name = re.sub(r"\s+", " ", str(record.get("license") or "").replace("_", " ").replace("-", " ").lower()).strip()
        if license_name not in ALLOWED_LICENSES:
            findings.append(f"{label}: license is not confirmed CC BY or CC0 ({record.get('license')!r})")
        published = str(record.get("published_on") or "")
        if published:
            try:
                parsed_date = date.fromisoformat(published)
                if parsed_date > today:
                    findings.append(f"{label}: publication date is in the future")
            except ValueError:
                findings.append(f"{label}: invalid published_on date")
        pmcid = str(record.get("pmcid") or "")
        if pmcid and not re.fullmatch(r"PMC\d+", pmcid):
            findings.append(f"{label}: malformed PMCID")
        if record.get("source") == "fictional-demo-v1" or record.get("fixture") is True:
            findings.append(f"{label}: fictional record in research snapshot")
    return findings


def check_http(url: str, *, expect_pdf: bool, timeout: float) -> str | None:
    """Return a finding or None; only a small byte range may be fetched."""
    headers = {"User-Agent": "MedOrchestrate-link-review/1.0 (academic QA)", "Range": f"bytes=0-{MAX_READ - 1}"}
    for method in ("HEAD", "GET"):
        try:
            with urlopen(Request(url, headers=headers, method=method), timeout=timeout) as response:
                final_url = response.geturl()
                if not safe_official_url(final_url):
                    return f"redirected to non-official URL: {final_url}"
                if response.status >= 400:
                    return f"HTTP {response.status}"
                content_type = response.headers.get("Content-Type", "").lower()
                if expect_pdf and method == "GET":
                    body = response.read(MAX_READ)
                    if "application/pdf" not in content_type and not body.startswith(b"%PDF-"):
                        return f"PDF link returned {content_type or 'unknown content type'}, not PDF bytes"
                elif expect_pdf and method == "HEAD" and "application/pdf" not in content_type:
                    continue
                return None
        except HTTPError as error:
            if method == "HEAD" and error.code in (403, 405, 429):
                continue
            return f"HTTP {error.code}"
        except (URLError, TimeoutError, OSError) as error:
            if method == "HEAD":
                continue
            return f"request failed: {error}"
    return "could not verify URL"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--live", action="store_true", help="Make bounded HTTP requests to official source links")
    parser.add_argument("--sample", type=int, default=3, help="Maximum records sampled for live link checks")
    parser.add_argument("--timeout", type=float, default=6.0)
    args = parser.parse_args()
    if not 0 <= args.sample <= 20 or not 0 < args.timeout <= 30:
        parser.error("sample must be 0..20 and timeout must be 0..30 seconds")
    try:
        rows = records_from(args.snapshot)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Input error: {error}", file=sys.stderr)
        return 2
    findings = structural_findings(rows, today=date.today())
    if args.live:
        for row in rows[: args.sample]:
            for field in LINK_FIELDS:
                url = row.get(field)
                if url and safe_official_url(url):
                    finding = check_http(url, expect_pdf=field == "pdf_url", timeout=args.timeout)
                    if finding:
                        findings.append(f"{row.get('id', '?')} {field}: {finding}")
    print(f"Reviewed {len(rows)} records; live sample {args.sample if args.live else 0}; findings {len(findings)}")
    for finding in findings:
        print(f"- {finding}")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())

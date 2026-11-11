#!/usr/bin/env python3
"""Import explicitly selected, verified pi-literature-review search records."""

import argparse
import json
import re
import sys
from pathlib import Path

from research_wiki import ingest_paper


def record_id(record):
    doi = record["doi"].strip()
    arxiv = record["arxiv_id"].strip()
    if doi:
        return f"doi:{doi.lower()}"
    return f"arxiv:{arxiv.lower()}"


def normalize_id(value):
    value = value.strip()
    if value.lower().startswith("arxiv:"):
        return "arxiv:" + re.sub(r"v\d+$", "", value[6:].lower())
    if value.lower().startswith("doi:"):
        value = value[4:]
    return "doi:" + re.sub(r"_v\d+$", "", value.lower())


def validate_payload(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("query"), str) or not isinstance(payload.get("generated"), str):
        raise ValueError("not a pi-literature-review lit-search JSON sidecar")
    if not isinstance(payload.get("sources_used"), list) or not isinstance(payload.get("results"), list) or not isinstance(payload.get("dropped"), list):
        raise ValueError("lit-search JSON has an unknown structure")
    records = list(payload["results"])
    for item in payload["dropped"]:
        if not isinstance(item, dict) or not isinstance(item.get("record"), dict):
            raise ValueError("lit-search dropped record has an unknown structure")
        records.append(item["record"])
    if not all(isinstance(record, dict) for record in records):
        raise ValueError("lit-search record is not an object")
    return records


def validate_selected(record):
    if not isinstance(record, dict):
        raise ValueError("lit-search record is not an object")
    if not isinstance(record.get("title"), str) or not record["title"].strip():
        raise ValueError("lit-search record has no title")
    if not isinstance(record.get("authors"), list) or not record["authors"] or not all(isinstance(a, str) and a.strip() for a in record["authors"]):
        raise ValueError("lit-search record has invalid authors")
    if not isinstance(record.get("year"), (str, int)) or not str(record["year"]).isdigit():
        raise ValueError("lit-search record has invalid year")
    if record.get("venue") is not None and not isinstance(record["venue"], str):
        raise ValueError("lit-search record has invalid venue")
    if not isinstance(record.get("doi"), str) or not isinstance(record.get("arxiv_id"), str):
        raise ValueError("lit-search record has invalid identifiers")
    if not record["doi"].strip() and not record["arxiv_id"].strip():
        raise ValueError("lit-search record has no DOI or arXiv ID")
    if not isinstance(record.get("verified"), bool):
        raise ValueError("lit-search record has no verification status")
    sources = record.get("sources", [record.get("source")])
    if not isinstance(sources, list) or not sources or not all(isinstance(s, str) and s for s in sources):
        raise ValueError("lit-search record has invalid sources")


def existing_ids(wiki):
    ids = set()
    for page in (wiki / "papers").glob("*.md"):
        content = page.read_text(encoding="utf-8")
        frontmatter = content.split("---", 2)
        if len(frontmatter) < 3:
            continue
        for kind in ("doi", "arxiv"):
            match = re.search(rf"^  {kind}: [\"']?([^\"'\n]+)", frontmatter[1], re.MULTILINE)
            if match and match.group(1).strip() != "null":
                ids.add(normalize_id(f"{kind}:{match.group(1).strip()}"))
    return ids


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="lit-search JSON sidecar")
    parser.add_argument("--wiki", required=True, type=Path)
    parser.add_argument("--ids", required=True, nargs="+", help="DOI or arXiv IDs explicitly selected by the user")
    args = parser.parse_args()
    try:
        payload = json.loads(args.source.read_text(encoding="utf-8"))
        records = validate_payload(payload)
        if not (args.wiki / "papers").is_dir():
            raise ValueError("wiki is not initialized; run research_wiki.py init first")
        by_id = {}
        for record in records:
            for key in ("doi", "arxiv_id"):
                value = record.get(key)
                if not isinstance(value, str):
                    continue
                value = value.strip().lower()
                if value:
                    identity = normalize_id(f"{'arxiv' if key == 'arxiv_id' else 'doi'}:{value}")
                    prior = by_id.get(identity)
                    if prior is not None and (
                        prior.get("title") != record.get("title")
                        or prior.get("authors") != record.get("authors")
                        or str(prior.get("year")) != str(record.get("year"))
                    ):
                        raise ValueError(f"conflicting records for identifier: {identity}")
                    by_id.setdefault(identity, record)
        selected = []
        for supplied in args.ids:
            key = normalize_id(supplied)
            record = by_id.get(key)
            if record is None:
                raise ValueError(f"selected identifier absent from sidecar: {supplied}")
            validate_selected(record)
            if not record["verified"]:
                raise ValueError(f"selected identifier is unverified: {supplied}")
            if record not in selected:
                selected.append(record)
        seen = existing_ids(args.wiki)
        for record in selected:
            keys = {normalize_id(f"doi:{record['doi']}")} if record["doi"].strip() else set()
            if record["arxiv_id"].strip():
                keys.add(normalize_id(f"arxiv:{record['arxiv_id']}"))
            if keys & seen:
                print(f"Skipped existing {record_id(record)}")
                continue
            sources = record.get("sources", [record.get("source")])
            provenance = {"source_json": str(args.source.resolve()), "record_id": record_id(record), "record_sources": sources}
            meta = {"title": record["title"], "authors": record["authors"], "year": int(record["year"]),
                    "venue": record.get("venue") or "unknown", "doi": record["doi"], "arxiv_id": record["arxiv_id"]}
            ingest_paper(str(args.wiki), arxiv_id=record["arxiv_id"], title=record["title"],
                         authors=record["authors"], year=int(record["year"]), venue=meta["venue"],
                         doi=record["doi"], prefetched_meta=meta, provenance=provenance)
            seen.update(keys)
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

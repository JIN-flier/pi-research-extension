import json
import copy
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "literature_import.py"
WIKI = ROOT / "tools" / "research_wiki.py"


class LiteratureImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.wiki = self.root / "research-wiki"
        subprocess.run([sys.executable, str(WIKI), "init", str(self.wiki)], check=True, capture_output=True)
        self.source = self.root / "lit-search" / "run.json"
        self.source.parent.mkdir()
        self.payload = {
            "query": "test topic", "generated": "2026-11-11T10:00:00Z",
            "sources_used": ["crossref", "arxiv"],
            "results": [
                {"title": "First paper", "authors": ["Ada Smith"], "year": "2025", "venue": "Journal A", "doi": "10.1234/first", "arxiv_id": "", "sources": ["crossref"], "verified": True, "abstract": "A."},
                {"title": "Second paper", "authors": ["Bob Jones"], "year": "2026", "venue": "arXiv", "doi": "", "arxiv_id": "2601.12345", "sources": ["arxiv"], "verified": True, "abstract": "B."},
            ],
            "dropped": [{"reason": "no title or authors", "record": {"title": "", "authors": [], "doi": "", "arxiv_id": ""}}],
        }

    def run_import(self, *ids):
        self.source.write_text(json.dumps(self.payload), encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(self.source), "--wiki", str(self.wiki), "--ids", *ids],
            capture_output=True, text=True,
        )

    def test_only_explicitly_selected_verified_records_are_imported_and_repeat_is_idempotent(self):
        first = self.run_import("10.1234/first")
        self.assertEqual(first.returncode, 0, first.stderr)
        pages = list((self.wiki / "papers").glob("*.md"))
        self.assertEqual(len(pages), 1)
        text = pages[0].read_text(encoding="utf-8")
        self.assertIn('doi: "10.1234/first"', text)
        self.assertIn("source_json:", text)
        self.assertIn("record_id:", text)
        self.assertIn("crossref", text)
        again = self.run_import("10.1234/first")
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertEqual(len(list((self.wiki / "papers").glob("*.md"))), 1)
        self.assertEqual(pages[0].read_text(encoding="utf-8"), text)

    def test_rejects_unverified_or_unknown_schema_without_writing(self):
        self.payload["results"][0]["verified"] = False
        rejected = self.run_import("10.1234/first")
        self.assertNotEqual(rejected.returncode, 0)
        self.assertEqual(list((self.wiki / "papers").glob("*.md")), [])
        self.payload = {"papers": self.payload["results"]}
        unknown = self.run_import("10.1234/first")
        self.assertNotEqual(unknown.returncode, 0)
        self.assertEqual(list((self.wiki / "papers").glob("*.md")), [])

    def test_arxiv_record_uses_saved_metadata_without_network(self):
        result = self.run_import("arXiv:2601.12345")
        self.assertEqual(result.returncode, 0, result.stderr)
        page = next((self.wiki / "papers").glob("*.md"))
        self.assertIn('arxiv: "2601.12345"', page.read_text(encoding="utf-8"))

    def test_invalid_selection_rejects_whole_batch_before_writing(self):
        result = self.run_import("10.1234/first", "10.1234/missing")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("absent from sidecar", result.stderr)
        self.assertEqual(list((self.wiki / "papers").glob("*.md")), [])

    def test_invalid_venue_is_rejected_as_schema_error(self):
        self.payload["results"][0]["venue"] = {"unexpected": "shape"}
        result = self.run_import("10.1234/first")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid venue", result.stderr)
        self.assertEqual(list((self.wiki / "papers").glob("*.md")), [])

    def test_doi_and_arxiv_aliases_resolve_to_one_paper_identity(self):
        self.payload["results"][0]["arxiv_id"] = "2501.12345"
        first = self.run_import("10.1234/first", "arXiv:2501.12345")
        self.assertEqual(first.returncode, 0, first.stderr)
        page = next((self.wiki / "papers").glob("*.md"))
        original = page.read_text(encoding="utf-8")
        self.payload["results"][0]["title"] = "Renamed metadata"
        second = self.run_import("arXiv:2501.12345")
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(len(list((self.wiki / "papers").glob("*.md"))), 1)
        self.assertEqual(page.read_text(encoding="utf-8"), original)

    def test_conflicting_records_for_one_identifier_are_rejected(self):
        conflict = copy.deepcopy(self.payload["results"][0])
        conflict["title"] = "A different paper"
        self.payload["results"].append(conflict)
        result = self.run_import("10.1234/first")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("conflicting records", result.stderr)
        self.assertEqual(list((self.wiki / "papers").glob("*.md")), [])

    def test_arxiv_versions_share_one_identity_but_saved_id_keeps_source_version(self):
        self.payload["results"][1]["arxiv_id"] = "2601.12345v2"
        first = self.run_import("arXiv:2601.12345v2")
        self.assertEqual(first.returncode, 0, first.stderr)
        page = next((self.wiki / "papers").glob("*.md"))
        original = page.read_text(encoding="utf-8")
        original_log = (self.wiki / "log.md").read_text(encoding="utf-8")
        self.assertIn('arxiv: "2601.12345v2"', original)
        self.payload["results"][1]["arxiv_id"] = "2601.12345v3"
        self.payload["results"][1]["title"] = "Updated preprint title"
        second = self.run_import("arXiv:2601.12345v3")
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(len(list((self.wiki / "papers").glob("*.md"))), 1)
        self.assertEqual(page.read_text(encoding="utf-8"), original)
        self.assertEqual((self.wiki / "log.md").read_text(encoding="utf-8"), original_log)


if __name__ == "__main__":
    unittest.main()

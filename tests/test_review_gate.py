import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "tools" / "review_gate.py"
THREAD = "11111111-1111-4111-8111-111111111111"


class PiReviewGateTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.session = Path(temp.name) / f"{THREAD}.json"
        self.payload = {
            "schemaVersion": 1,
            "threadId": THREAD,
            "model": "openai/gpt-test",
            "history": [],
            "rounds": [{
                "number": 1, "status": "ok", "stopReason": "stop",
                "requestedModel": "openai/gpt-test", "reportedModel": "openai/gpt-actual",
                "result": "Score: 7/10\nVerdict: ready", "error": None,
                "inputFiles": [],
            }],
        }

    def gate(self, *args):
        self.session.write_text(json.dumps(self.payload), encoding="utf-8")
        run = subprocess.run(
            [sys.executable, str(GATE), "--session", str(self.session),
             "--executor-model", "anthropic/claude-test", "--review-scope-complete", *args],
            text=True, capture_output=True,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        return json.loads(run.stdout)

    def test_cross_family_positive_pi_record_stops(self):
        result = self.gate()
        self.assertEqual(result["decision"], "stop")
        self.assertEqual(result["acceptance_status"], "accepted")
        self.assertEqual(result["reviewer_model"], "openai/gpt-actual")
        self.assertEqual(result["thread_id"], THREAD)

    def test_negative_verdict_continues_same_pi_reviewer(self):
        self.payload["rounds"][0]["result"] = "Score: 5/10\nVerdict: not ready"
        result = self.gate()
        self.assertEqual(result["decision"], "continue")
        self.assertEqual(result["next_backend"], "pi")

    def test_error_round_cannot_reuse_prior_positive_verdict(self):
        self.payload["rounds"].append({
            "number": 2, "status": "error", "stopReason": "error",
            "requestedModel": "openai/gpt-test", "reportedModel": None,
            "result": None, "error": "provider unavailable", "inputFiles": [],
        })
        self.assertEqual(self.gate()["decision"], "review_unavailable")

    def test_same_family_or_missing_scope_cannot_acquit(self):
        same = self.gate("--executor-model", "openai/gpt-other")
        self.assertEqual(same["decision"], "review_unavailable")
        self.session.write_text(json.dumps(self.payload), encoding="utf-8")
        run = subprocess.run(
            [sys.executable, str(GATE), "--session", str(self.session),
             "--executor-model", "anthropic/claude-test"],
            text=True, capture_output=True,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout)["decision"], "review_unavailable")

    def test_conflicting_verdicts_or_thread_identity_fail_closed(self):
        self.payload["rounds"][0]["result"] += "\nVerdict: not ready"
        self.assertEqual(self.gate()["decision"], "review_unavailable")
        self.payload["rounds"][0]["result"] = "Score: 7/10\nVerdict: ready"
        self.payload["threadId"] = "22222222-2222-4222-8222-222222222222"
        self.assertEqual(self.gate()["decision"], "review_unavailable")


if __name__ == "__main__":
    unittest.main()

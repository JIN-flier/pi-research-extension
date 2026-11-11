# Acceptance Gate

An iterative skill may check objective completion itself: process exit status, output existence, parsed metric, round count, and whether a reviewer call completed. Research quality, novelty, correctness, and readiness are judgments for an independent reviewer. A successful test or a finished job is evidence about execution, not a scientific acceptance verdict.

For `aris_review`, use the actual `Reviewer-Model`, saved session record, completed scope, and response. In a scored review loop, call the package's `tools/review_gate.py` with the latest `.aris/reviewer-sessions/<threadId>.json`, the actual executor model ID, and `--review-scope-complete` only when the reviewer assessed the whole requested artifact. Respect its `stop`, `continue`, or `review_unavailable` decision. Exhausting a round or time budget is a separate stop reason and never means accepted.

If executor identity is only declared by the host, describe that assurance accurately. A reviewer in the same or unknown model family cannot satisfy the cross-family acceptance gate. See [review trace](review-tracing.md) and [reviewer independence](reviewer-independence.md).

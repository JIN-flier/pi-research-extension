# Acceptance Gate

An iterative skill may check objective completion itself: process exit status, output existence, parsed metric, round count, and whether a reviewer call completed. Research quality, novelty, correctness, and readiness are judgments for an independent reviewer. A successful test or a finished job is evidence about execution, not a scientific acceptance verdict.

Use a separate `aris_review` session for reviewer judgment: create it without `threadId`, then reuse the returned ID for revisions of the same task. Context isolation comes from the review thread's own history; execution and review may use the same model. See [reviewer session isolation](reviewer-independence.md).

For `aris_review`, use the saved session record, completed scope, and response. Record `Reviewer-Model` when available as audit metadata. In a scored review loop, call the native Pi **`review_gate`** tool with `sessionPath: ".aris/reviewer-sessions/<threadId>.json"`. Set `reviewScopeComplete: true` only when the latest review covers the whole requested artifact; it requests interactive human confirmation. The tool does not read the executor model or check reviewer model metadata and accepts no executor-model argument. Without UI or a successful confirmation, the gate returns `review_unavailable`. A missing tool also leaves acceptance provisional; do not substitute the Python CLI to bypass confirmation.

Respect its `stop`, `continue`, or `review_unavailable` decision. `stop` requires a successful latest round, confirmed scope, exactly one score ≥6/10 and `ready` or `almost`. A later failed round cannot reuse an earlier positive result. Exhausting a round or time budget is a separate stop reason and never means accepted.

# Reviewer Independence

The agent that authors a research artifact can check syntax, tests, file presence, and data parsing. For a judgment about novelty, correctness, integrity, or readiness, give a separate reviewer the artifact and the underlying evidence through `aris_review`.

Use a neutral dossier. Include the actual source text and results the reviewer must inspect in `files`; a prose path alone is not inspection. Omit the executor's desired verdict and do not selectively paraphrase unfavorable prior feedback. Within one `threadId`, the reviewer may use its own previous response to assess whether revisions resolve concerns. A new model starts a new thread with the complete dossier.

Record actual `Reviewer-Model`, completed scope, `threadId`, response and errors from the Pi session. The deterministic [acceptance gate](acceptance-gate.md) requires a completed, scoped, cross-family reviewer response. When the executor family is unknown or matches the reviewer, describe the review as feedback without claiming independent acceptance. The Pi reviewer reads supplied text snapshots; direct web access, command execution, and visual PDF inspection are outside that call's demonstrated scope.

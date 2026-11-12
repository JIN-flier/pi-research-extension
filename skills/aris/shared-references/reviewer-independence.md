# Reviewer Session Isolation

The agent that authors a research artifact can check syntax, tests, file presence, and data parsing. For a judgment about novelty, correctness, integrity, or readiness, give the artifact and underlying evidence to `aris_review` in a separate reviewer session.

Omit `threadId` for the first call to create a new reviewer session. Pass the returned `threadId` for revisions of the same task. Each thread stores its own history; a new thread does not inherit another review thread or the executor's conversation. The reviewer receives the supplied prompt, file snapshots, and its own thread history. The same model can be used for execution and review; no model-independence check is needed.

Use a neutral dossier. Include the actual source text and results the reviewer must inspect in `files`; a prose path alone is not inspection. Omit the executor's desired verdict and do not selectively paraphrase unfavorable prior feedback. Within one `threadId`, the reviewer may use its own previous response to assess whether revisions resolve concerns. A new model starts a new thread with the complete dossier.

Record completed scope, `threadId`, response and errors from the Pi session; `Reviewer-Model` may be retained as audit metadata. The deterministic [acceptance gate](acceptance-gate.md) requires a completed reviewer round, confirmed scope and qualifying Score/Verdict. The Pi reviewer reads supplied text snapshots; direct web access, command execution, and visual PDF inspection are outside that call's demonstrated scope.

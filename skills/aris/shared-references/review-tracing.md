# Pi Reviewer Tracing

`aris_review` writes its own review record. Skills that call it do not create a second trace manually.

## Record location and continuity

Each new review returns a UUID `threadId` and writes `.aris/reviewer-sessions/<threadId>.json` in the research project. Pass that same `threadId` to `aris_review` for the next round. The selected `provider/model` must stay the same. A response from a different **actual** model is recorded as an error and is not added to the conversation history; start a new thread if the reviewer model needs to change. Old session files without actual-model records cannot prove continuity and need a new thread.

The file is written atomically after input capture and again after the reviewer returns. A pending round remains visible if the process stops between those writes. A failed or aborted round stays in `rounds[]` for audit but is not added to `history[]`, so a retry with the same `threadId` does not pretend that the failed answer was part of the conversation.

## Record fields

```json
{
  "schemaVersion": 1,
  "threadId": "<uuid>",
  "model": "<requested provider/model>",
  "history": [
    {"role": "user", "text": "<prompt plus file content>"},
    {"role": "assistant", "text": "<successful answer>"}
  ],
  "rounds": [
    {
      "number": 1,
      "startedAt": "<ISO timestamp>",
      "completedAt": "<ISO timestamp or null while pending>",
      "requestedModel": "<configured provider/model>",
      "reportedModel": "<actual provider/model reported by Pi, or null>",
      "stopReason": "<Pi stop reason or null>",
      "status": "ok | error | aborted | pending",
      "prompt": "<exact request>",
      "inputFiles": [{"path": "<project-relative path>", "sha256": "<hex digest>", "content": "<snapshot read for this call>"}],
      "result": "<returned text or null>",
      "error": "<error message or null>"
    }
  ]
}
```

`reportedModel` is taken from the completion response, not inferred from the requested model. Only a response with `stopReason: "stop"`, nonempty text, and a reported model counts as a successful review. A missing identity, truncated response, provider error, or abort is recorded without advancing history. The complete input snapshot makes later file edits distinguishable from the material actually reviewed. The tool result also reports `Reviewer-Model` and `threadId` for successful calls; check the record when auditing an acceptance decision.

Configuration or authentication errors reported before a model call do not create a review thread. In that case configure `/aris-reviewer provider/model` and retry; do not claim a review was performed.

For a scored Pi review, the deterministic acceptance gate reads the latest round directly from this file:

```bash
python3 "$ARIS_REPO/tools/review_gate.py" \
  --session ".aris/reviewer-sessions/<threadId>.json" \
  --executor-model "<actual provider/model>" --review-scope-complete
```

It extracts exactly one `Score: X/10` and `Verdict: ready|almost|not ready` from the saved response. An incomplete round, unknown model identity, same-family reviewer, or unconfirmed review scope returns `review_unavailable`; a positive cross-family round may return `stop`, otherwise `continue`.

These records contain complete prompts, file contents, and reviewer responses. Keep `.aris/reviewer-sessions/` within the project's normal private research-data handling rules.

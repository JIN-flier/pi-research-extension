# Pi Reviewer Tracing

`aris_review` writes its own review record. Skills that call it do not create a second trace manually.

## Record location and continuity

Each new review returns a UUID `threadId` and writes `.aris/reviewer-sessions/<threadId>.json` in the research project. Pass that same `threadId` to `aris_review` for the next round. The selected `provider/model` must stay the same. A response from a different **actual** model is recorded as an error and is not added to the conversation history; start a new thread if the reviewer model needs to change. Old session files without actual-model records cannot prove continuity and need a new thread.

Omitting `threadId` starts a fresh reviewer context. Calls with that ID use only the supplied prompt, file snapshots, and that review thread's saved history; the executor's conversation and other reviewer threads are not automatically included. This session boundary is the review workflow's context isolation, including when the same model performs both roles. See [reviewer session isolation](reviewer-independence.md).

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

Configuration or authentication errors reported before a model call do not create a review thread. In that case configure `/aris-reviewer-picker provider/model` and retry; do not claim a review was performed.

For a scored Pi review, call **`review_gate`**. The deterministic acceptance gate reads the latest round directly from this file:

```json
{
  "sessionPath": ".aris/reviewer-sessions/<threadId>.json",
  "reviewScopeComplete": true
}
```

Relative `sessionPath` values resolve from the current Pi project directory; absolute paths are also supported. The gate does not read `ctx.model` or validate/compare model metadata. `reviewScopeComplete: true` requests a UI confirmation that the entire intended scope was supplied and reviewed; it does not prove scope by itself. Missing UI, rejection, or failed confirmation returns `review_unavailable`. Do not replace this step with the Python CLI when confirmation is unavailable.

The confirmation displays the latest saved request and response, thread/round, completion time, actual reviewer model, and the paths and SHA-256 hashes of that round's input snapshots. The Pi TUI view scrolls so long requests and file lists remain accessible. Hashes identify reviewed text snapshots; they do not assert a Git revision or that today's files still match. No file inputs is explicitly labeled a prompt-only review. Decline if the recorded versions or reviewer coverage do not match the intended scope. Missing/corrupt scope evidence prevents confirmation, and a session change during confirmation invalidates that approval.

The gate extracts exactly one `Score: X/10` and `Verdict: ready|almost|not ready` from the saved response. An incomplete round, invalid assessment or unconfirmed review scope returns `review_unavailable`; a confirmed successful round with score ≥6 and `ready` or `almost` returns `stop`, otherwise `continue`. Model metadata is optional to the gate and is shown only for audit. The `aris_review` tool's model configuration and conversation continuity are separate from this acceptance decision. Save the returned JSON alongside the session pointer in the review report. The session is a local audit record of the review inputs and response.

These records contain complete prompts, file contents, and reviewer responses. Keep `.aris/reviewer-sessions/` within the project's normal private research-data handling rules.

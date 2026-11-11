# Output Manifest

Create or maintain project-root `MANIFEST.md` when one run generates **more than 15 artifacts**. For smaller runs, the stage files are sufficient. When the threshold is met, list each generated artifact with timestamp, skill, path, stage, and short description. Include timestamped versions and fixed-name latest copies. Append new rows; do not delete history.

Use a stable table header:

```markdown
| Timestamp | Skill | File | Stage | Description |
|-----------|-------|------|-------|-------------|
```

Current stages are `idea-stage`, `refine-logs`, `review-stage`, and `research-wiki`. A Pi reviewer session already has its own `.aris/reviewer-sessions/<threadId>.json` record; a manifest can point to it but must not rewrite it.

# Output Versioning

When a stage's fixed-name artifact would be overwritten, first write a timestamped sibling (`NAME_YYYYMMDD_HHmmss.ext`), then make the fixed-name file the same content. Use a numeric suffix if two writes land in the same second. Never delete a prior timestamped version merely to simplify a new run.

Stage paths used by the current skills are `idea-stage/IDEA_REPORT.md`, `refine-logs/FINAL_PROPOSAL.md`, `refine-logs/EXPERIMENT_PLAN.md`, `refine-logs/EXPERIMENT_TRACKER.md`, `refine-logs/EXPERIMENT_RESULTS.md`, and `review-stage/AUTO_REVIEW.md`. Per-round files and `.aris/reviewer-sessions/<threadId>.json` already carry distinct identities. The reviewer session is written by the Pi extension; do not copy or rewrite it as a stage artifact.

When reading a project created before stage directories existed, a skill may read a root-level fixed-name artifact as a fallback. New writes use the stage path. Preserve append-only logs and research wiki node IDs. For more than 15 generated artifacts in one run, maintain [the manifest](output-manifest.md).

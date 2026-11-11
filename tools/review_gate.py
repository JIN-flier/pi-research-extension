#!/usr/bin/env python3
"""Classify the latest Pi reviewer round from its saved session record."""

import argparse
import json
import math
import re
from pathlib import Path


KNOWN_PROVIDERS = {
    "openai": "openai", "anthropic": "anthropic", "google": "google",
    "deepseek": "deepseek", "moonshot": "moonshot", "xai": "xai",
    "mistral": "mistral", "meta": "meta", "qwen": "qwen",
}
MODEL_MARKERS = {
    "openai": r"(?:gpt|chatgpt|codex|o1|o3|o4)",
    "anthropic": r"(?:claude|sonnet|opus|haiku)",
    "google": r"(?:gemini)",
    "deepseek": r"(?:deepseek)",
    "moonshot": r"(?:kimi|moonshot)",
    "xai": r"(?:grok)",
    "mistral": r"(?:mistral|mixtral)",
    "meta": r"(?:llama)",
    "qwen": r"(?:qwen|tongyi)",
}


def derive_model_family(model):
    if not isinstance(model, str) or "/" not in model:
        return "unknown"
    provider, _, name = model.lower().partition("/")
    matches = {
        family for family, marker in MODEL_MARKERS.items()
        if re.search(rf"(?<![a-z0-9]){marker}[0-9.]*?(?![a-z0-9])", name)
    }
    direct = KNOWN_PROVIDERS.get(provider)
    if direct:
        matches.add(direct)
    return next(iter(matches)) if len(matches) == 1 else "unknown"


def parse_assessment(response):
    scores = re.findall(r"(?im)^\s*(?:[-*]\s*)?Score:\s*([0-9]+(?:\.[0-9]+)?)\s*/\s*10\s*$", response)
    verdicts = re.findall(r"(?im)^\s*(?:[-*]\s*)?Verdict:\s*(ready|almost|not\s+ready)\s*$", response)
    if len(scores) != 1 or len(verdicts) != 1:
        raise ValueError("review must contain exactly one Score and Verdict")
    score = float(scores[0])
    if not math.isfinite(score) or not 1 <= score <= 10:
        raise ValueError("score must be within 1..10")
    return score, re.sub(r"\s+", " ", verdicts[0].lower())


def unavailable(reason, *, thread_id=None, reviewer_model=None):
    return {
        "decision": "review_unavailable", "next_backend": None,
        "acceptance_status": "provisional", "review_independence": "unknown",
        "identity_assurance": "unverified", "reason": reason,
        "thread_id": thread_id, "reviewer_model": reviewer_model,
        "score": None, "verdict": None,
    }


def evaluate_session(session_path, executor_model, scope_complete):
    path = Path(session_path)
    try:
        session = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        return unavailable(f"review session unreadable: {error}")
    if not isinstance(session, dict) or session.get("schemaVersion") != 1:
        return unavailable("unknown Pi reviewer record format")
    thread_id = session.get("threadId")
    if not isinstance(thread_id, str) or thread_id != path.stem:
        return unavailable("review threadId does not match session filename")
    rounds = session.get("rounds")
    if not isinstance(rounds, list) or not rounds or not isinstance(rounds[-1], dict):
        return unavailable("review session has no completed round", thread_id=thread_id)
    round_record = rounds[-1]
    reviewer_model = round_record.get("reportedModel")
    if (
        round_record.get("status") != "ok"
        or round_record.get("stopReason") != "stop"
        or round_record.get("error") is not None
    ):
        return unavailable("latest Pi review round did not complete successfully", thread_id=thread_id,
                           reviewer_model=reviewer_model)
    if not isinstance(reviewer_model, str) or not reviewer_model:
        return unavailable("latest review has no actual reported model", thread_id=thread_id)
    if round_record.get("requestedModel") != session.get("model"):
        return unavailable("review requested model differs from session model", thread_id=thread_id,
                           reviewer_model=reviewer_model)
    if not scope_complete:
        return unavailable("review scope was not confirmed complete", thread_id=thread_id,
                           reviewer_model=reviewer_model)
    executor_family = derive_model_family(executor_model)
    reviewer_family = derive_model_family(reviewer_model)
    if "unknown" in (executor_family, reviewer_family):
        return unavailable("executor or reviewer model family is unknown", thread_id=thread_id,
                           reviewer_model=reviewer_model)
    if executor_family == reviewer_family:
        return unavailable("reviewer is in the executor's model family", thread_id=thread_id,
                           reviewer_model=reviewer_model)
    response = round_record.get("result")
    if not isinstance(response, str):
        return unavailable("review result is missing", thread_id=thread_id, reviewer_model=reviewer_model)
    try:
        score, verdict = parse_assessment(response)
    except ValueError as error:
        return unavailable(str(error), thread_id=thread_id, reviewer_model=reviewer_model)
    positive = score >= 6 and verdict in {"ready", "almost"}
    return {
        "decision": "stop" if positive else "continue",
        "next_backend": None if positive else "pi",
        "acceptance_status": "accepted" if positive else "provisional",
        "review_independence": "cross-family",
        "identity_assurance": "reviewer_response_executor_declared",
        "reason": "Pi reviewer met the acceptance threshold" if positive else "Pi reviewer did not meet the acceptance threshold",
        "thread_id": thread_id, "reviewer_model": reviewer_model,
        "score": score, "verdict": verdict,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", required=True, help=".aris/reviewer-sessions/<threadId>.json")
    parser.add_argument("--executor-model", required=True, help="actual current executor provider/model")
    parser.add_argument("--review-scope-complete", action="store_true")
    args = parser.parse_args()
    print(json.dumps(evaluate_session(args.session, args.executor_model, args.review_scope_complete), sort_keys=True))


if __name__ == "__main__":
    main()

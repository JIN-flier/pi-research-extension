# Output Language

Follow the user's requested language. If none is specified, use the language of the latest substantive request; otherwise use the project's documented preference, then English as a fallback. Localize headings, explanations, status messages, and recommendations.

Preserve code, commands, paths, DOI/arXiv IDs, paper titles, author names, JSON keys, wiki frontmatter fields, and machine-parsed markers exactly. In particular, the review gate expects the English markers `Score: X/10` and `Verdict: ready|almost|not ready` in a reviewer response. A translated report may explain those markers but must not change the saved raw response.

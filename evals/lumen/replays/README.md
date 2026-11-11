Recorded Claude (claude-opus-5-5) responses from live runs on 2026-11-06, kept so the review loop can be replayed without API calls:

- `proposal.json`: the Planning Agent's proposal for the Lumen documents (the good base the review evaluation degrades).
- `review-c1-pass1.json`, `review-c2-pass1.json`: the Independent Reviewer's blind assessments, cycles 1 and 2.
- `review-c1-pass2.json`, `review-c2-pass2.json`: the reviewer's comparison findings, cycles 1 and 2.
- `revision.json`: the Planning Agent's targeted revision after cycle 1.

These are model output on fictional documents. `soxplan seed` (and `make go`) replays them into the workspace database.

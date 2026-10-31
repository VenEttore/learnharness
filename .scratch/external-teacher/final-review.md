# external-teacher: final spec review packet

Prepared 2026-10-31 at integration tip b2d80fc. Ticket 15 (Matt's bench) is still open, so the spec cannot ship yet.

## What shipped

| Ticket | Shipped | Merge |
|---|---|---|
| 01 | Teaching tools' result text and plan-node check moved to a shared module (src/core/teaching-tool-results.ts) so the bot path reuses them | 0400540 |
| 02 | A bot-run lesson (`driver` set) saves page input and never reaches the model, key or compaction gates; continue/retry refused | 33e1e55 |
| 03 | External routes under app/api/external/chats/**, the `lh` CLI, `lesson new` with an idempotent key, `say`, `show`, the cursor and turn checks 1-4, Origin/Host guard | e51624e |
| 04 | The page works in a bot-run lesson: no automatic continue, no setup or model-error prompts | 8d77b94 |
| 05 | Phase A verified by smoke run | .scratch only |
| 06 | `ask`, `probe`, `recall` turns with checks 5-7 | 8247cca |
| 07 | `lh answer` items for typed messages, answers and skips; `--wait`; dismiss route emits chats-changed and no longer overwrites a racing answer | 5929722 |
| 08 | Knowledge extraction returns empty for a bot-run lesson | 2e93d6c |
| 09 | Phase B verified by smoke run | .scratch only |
| 10 | `probe-done` with strand assessments; moves the lesson to plan, wakes nothing | 17ab05a |
| 11 | `plan` (Mermaid), parser errors as 422, rewrites during teach; check/build throws become JSON 500 internal_error | 439f106 |
| 12 | `quiz` and `explain` tagged with a plan node; node check reads the latest plan in the transcript; retried question after a rewrite is a repeat | 4c38b64 |
| 13 | docs/external-teacher.md, the Bot Teacher guide | 815aa6d |
| 14 | Phase C verified: guide's start command, loopback only, a scripted no-key lesson with the guide's JSON examples (78 checks pass) | b2d80fc |
| 15 | Bench: one real lesson with a Grok Bot | open, in laptop-queue.md |

## Final integration check

Ticket 14 ran it at 0f1741e, whose code is identical to b2d80fc (14 changed only .scratch/): typecheck and lint pass, 3085 of 3086 tests pass. The one failure is the baseline test "main loader resolves Pi's import-only PUBLIC package exports and native OAuth without a CLI or network". It fails on main before this work and has nothing to do with the fork; the spec keeps it.

## Needs a decision

1. writeChat is not atomic (from 11's interrogate). src/store/chats.ts writes the chat file with a plain writeFileSync, so a write cut off partway (disk full, crash) can leave the lesson unreadable. Every save path is affected, ordinary lessons too. It predates the fork. Fix: temp file plus rename, as graph.ts and auth.ts already do. Small edit to an upstream file. Recommendation: new ticket 16.
2. Glossary entries (from 13). GLOSSARY.md lacks cursor, turn, item, repeat, takeover, strand and refusal. Docs only. Recommendation: new ticket 17.
3. Untested code paths (from 13). bad_reply, the exit-3 "did not answer" path, a failed save on `lesson new`, and unread_input with an --after newer than the bot's last turn have no automated test. 13's reviewers checked them by hand. Recommendation: new ticket 18 adds the tests.
4. Spec wording on two writers (from 07). The spec's Out of Scope line says "the cursor already refuses a writer that missed learner input". Since 07, check 4 reads unread input past max(after, the bot's last message), so this holds only for input that came after the bot's last message. Recommendation: correct the sentence in the spec at ship; no code change.
5. LH_IGNORE_ENV_KEYS=1 (from 13). It leaves ANTHROPIC_AUTH_TOKEN, ANTHROPIC_OAUTH_TOKEN, AZURE_OPENAI_API_KEY, GOOGLE_CLOUD_API_KEY, CLOUDFLARE_API_KEY, COPILOT_GITHUB_TOKEN and cloud credentials in effect. The guide unsets them before starting. A bot-run lesson calls no model either way, so this only matters for ordinary lessons on that server. Recommendation: accept.
6. Upstream prompt mismatch (from 13). prompts 20-teaching.md:33 says ask_user_question appears behind "Check your understanding", but the page shows it open. Upstream's file; the bot reads it for method only. Recommendation: accept.

## Deferred, and where it went

- 01: a shared {text, details} to tool-result mapper; moving PROBE_DONE_ACK_TEXT; retyping toToolResult's text-only branch. Not needed by later tickets (the bot path uses the shared message constructor). Dropped.
- 02: job pump and artifact-ui route on bot-run lessons; out of scope until background jobs run on bot-run lessons. Duplicate-send dedupe: ordinary lessons have none either. Compaction not injectable: spec says no new seam.
- 03: 127.0.0.1 bind and lost-reply recovery went to the guide (13), done. API auth stays out of scope. Cross-origin text/plain POSTs to the existing /api/chat and /api/chats are unchanged (predate the fork).
- 06: two cursor gaps went to 07, fixed there. A null lead-in is refused, not dropped.
- 11: no duplicate-id refusal (Mermaid merges repeated ids; only cycles reachable). writeChat item above. planTreeOf and latestPlan repeat upstream validation to keep upstream edits small.
- 12: "call plan_init" wording mapped to `lh plan` in the guide, done.
- 13: glossary item above; three optional wording nits dropped.
- Code smells left on purpose: test harness helpers copied across bot-run-* test files; lh.mjs lists JSON kinds twice.

## Reviews and seats

- No Needs-hardware findings. No Risk: live tickets, so no blast-radius facts.
- Review skipped under the small-diff rule: 05, 08, 09, 14 (verification tickets, and 08's 3-line guard with tests).
- 03 round 5: code-review did not run (Grok 4.7 provider errors twice). Round 4 code-review passed on both axes, round 5 interrogate was clean, and 14's smoke exercises every 03 route.
- 13 round 2: Haiku seat never started (T3 MCP registration timeout during the linuxdev outage); code-review ran through the native Agent tool on the same model. Round 3 ran all four seats and code-review, clean.
- From 2026-10-31, code-review and the old Grok 4.7 interrogate seat ran on Opus 5.5 xhigh (Matt).

## Benches

- 15 not yet run.

## Separate from the spec

README section on the fork's goals: branch readme-fork-goals (cffce62, pushed to origin), off main.

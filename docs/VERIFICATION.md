# Verification — 29 October 2026

## Autopsy repair and live verification

- Root cause: a key had been added to `.env` after backend startup, while the running process still reported no key and no Google model was selected. Key changes are now read on use; process-environment credentials retain precedence.
- Real CityAd analysis completed using **gemini-2.5-flash**, with persisted overview, architecture and recommendations. A browser-triggered second run also completed; its saved operation timestamps showed approximately 14 seconds. The hosted Gemma request returned Google's HTTP 500 internal error, so Gemini Flash remains selected.
- The autopsy card now renders immediate pending feedback, a floating ghost and radar animation, elapsed time, actual stream character activity, cancellation, setup guidance, retries, failures and completed reports. Reduced-motion preferences are respected. Backend operation type and start/completion timestamps are persisted.
- Session tokens are renewed after backend restart only when a mutation was rejected before execution. Settings changes propagate through SSE so the selected model display remains current.
- **14 tests pass**, including late `.env` key loading, setup diagnostics, pending/failure/completed markup, token renewal and the Git/SQLite/AI-contract workflow. Production build passes with reduced editor imports and constrained build parallelism.
- No imported project tests were run; the isolated runner remains unimplemented.

## Google API provider update

- Added server-only `GEMINI_API_KEY` configuration, provider/model discovery, Gemini schema-constrained generation, hosted Gemma prompt-based generation, bounded SSE streaming, cancellation/timeouts, quota/error reporting and explicit cloud consent.
- **10 tests passed, 0 failed**, including the original Git/SQLite workflow and six Google provider tests. Google tests use injected fetch fixtures and make no paid API calls.
- The initial configuration check correctly reported `keyConfigured: false`. Subsequent live verification is recorded above.
- Provider and actual model names are displayed accurately. Cloud code transmission is disclosed. Existing local-only privacy claims are conditional on using Ollama.

## Original local-provider verification

- Production TypeScript/Vite build: passed. Monaco is loaded on demand and its workers are bundled for offline use. Vite reports large optional editor chunks.
- Automated tests: **4 passed, 0 failed**. Tests exercise URL restrictions, path and credential filtering, actual junction/symlink rejection, real Git import, SQLite persistence, Tree-sitter parsing, cross-site/session checks, source browsing, streaming structured-output validation, evidence rejection, plans, unified diffs, explicit approval, application to a separate working copy, original preservation, report export and disabled test execution.
- The automated inference HTTP server is explicitly a test fixture. It is never used as a production fallback.
- Ollama service discovery: passed against the actual local service. Installed models were returned.
- Real inference: **not verified successfully on this machine**. Actual requests to the installed Gemma 3 and Gemma 4 models returned HTTP 500 with GPU or CPU allocation failures (`cudaMalloc` / `CPU_REPACK`). Both normal and CPU inference paths were attempted. GhostCommit surfaces the actual service errors and retains static analysis results. A successful real-model plan/patch workflow remains dependent on sufficient model runtime memory.
- Browser QA: dashboard rendered at desktop and mobile sizes. Invalid non-GitHub input produced a visible validation error. Navigation and Settings were inspected; no console errors were reported during that check. The screenshot is in `docs/screenshots/overview.png`.
- Dependency installation reported **zero known npm audit vulnerabilities** after updating Monaco and overriding DOMPurify to 3.4.17. This is an advisory check, not proof of dependency safety. Direct-package license metadata is recorded in `docs/dependency-licenses.json`.
- Imported repository tests: **not run**, intentionally. No audited isolated runner is configured.
- Live checks use labelled development fixtures under ignored `test-artifacts/`; production views are not seeded with fixtures.

Remaining scope limitations include manual review of TOML/Maven/Gradle dependencies, no dependency freshness/vulnerability database integration, no automatic patch composition and no GitHub PR creation. See README for operational and security limits.

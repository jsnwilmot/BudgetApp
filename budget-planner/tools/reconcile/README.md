# FinPath offline reconciliation utility — review candidate

**Code/synthetic testing only. Not authorized for a real-data run.** Issue #12 approves developing this utility on draft PR #9. Independent Architect/security review and a separate explicit owner approval must precede any owner-local private analysis. M3 and Phase 1 acceptance remain open. No corrections, grouped verification, linking, source creation, merge, deployment or Phase 2 are included.

## Purpose and invocation

Node **22 or later**, standard library only; no npm installation, browser, app startup, database or network connection is needed to run the utility from an already reviewed source checkout. All referenced application modules are pure calculation helpers; the CLI does not import `db.js`, the importer, React/App or application initialization.

```text
node tools/reconcile/cli.mjs --input <local-copy.json> --orphan-source <id> --current-source <id>
```

Required selectors are explicit stable source IDs, never display names. Repeat `--orphan-source` or `--current-source` only when independent evidence identifies additional source IDs belonging to the intended cohort. Duplicate IDs or overlapping cohort membership reject analysis. Arbitrary source IDs are not reconstructed or classified as verified savings transfers. No private-record discovery/list command exists. A missing selection produces an empty-cohort warning, not proof of no relevant history.

Optional `--from YYYY-MM-DD --to YYYY-MM-DD` filters saved occurrences inclusively. Unknown/malformed dates remain visible as invalid entries. Full backup context is retained for calculation effects; filtering does not rebase balances or alter settings. Manual overlap candidates are limited to the same window. Counts are not hard-coded to 25/22/2: those are the issue's reported cohorts, while this utility reports what the explicit selectors actually identify.

`--help` prints static usage. No `--output`, dump, detailed-record, verbose, remote URL or correction mode exists. Output goes to stdout only; errors go to stderr as fixed generic sentences. There are no generated report files or logs. Exit codes:

| Exit | Meaning |
| --- | --- |
| 0 | Analysis completed, including possibly significant risk warnings; **not financial approval** |
| 2 | Invalid/missing CLI options |
| 3 | Input cannot be read as a supported local regular JSON file |
| 4 | Unsupported/inconsistent input, analysis limit or output stream failure |

## Aggregate output contract

Only fixed schema keys, integer entry/edge/component counts, boolean availability, nullable unknown counts and fixed uppercase risk codes are emitted. No amounts/balances, dates/date ranges, currency, source/account/bucket IDs, record keys, names, notes, evidence, input path, file hash, raw error or stack trace is returned. Exact member lists/financial deltas are intentionally unavailable. Review of those facts remains an owner-private evidence exercise under separate authorization; this tool cannot approve a duplicate decision.

- `counts`: full inventory size/invalidity; selected contribution totals, excluded bill/other expense and income entries; invalid/unvalidated/unresolved/nonpositive/currency/evidence/reference/uncertain cases. Full expense count includes all identifiable saved expense/debt/general records, not a name-based assertion that every expense is a tax bill. The synthetic fixture has exactly two known bills. Unknown orphan types cannot be positively identified as bills without evidence; they remain uncertain selected value candidates.
- `comparison`: exact date + saved validated effective-amount edges, unique one-to-one **value candidates**, ambiguous complete bipartite components/entries, unmatched eligible records, equal-date unequal-amount residual entries/dates, and old/current-only dates. Unmatched and conflicting categories overlap. Dates with invalid/unvalidated records are not silently treated as absent dates. Ambiguity requires explicit multi-source membership or another independently identified member, never invented duplicate keys. No greedy pairing, fuzzy date shift or sum-to-match is performed.
- `representation`: per cohort, diagnostic orphan count versus actual source-row membership, sibling seeding and malformed-source seeding, calculation-window membership, nonzero projected/validated account/savings/bucket effects, visible report-period/savings-activity coverage and cumulative chequing report-balance effects. Counts represent entry effects, not totals. Multiple entries can feed the same cumulative balance. Report-period counts include unvalidated projected rows; they are not validated report balances. Account type routing and report coverage follow the reviewed app; these are not per-bank-account reconciliations.
- `uncertainAttribution` means a resolved snapshot identity/amount cannot safely attribute the row amount to that entry. `calculatorAmountDisagreements` means strict saved money and the current calculator's amount disagree (including floating precision or fallback). No values are printed. A calculation exception results in `representationAvailable=false`, fixed warning, and **null** model-dependent counters, never zero-as-exclusion. Structural source-seeding/orphan counts remain available. Broader malformed inputs can fail closed with exit 4.
- `overlaps`: same-date/equal-amount candidates for selected contributions versus manual contributions/adjustments, withdrawals versus identifiable bill expenses/negative bucket adjustments, and direct-payment expense versus adjustments. Account-only savings-to-chequing movements can be funding withdrawals. Split/combined amounts, different assigned dates or missing evidence can prevent a true relationship from being detected. Unknown bucket links yield conservative candidates; incompatible known links or dates may hide a relationship, requiring evidence. Withdrawal plus bill is often legitimate, not a duplicate contribution. Direction/reference/invalid/unvalidated manual records have independent counts.

The two actual property-tax expenses are separate economic events from contributions. Any identifiable expense is excluded from contribution comparison even if explicitly selected and equal in date/amount. Equal values never prove one real movement. The CLI cannot corroborate bank records, recover missing classification, determine intent, infer account-ID mappings or authenticate evidence.

## Supported raw shapes and precision

The reader accepts a raw data object or JSON `data` envelope, exportVersion 1 (or absent legacy field), schemaVersion 1/2 (or absent). It reads `plannerEntries` or `planner.entries`; conflicting aliases reject the entire input. No backup normalizer/importer runs. Original input and unknown audit/metadata remain untouched. Duplicate JSON object keys (including escaped equivalents), duplicate collection IDs, malformed collection rows, unsupported settings/versions and excessive resources reject analysis. Required projection settings: explicit valid anchor, frequency 7/14/28/30 and horizon 3/6/12/18/24 months. Missing settings are not borrowed from demo data.

The current policy supports an explicit single two-decimal currency: CAD, USD, EUR, GBP, AUD, NZD or CHF. Missing/other currencies fail closed; entry/source currency disagreement excludes that value from matches and is counted. This is an arithmetic policy, not foreign-exchange conversion or a jurisdictional cash-rounding rule. Cross-currency/other precision needs separate design.

The CLI validates JSON grammar then preserves numeric monetary lexemes as exact in-memory decimal strings before binary numeric parsing; versions/settings retain numeric types. This prevents an over-precision JSON number from silently rounding into an eligible amount. No source file is rewritten. The pure analysis API cannot recover precision already lost by a caller that supplies pre-parsed JavaScript numbers. Strict decimal-to-BigInt minor units accept finite decimal numbers/strings with at most ten whole digits and two fractional digits; no exponent, whitespace, comma, null/blank/boolean coercion or rounding. Nonempty valid line items take precedence; otherwise actual mode requires an explicit valid actual; planned mode requires an explicit saved plan. Each line is validated before exact summation. UseActual and validated must be actual booleans. Zero/negative values are preserved as values but excluded from positive-contribution matching and counted. Unresolved amount flags exclude candidates. Malformed audit/evidence containers, missing/blank source evidence and malformed key/date/source identities also exclude reliable matching. Audit contents are never interpreted as authenticated financial facts.

Model calculation is deliberately separate: existing pure Planner functions operate on a private in-memory clone with their current normalization/coercion, using historical source reconstruction and per-period snapshots. This may differ from strict matching. A sibling snapshot or malformed ID-bearing snapshot can cause source reconstruction despite a per-entry orphan warning; source flag counts cannot determine exclusion. No snapshot or schedule is added by the utility. Calendar dates remain local date-only strings; no posting-date conversion is inferred.

Resource limits: regular file at most **16 MiB**, at most **5000** saved entries and **2000** rows per input collection; an additional estimated source/period work cap; calendar dates supported 1900–2100. Sparse/oversized files, directories and symlinks reject. Symlink refusal uses lstat plus no-follow where available, handle identity and size/mtime checks; concurrent file editing can cause failure. OS reads may update access-time metadata; the utility never writes file content or requests modification of timestamps. This is not a hostile-filesystem sandbox or an immutable snapshot guarantee against a malicious local writer. Analyze a stable owner-held copy on a trusted host.

## Windows PowerShell — future owner-local procedure, blocked pending approval

These instructions are **not permission to run on private data now**. Development/testing used only synthetic data. After independent review **and** separate explicit owner authorization:

1. Use an owner-controlled computer outside Codex/remote/shared workspace context. Keep the original backup untouched. Privately create a distinct copy in a local non-synced folder **outside the repository and any Codex-accessible folder**. Do not place it in OneDrive/Dropbox/network shares or attach it to a chat. Confirm original and copy privately before use; do not print their hashes/paths here.
2. Use the reviewed source checkout and installed Node 22+. No npm install, downloads, connectors or network are required for analysis. Disconnect networking if practical. Do not use mapped network drives, UNC paths, symlinks/junctions or remote-mounted files. The program has no network API calls and rejects URL/UNC inputs, but cannot prove that an OS drive mapping or mount is local.
3. Disable terminal transcripts, automatic command/output capture, screen sharing and crash/coverage/heap profilers. Do not redirect or pipe output to a file, Tee-Object, logging software or upload command. This program does not control OS auditing, terminal history, endpoint monitoring or another local user's process inspection. Input paths/selectors are process arguments; a trusted host is required.
4. In the owner-local PowerShell session, use variables populated privately, not literal IDs/paths in saved command history. The paths below are **synthetic examples for code location only**, not actual backup paths:

```powershell
Set-Location 'C:\FinPathReview\BudgetApp\budget-planner'
# Avoid Node preloads, coverage and compile-cache file output from the caller's environment.
$env:NODE_OPTIONS = $null
$env:NODE_V8_COVERAGE = $null
$env:NODE_COMPILE_CACHE = $null
node .\tools\reconcile\cli.mjs --help
# STOP here unless the separate real-data run approval has been recorded.
$backupCopy = Read-Host 'Private path to the approved LOCAL COPY (outside repository/Codex)'
$oldSource = Read-Host 'Privately evidenced orphan contribution source ID'
$newSource = Read-Host 'Privately evidenced current contribution source ID'
node .\tools\reconcile\cli.mjs --input "$backupCopy" --orphan-source "$oldSource" --current-source "$newSource"
$analysisExit = $LASTEXITCODE
Remove-Variable backupCopy, oldSource, newSource
# Review analysisExit locally: 0 means completed, not reconciled/accepted.
```

5. Stop on any generic error, unavailable representation or unresolved classification. Do not repair JSON to make the utility accept it. Do not assume the output matches the reported 25/22 group sizes. On the **synthetic** 25/22/2 fixture the output is 22 unique value candidates, three unmatched old entries, 25 diagnostic orphans with zero old source-row members, 22 newer validated savings/bucket effects and two separate saved expenses. Those are **not expected real-data match results**.
6. Review only anonymized counts/risk codes before deciding what can be shared. Counts themselves can still be sensitive. Keep all original evidence/backup files local. Any data correction requires another exact-member, evidence-backed, financial-impact approval; no utility option performs one.

## Validation and security review boundary

`npm test` runs browser-independent unit/regression tests, including frozen input, raw/alias shapes, 25/22/2 cohort counts, strict money/line-item precedence, currencies, conflicts/ambiguity, invalid identities/audits, sibling/malformed reconstruction, missing bucket allocation, date windows/pre-anchor and unavailable model counters. Synthetic-only calculator illustrations confirm 2200 newer-only versus 4700 both-represented savings/bucket totals with unchanged bill expenses; this is a test analogue, not a private repair mode.

`npm run test:cli` spawns isolated Node processes using temporary synthetic files. Tests check unchanged input bytes/mtime and directory contents; bounded fixed errors/exit codes; no sentinel names/IDs/notes/dates/amounts/paths/control sequences in stdout/stderr; no dump/output switches; BOM/aliases; directory/symlink/oversize rejection. Test-only tripwires deny filesystem write APIs/file-handle writes, network/fetch/WebSocket and child processes; separate negative controls prove tripwires fire. Fixture creation/cleanup belongs to tests, not analysis. Tests are not a proof against an altered Node binary, hostile preloads, OS crash logging or hostile filesystem. Node's permission model is not silently enabled or represented as a network sandbox.

Node 22 CI runs regression and separate CLI acceptance, lint, production build and diff checks. No application behavior changed, so existing browser acceptance is prior evidence rather than a fresh run for this standalone tool. Linux results and final SHA are in PR #9; Windows PowerShell/Node execution remains an independent acceptance item. No actual backup has been accessed or analyzed. No production data, database, schema, IDs, amounts, validation, markers or audits were changed. Independent Architect/security approval, later run authorization, owner-private M3 and final Phase 1 acceptance remain separate gates.


## Windows security-test preload correction

The `fa303c1` CLI harness converted the guard module URL into a native path and passed that path to Node `--import`. On Windows, Node treats the drive-letter prefix as an unsupported URL scheme and exits before any security assertion executes. The guard now stays a proper `file:` URL via `new URL('./guard.mjs', import.meta.url).href` for both normal guarded runs and negative controls. The CLI entrypoint and spawn working directory remain native filesystem paths. Relative application/module-loader imports are already URL-based and need no conversion.

No guard code, tripwire, negative-control or security assertion is removed or weakened. The workflow now runs the complete regression suite, the complete CLI suite, lint and production build on Linux and Windows with **Node 22.23.3**; Windows uses **Windows PowerShell (`powershell`, 5.1) and `npm.cmd`**. Exact results/SHA are recorded in draft PR #9. Windows CI is distinct from retesting on the owner's computer.

For synthetic-only Windows retesting after checking out the corrected reviewed commit, run `npm.cmd ci`, `npm.cmd run test:cli`, `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build`. All runnable CLI tests must pass, including the negative controls; a module-loader failure is not an expected security rejection. Any failure must be investigated rather than skipping assertions or using a private backup to reproduce it. Independent review and separate real-data-run authorization remain required. No production application or utility financial logic changes are included in this correction.


## Windows symbolic-link fixture permissions

The earlier combined directory/link/oversize rejection test stopped when an owner-local Windows host denied creation of the synthetic symlink with `EPERM`. It never reached the CLI link rejection assertion or the later oversize assertion. These are now **three independent tests**, bringing the CLI suite from 8 to **10** tests. Directory and oversized-file rejection always run independently of link privileges.

Only the symlink test may skip, and only when Windows returns `EPERM` or `EACCES` **from the synthetic `symlink` creation call**. The skip diagnostic states that creation was denied and CLI link rejection was not exercised; it does not imply a passing link-security check. Once a link is created, the original rejection test must run: exit 3, no stdout, the fixed safe input error and no private details. Setup, CLI, assertion and cleanup failures are not inside the skip catch. Unexpected errors and non-Windows creation failures are rethrown. The CLI's actual symlink rejection, security guard and negative controls remain unchanged.

Report **pass / fail / skipped** counts separately. On hosts allowing symlinks, expect **10 / 0 / 0**. On Windows denying only this fixture creation, expect **9 / 0 / 1**, with directory and oversize checks still executed. These expectations are not results from the owner's computer; final local/Linux/Windows CI evidence is recorded by exact SHA in PR #9. A skipped symlink check remains a coverage limitation on that host; Linux and capable Windows CI continue exercising real symlink rejection. Do not suppress any other failure or analyze a private backup to reproduce a synthetic test issue.

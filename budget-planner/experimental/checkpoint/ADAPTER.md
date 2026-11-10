# Stage 2A source adapter contract

Issue #17; accepted engine SHA `6b61c8a88131e0ecdc6d80d0216be66441885efe`.
Experimental, synthetic-only, read-only, not imported by the application. Stage 1
`ledger.js`, its API and guards remain unchanged. No files, JSON readers,
storage, clock, random IDs, browser state or network in this adapter.

## Inputs and references

`buildCheckpointPreview({synthetic:true, data, checkpoint, throughDate, intents,
decisions})` takes plain, acyclic, finite-number DTOs. `data` has settings,
accounts, savingsBuckets, categories, scheduledItems, plannerEntries, transfers,
manualAdjustments and savingsBucketAdjustments. Collections are explicit, even
when empty. Optional `planner.entries` must equal plannerEntries. Other fields
(including metadata, audits, original starts and Last Entry) are retained. This
is an in-memory FinPath-shaped DTO, **not a backup import format**. `synthetic`
is a caller assertion, not a private-data detector or authorization to read data.

`sourceRef(collection, key)` encodes an exact reference as a JSON tuple string.
`sourceRevision(record)` is a canonical, lossless content token (not a hash or
timestamp). Decision references are `{ref, revision}` using these helpers.
Source snapshots and current sources have independent manifest revisions.
No record ID is generated or changed. All source and decision objects are
cloned; outputs, including preserved originals, are deeply frozen.
The original occurrence key is authoritative when redundant saved
scheduledItemId/payPeriodDate fields are absent; present conflicting fields
block. Those missing fields are never inserted into the preserved original.

`intents` is an explicit finite array of prospective FinPath-shaped occurrences:
`{entryKey, scheduledItemId, payPeriodDate, plannedAmount, useActual:false,
validated:false, lineItems:[], scheduledItemSnapshot}`. The original key is
mandatory; no recurrence generation. Its snapshot must equal its supplied
current source. A saved occurrence with that exact key overrides this intent;
both remain in the manifest. No current schedule amount repairs a saved entry.

`checkpoint` is the unchanged Stage 1 DTO. Settings currency, original anchor,
frequency and optional timezone must agree. Every supported source account and
bucket must be covered, including inactive nonzero assets. Source bucket links
must equal checkpoint links. Broken current links block; this API implements no
association correction. Unsupported account types block unless explicitly
excluded with evidence **and inactive, zero-start and unused**. Such exclusion
is qualified coverage, never verified net worth/debt. Legacy broken snapshots
can remain qualified context without invalidating separately evidenced openings.

## Decisions (all synthetic, exact membership)

All decisions require nonblank evidenceRef. Monetary/date/status/order decisions
are explicit assertions, not bank authentication. Unused, stale, duplicate,
conflicting or unknown decision references block. No broad mapping by name/type.

- `postings`: `{ref, revision, status:'posted'|'forecast'|'zero-intent',
  amountMinor, accountingDate, sequence, evidenceRef, movementId?,
  validationDisposition?, zeroVerified?}`. Amount must equal the exact source
  effective amount. Posted means independently confirmed and maps to Stage 1
  validated/posted regardless of the untouched UI flag. Forecast requires an
  explicit decision; if the raw flag is true also require
  `validationDisposition:'planned-not-posted'`. Missing decisions block. Zero
  requires zeroVerified=true, a genuinely planned unvalidated/non-actual intent
  and valid routing; it retains provenance but emits no financial event.
- `routing`: `{ref, revision, kind, fromAccountId?, toAccountId?, bucketId?,
  toBucketId?, categoryId?, evidenceRef}`. Explicit routing supplements absent
  scheduled transfer endpoints; it must not contradict present raw endpoints,
  snapshot type/account/bucket/category or manual transferType. Saved source
  snapshots must have matching original identity; live source classification
  never substitutes for a missing snapshot. Manual adjustments support only
  positive interest/unexpected_deposit or fee/unexpected_withdrawal/misc-expense;
  generic/signed corrections block. Bucket adjustments support only explicit
  positive allocation/release/reallocation, with no bank legs.
- `legacy`: `{ref, revision, accountingDate, evidenceRef}` qualifies a record
  assigned **and** accounted before T, with no contradictory raw date. It is
  excluded from forward math, retains original problems, and does not certify
  its amounts/classification/validation. It cannot conceal a carry or future
  assigned event. A legacy record still cannot share a bank movement claim
  with a forward member. Otherwise map a known pre-T posting normally and use
  Stage 1 boundary rules.
- `fulfilments`: `{id, intent:{ref,revision}, posting:{ref,revision},
  settlement:'full', amountBasis:'posting-effective', evidenceRef}`. One
  scheduled forecast intent to one posted original manual/adjustment record, same economic
  kind/routing/currency. No partial/split settlement or multiple consumption.
  Emit exactly one event with the **original scheduled origin/occurrence and
  revision**, the posting's amount/date/order, and exact references to both.
  Preserve original assigned dates independently in the manifest; the emitted
  event retains the scheduled assigned date. Plan minus actual is a reported
  variance, not a remaining obligation. A different posting movement claim
  cannot replace an existing incompatible claim. No amount/date matching implies
  fulfilment. No accepted Stage 1 origin semantics change is needed.
- `boundaries`: `{ref,revision,kind,evidenceRef}` translates to Stage 1 exact
  carry-forward/already-in-opening. Bind to the emitted primary identity; a
  consumed posting cannot acquire another boundary decision.
- `representations`: `{members:[{ref,revision},...],decision:'distinct'|
  'representative',representativeRef?,evidenceRef}`. Members must be emitted,
  eligible canonical primaries. DISTINCT retains genuinely separate movements;
  REPRESENTATIVE requires unchanged Stage 1 strict equivalence. Consumed or
  shadowed records cannot participate again. Coincidences are candidates only.
- `excludedAccounts`: `{ref,revision,evidenceRef}` for the narrowly qualified
  unsupported accounts described above.

## Exact money, dates and coverage

`decimalToMinor` accepts unsigned canonical decimal strings with 0–2 fractional
digits, at most 28 whole digits and supported two-decimal currencies. No signs,
whitespace, exponents, separators, leading zeroes or rounding. Legacy numbers
must be finite, nonnegative, not -0, at most 1,000,000 whole currency units,
and their shortest decimal spelling must satisfy the same grammar. This bound
keeps the binary-number spacing well below one cent; it **cannot recover prior
coercion/rounding**. A normalized value already corrupted to zero cannot be
detected from the value alone: explicit amount/evidence assertions are required.
Decimal strings are strongly preferred; unsafe/unsupported numbers block.

Saved effective precedence: nonempty uniquely ID-bearing nonnegative line items
sum exactly; else actualAmount when useActual=true; else explicit plannedAmount.
Both flags must be booleans. Empty/non-array/missing malformed money, negative,
refund, reversal and signed corrections block, never default to zero or abs().
Unused raw money is retained, not substituted for the effective amount.

Manual and bucket-adjustment IDs share Stage 1's adjustment-origin namespace;
colliding original IDs across those collections block rather than being rekeyed.

Accounting dates are asserted ISO calendar dates, independent of original
assignedDate/payPeriodDate and timezone. A present raw manual date must agree
with posting date. No cadence rounding of saved historical/off-grid keys.
Checkpoint validity, T-1/T/T+1, carries/opening coverage, explicit same-day order,
per-track funding and exact reserves are checked by unchanged Stage 1. Zero
intents do not bypass date/routing/boundary checks. No automatic credits-first
ordering. All supplied members are inventoried, including after throughDate;
future invalid references still block. Display filters are unsupported.

The adapter conservatively caps **all supplied dated records** at 10,000 before
consumption/exclusion (not only emitted events), without truncation. It does not
claim supplied forecast completeness or implement perpetual year navigation.
Representation membership across an unsupported window blocks, never silently
filters. Same-date/value/kind/routing income/expense coincidences also need
evidence policy in the adapter; Stage 1 transfer/movement checks still run.
Cross-date/composite overlaps without movement/link evidence cannot be proven;
no automatic duplicate deletion/merging or matching of Property Taxes cohorts.

## Output and failure contract

`{ok,diagnostics,manifest,legacyExceptions,events,reportMetadata,calculation}`.
Manifest retains full original data and decisions, individual records/revisions,
status/disposition, emitted/excluded/consumed/represented membership, source
attribution and fulfilment variance. It is detailed **synthetic** data, not the
offline utility's anonymized report and must not be logged with private inputs.
Report sidecars preserve category, original accounting/assigned dates, refs and
unclassified expense warnings. Stage 1 reports are accounting-date based.

Any unresolved eligible member blocks the **whole financial preview**. Inventory
and diagnostics remain available, but no events/partial balances/calculation
are published as trustworthy output. All uncompleted members say unresolved.
Invalid top-level/non-DTO shapes can fail before inventory. Safe diagnostics
contain codes/references, no copied amounts, notes or exception messages.
Successful Stage 1 exclusions are reflected back into the exact manifest.
Projected-path failure still blocks confirmed results: no dropping forecasts or
retrying a reduced input to bypass accepted engine guards.

Stage 2B–E must separately review durable content/version guards, consent,
atomic storage/import, backup capability, consumer integration and recovery.
This adapter's content tokens/evidence are caller assertions, not persisted
concurrency protection. No real-data use, activation or UI integration is
authorized by this contract. Partial fulfilment, FX, debt/net worth, generic
corrections, cross-account reserve reallocation and unknown settlements remain
unsupported and require a separate proposal if the core API must change.

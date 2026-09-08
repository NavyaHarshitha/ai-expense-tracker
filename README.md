# AI Expense Tracker

An expense tracker you talk to.

**Live:** https://ai-expense-tracker-navya.web.app
**API:** https://expense-api-175631461008.asia-south1.run.app

Built for the Patchamomma 2026 Build Phase. Not a demo of an idea — a working
app, used daily, for a real problem: a hand-built Google Sheet that stopped
being sustainable alongside a full-time job.

---

## The one idea

Most expense apps answer *"what did I spend?"* — a rear-view mirror. This one
answers **"what can I safely spend today?"**, which is a question you can act on
before lunch.

```
  what your accounts actually hold
− what you owe on cards
− commitments that have not gone out yet     (rent, EMIs, SIPs)
− savings you have not moved yet
────────────────────────────────────────
= safe to spend this month
÷ days remaining                             = today's allowance
```

Leftover rolls forward on its own. Spend nothing today and tomorrow's allowance
rises, because what remains divides across one fewer day. There is no rollover
ledger to keep in sync — it is a consequence of the arithmetic, not a feature
bolted on beside it.

The figure is shown **with its full working**, because a number you cannot check
is a number you will not trust.

### Two ideas that carry the data model

**Category and track are different axes.** Category is *what* you bought
(descriptive, for analysis). Track is *which bucket it came out of*
(intentional, for budgeting). Dinner on a trip is category `Food`, track
`Goa Trip` — so it never pollutes the monthly food budget.

**Only one movement type is spending.** Every entry is an `expense`, `income`,
`transfer` or `refund`. Logging a savings contribution as an expense would make
money you still hold look gone.

### Bills that land before payday

Salary on the 5th, rent on the 1st. That rent cannot be paid by that month's
salary — it comes out of the previous month's money. So a commitment whose
`dueDay` falls before `paydayDay` always reserves exactly one instance: never
zero (the next one is always looming), never two (only one is ever next).

Without it the money frees up the moment rent clears, gets spent, and the 1st
arrives short.

---

## What it does

| | |
|---|---|
| **Talk to it** | "Spent 250 on lunch and 1200 on groceries" → two confirmed rows. Speech → structured actions via Gemini function calling. |
| **Voice that acts** | Not just capture. Create a track, rename a category, correct yesterday's amount, set your balance — all spoken. |
| **Photograph a receipt** | Camera → Gemini vision → line items and total. |
| **Four track types** | Spending (monthly limit), commitment (fixed, dated), goal (target), project (accumulate → spend down → close). |
| **Multiple accounts** | Bank, cash, wallet, credit card. Cards invert: spending raises the debt, paying lowers it. |
| **Search at scale** | Category, track, movement and free text, single-pass over a prebuilt index. |
| **Written insights** | A Gemini narrative over figures the app computed — the model is never asked to do arithmetic. |
| **Dark mode** | Three-state: system, forced light, forced dark. No flash of the wrong theme on load. |
| **Works offline** | Firestore persistence — entry happens in car parks with one bar of signal. |

---

## Architecture

```
Browser (React 19 + TS + Tailwind v4, Firebase Hosting)
  │
  ├── Firestore (asia-south1) ─── all CRUD, direct, offline-persistent
  │      security rules are the ONLY authorization layer
  │
  └── Cloud Run: expense-api (FastAPI, asia-south1)
         │  every request carries a Firebase ID token
         └── Vertex AI · gemini-3.6-flash
```

**The backend holds no write credentials.** `/parse` and `/plan` return
*candidates* and *intended actions*. The client confirms them and writes through
its own existing Firestore path. So there is exactly one way into the ledger,
and the security rules govern it. A backend that could write directly would be a
second, unaudited door.

### Why Vertex AI and not the Gemini Developer API

The Developer API's free tier does not work on a billing-enabled project — it
returns `429 prepayment credits are depleted`. Vertex authenticates as the Cloud
Run service account, so **there is no API key to leak**, and the challenge
credits apply. Documented in [SETUP.md](SETUP.md).

---

## Correctness

**Money is an integer count of paise. Everywhere.** ₹250.10 is `25010`, never
`250.1`. Floating-point rupees accumulate error across thousands of rows and
every aggregate inherits it. Conversion to a decimal happens at exactly two
edges: parsing input, and formatting for display.

**Amounts are bounded.** `MAX_AMOUNT_MINOR` is ₹10 crore. Not an opinion about
anyone's wealth — a precision guard. `999999999999999` typed into an amount box
became 99,999,999,999,999,900 paise, past `Number.MAX_SAFE_INTEGER`, where
addition quietly stops being exact. The ceiling leaves room to sum ~900,000
maximum-value rows and stay in exact-integer territory.

**Nothing enters the app un-checked.** Firestore is schemaless, so every hook
used to do `{ ...d.data() } as Transaction` — a cast, which is a promise to the
compiler that nothing verifies. [`lib/sanitize.ts`](app/src/lib/sanitize.ts) is
now the trust boundary: every row is coerced to a well-formed shape, and one too
broken to repair is dropped rather than propagated. A single `undefined`
`amountMinor` used to make one row's total `NaN`, and `NaN` propagates through
every sum it touches until the hero figure reads `₹NaN`.

**Soft deletes only.** Financial records are corrected by appending, never
destroyed. Hard delete is refused *by the security rules*, not merely avoided by
the client.

---

## Security

| Layer | What it does |
|---|---|
| Firestore rules | Every document lives under `users/{uid}/`, so isolation is structural. **Verified against the emulator** — see [`test/rules/`](test/rules/). |
| Shape validation | Rules reject negative, non-numeric, absent and over-ceiling amounts, malformed dates and unknown movement types — on create *and* update. |
| API auth | Cloud Run is `--allow-unauthenticated` because the browser calls it directly; every request must carry a Firebase ID token, verified with `firebase-admin`. |
| Rate limiting | A valid token is not a licence to spend the project's credits. Per-uid token bucket: 20 burst, 10/min sustained. |
| Prompt injection | User-authored names and descriptions are fenced, labelled as data, and flattened — newlines and fence markers stripped — so a track named *"ignore all previous instructions"* reads as a track name. |
| Tool allowlist | The planner's output is filtered against a fixed set before it reaches the client. |
| Confirmation | Structural changes always require an explicit Apply. Expenses are graded: under ₹500 commits with an Undo, above requires the tap. |
| Headers | `frame-ancestors 'none'` + `X-Frame-Options: DENY` (clickjacking a money app is not theoretical), `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that grants microphone and camera to this origin only and switches the rest off. HSTS is on by default. |

A full `script-src`/`connect-src` CSP is deliberately *not* deployed. It is the
right next step, but it cannot be verified without driving a real Google
sign-in through a browser, and shipping an unverified CSP on submission day
risks breaking authentication outright. `frame-ancestors` gives the clickjacking
protection with no such risk.

The Firebase web config in the client is **not** a secret — it is designed to
ship to browsers, and per-user isolation is enforced by rules, not by hiding it.
The Vertex credentials are a different matter entirely and never leave the
server.

---

## Measured

Every number below is reproducible, not estimated.

### Bundle (`npm run build`)

| Chunk | Raw | Gzip | When |
|---|---|---|---|
| `firebase` | 613 kB | 180 kB | initial |
| `react` | 283 kB | 90 kB | initial |
| `index` | 68 kB | 19 kB | initial |
| CSS | 26 kB | 6 kB | initial |
| **Initial total** | **991 kB** | **295 kB** | |
| `Dashboard` (Recharts) | 381 kB | 110 kB | lazy, on route |
| `AddExpense` | 40 kB | 12 kB | lazy, on route |

Down from a 1.29 MB single bundle. Charts are the single largest dependency and
are not downloaded by someone who only wants to log a lunch.

### Core arithmetic, at scale

Median of 5 runs, Node 20. Seeded ledgers of realistic shape.

| Operation | 1,000 rows | 10,000 rows | 50,000 rows |
|---|---|---|---|
| `computeSafeToSpend` | 1.4 ms | 10.0 ms | 40.9 ms |
| `buildInsights` | 1.4 ms | 8.5 ms | 52.4 ms |
| `categoryBreakdown` | 0.3 ms | 2.1 ms | 12.3 ms |
| `indexTransactions` (once per change) | 0.2 ms | 1.4 ms | 11.8 ms |
| **Search: text query** | **0.06 ms** | **0.44 ms** | **1.8 ms** |
| **Search: category facet** | **0.02 ms** | **0.22 ms** | **0.52 ms** |
| Sanitise whole snapshot | 2.0 ms | 13.1 ms | 75.6 ms |

Search is the number that mattered: it runs per keystroke (debounced 200 ms) and
stays far inside a 16.7 ms frame even at 50,000 rows — an index built once per
data change, then a single pass with the cheapest test first.

Commitment and savings maths is **flat in the number of tracks** (2.2 ms at 40
tracks × 10,000 rows, versus 2.6 ms at 3 tracks). It previously re-filtered the
whole ledger inside a per-track loop, which multiplied the cost by every
commitment a user added.

### API (Cloud Run, asia-south1)

200 requests, 20 concurrent, against `/health` from a residential connection in
India. `--min-instances=0 --max-instances=10 --concurrency=40 --cpu=1 --memory=512Mi`.

| | |
|---|---|
| Throughput | 161 req/s |
| p50 | 99 ms |
| p95 | 130 ms |
| p99 | 343 ms |
| Errors | 0 / 200 |

`min-instances=0` keeps the idle cost at ₹0; the trade is a cold start, which
the p99 above includes. Auth is checked *before* the rate limiter and both
*before* any model call, so an unauthenticated flood costs a 401 and never
reaches Vertex.

### Tests

```
213 unit tests   (app/src/**/*.test.ts)
 32 rules tests  (test/rules/, against the Firestore emulator)
```

Including a hostile-input suite where every case is a defect that was actually
found by fuzzing the core, not a hypothetical.

---

## Accessibility

- **Focus is visible.** Was `outline: none` plus a 0.18-alpha glow — invisible
  on both grounds. Now a 2px outline in the theme's own colour, offset.
- **Contrast meets AA.** `--color-muted` measured 3.87:1 and carries captions
  and hints throughout; darkened to 4.51:1 against the worst-case ground.
  Interactive control borders got their own token at 3:1 (WCAG 1.4.11) while
  decorative dividers stay quiet.
- **Skip link** to `#main`, which is focusable.
- **The hero is a live region** — it changes without navigation (a save, a push
  from another device, midnight rolling over), and announces as *"Safe to spend
  today, ₹410"* rather than a bare number.
- Every form control is labelled; pinch-zoom is never blocked.

## Resilience

- **Error boundary.** A render throw used to unmount the tree into a blank white
  page — the worst failure mode for something holding your money, and the most
  likely moment for it is a live demo. Now it says what happened, confirms the
  data is safe, and offers reload or home.
- **404 route.** Hosting rewrites every path to `index.html` so deep links work,
  which meant a mistyped URL reached React Router's developer error page.
- **PWA.** Installable, maskable icons, offline-capable, safe-area aware.

---

## Run it

```bash
# Frontend
cd app
npm install
cp .env.local.example .env.local     # fill in your Firebase web config
npm run dev

npm run check                        # typecheck + 213 tests
npm run build

# API
cd api
pip install -r requirements.txt
uvicorn main:app --reload            # needs GOOGLE_CLOUD_PROJECT + ADC
```

Full cloud setup — project, billing, Firestore region, Vertex access, the
gotchas — is in **[SETUP.md](SETUP.md)**, written as a runbook to be followed
from scratch.

## Stack

React 19 · TypeScript (strict) · Vite 8 (rolldown) · Tailwind CSS v4 · Recharts
· Firebase Auth / Firestore / Hosting · FastAPI on Cloud Run · Vertex AI
`gemini-3.6-flash` · Vitest

## Honestly not done

- **Gmail bank-alert ingestion.** Designed in the spec, never built — it needs
  an Apps Script the user authorizes against their own inbox, plus a dedupe and
  review-queue pipeline.
- **Voice does not know about accounts.** "Spent 500 from HDFC" logs the expense
  but will not route it to that account.
- **No account-to-account transfer UI.**
- Rate limiting is per Cloud Run instance, not shared state. With N instances
  the effective ceiling is N × the limit. Redis or Firestore would make it
  exact; that is the upgrade path, not a pretence that it is already exact.

I would rather ship one thing working end to end and say plainly what is
missing than four things half-built.

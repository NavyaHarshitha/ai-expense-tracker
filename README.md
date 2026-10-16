# Safe to Spend

**An expense tracker you talk to.** Say what you spent; it tells you what is genuinely left
to spend today, after the rent, EMIs and SIPs that have not gone out yet.

**Live:** https://ai-expense-tracker-navya.web.app — manual entry, Safe-to-Spend and the
dashboard. Voice, receipts and the monthly review need the AI service, which runs locally.

---

## What this is

Most expense trackers answer *"what did you spend?"* — a question about the past. The one
people actually have, standing at a counter, is *"can I afford this?"* A bank balance does
not answer it, because it does not know which part of itself is already promised to rent,
EMIs and investments that have not left the account yet.

This app answers it. It subtracts what is committed but unpaid, what is being saved but not
yet moved, and anything already set aside for a goal, then divides the rest across the days
left in the month. The result is one figure — **safe to spend today** — shown with its full
working underneath.

Recording expenses is the other half of the problem. A form asks for five fields at the
moment you have least attention to spare, which is why forms get abandoned. Here you speak
one sentence instead.

### What it does

- **Voice is the primary input.** Gemini function calling turns a sentence into *actions*,
  not text — so talking to the app changes it: log an expense, create a budget, rename a
  category, correct yesterday's entry, or mark a recurring bill paid at its stored amount.
  Several expenses in one sentence become several separate entries.
- **Receipt capture.** Photograph a bill; it reads the merchant and total and keeps the
  itemisation with the entry.
- **Four budget types.** Spending allowances that reset monthly, fixed commitments on a known
  day, savings goals, and date-bounded projects that accumulate, spend down, then close.
- **Multiple accounts,** including credit cards — whose balance is debt, so spending raises
  it and paying lowers it.
- **Dashboard.** Spending by category, a daily trend, month-on-month comparison, and a
  written monthly review generated from figures the app already computed.
- **Works offline** and installs to a phone home screen.

---

## Architecture

```
   Browser  (React 19 · TypeScript · Tailwind v4 · Vite)
      │        all financial arithmetic runs here, as pure functions
      │
      ├──────────────►  Cloud Firestore  (asia-south1)
      │   read + write   security rules are the ONLY authorization layer
      │   onSnapshot     offline-persistent
      │
      └──────────────►  Cloud Run: expense-api  (FastAPI)
          POST /plan     1. verify Firebase ID token      → 401
               /parse    2. rate limit per user           → 429
               /insights 3. assemble prompt (user text fenced as data)
                         4. filter response to a tool allowlist
                                │
                                └──►  Vertex AI · gemini-3.6-flash
```

**The load-bearing decision: the AI service holds no write credentials.** `/plan` and
`/parse` return *intended actions*. The client displays them, the user confirms, and the
client performs the write through its own path. So there is exactly one route into the
ledger, and the Firestore security rules govern all of it.

Two more worth knowing:

- **All arithmetic runs client-side**, as pure functions with no framework or network
  dependency. That is what makes the financial core directly unit-testable, and keeps figures
  correct offline.
- **Money is an integer count of paise, everywhere.** Never a float, and bounded at ₹10
  crore — past 2⁵³ addition silently stops being exact.

---

## Getting started

### Prerequisites

- Node.js 20+
- Python 3.11+ (only to run the AI service locally)
- A Firebase project with **Authentication** (Google provider) and **Cloud Firestore** enabled
- Java 11+ (only for the security-rules tests, which use the Firestore emulator)

### 1. Clone and configure

```bash
git clone https://github.com/NavyaHarshitha/ai-expense-tracker.git
cd ai-expense-tracker/app
npm install
cp .env.local.example .env.local
```

Fill `.env.local` with your own Firebase web config:

```bash
npx firebase-tools apps:sdkconfig WEB --project YOUR_PROJECT_ID
```

These values are **not secrets** — a Firebase web config is designed to ship to the browser.
Per-user isolation comes from the security rules, not from hiding the config.

### 2. Run it

```bash
npm run dev        # http://localhost:5173
```

Sign in with Google. The app works immediately against Firestore; voice and receipts
additionally need the AI service (step 4).

Once `api/.env` and `api/.venv` exist (step 4), one command runs both together, and
Ctrl+C stops both:

```bash
./start-local.sh
```

### 3. Deploy the security rules

**Do this before using it with real data.** The rules are the entire authorization layer.

```bash
cd ..
npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID
```

### 4. The AI service (optional for local development)

Voice, receipts and the monthly review call a small FastAPI service. Without it, the manual
form still works fully.

```bash
cd api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
gcloud auth application-default login      # first time only
.venv/bin/uvicorn main:app --reload --port 8080
```

On a project with no billing account, Vertex AI is unavailable. Use a free key from
[Google AI Studio](https://aistudio.google.com/apikey) instead — setting it switches the
service to the Gemini Developer API's free tier:

```bash
echo 'GEMINI_API_KEY=your-key' > api/.env     # git-ignored
```

Then point the client at it, in `app/.env.local`:

```
VITE_API_BASE_URL=http://localhost:8080
```

To deploy it:

```bash
gcloud run deploy expense-api --source api --region asia-south1 \
  --allow-unauthenticated --min-instances=0 --max-instances=10 \
  --concurrency=40 --cpu=1 --memory=512Mi
```

Grant the Cloud Run runtime service account `roles/aiplatform.user` so it can reach Vertex
AI. The service is `--allow-unauthenticated` because the browser calls it directly, but every
request must carry a valid Firebase ID token — that check is the only thing between the
internet and a metered model, so it runs before anything else.

> **Vertex AI, not the Gemini Developer API.** The Developer API's free tier does not work on
> a billing-enabled project (`429 prepayment credits are depleted`). Vertex authenticates as
> the Cloud Run service account, which means **no API key exists that could be leaked**.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run check` | Type check + all unit tests |
| `npm run build` | Production build |
| `npm run lint` | Lint |
| `npm run typecheck` | Type check only |

Security-rules tests run against the real Firestore emulator and need Java:

```bash
cd test/rules
npm install @firebase/rules-unit-testing firebase
npx firebase emulators:exec --only firestore --project rules-test \
  "node firestore.rules.test.mjs"
```

---

## Project layout

```
app/                  React client — the whole UI and all financial arithmetic
  src/lib/            pure functions: safeToSpend, accounts, insights,
                      money, sanitize, filterTransactions, planActions
  src/hooks/          Firestore subscriptions and capture hooks
  src/components/     UI
  src/pages/          Home · Add Expense · Dashboard
api/                  FastAPI service on Cloud Run
  main.py             routes, size caps, tool allowlist
  gemini.py           Vertex AI client, prompts, tool declarations
  auth.py             Firebase ID token verification
  limits.py           per-user rate limiting
test/rules/           Firestore security-rules tests (emulator)
firestore.rules       the entire authorization layer
firebase.json         hosting config and security headers
```

`app/src/lib/` is where the interesting code is. Every file there is a pure function with
tests beside it.

> The `index.html`, `add-expense.html`, `dashboard.html`, `styles.css` and `js/` at the
> repository root are the original vanilla-JS prototype, kept for history. The application
> lives entirely in `app/`.

---

## Testing

```
223 unit tests      app/src/**/*.test.ts
 32 rules tests     test/rules/ — against the Firestore emulator
```

The unit suite includes a deliberately adversarial group: malformed and missing dates,
non-numeric and out-of-range amounts, empty ledgers, month boundaries, leap years, and days
where refunds exceed spending. Those are the cases where a wrong answer still *renders*
plausibly, so nobody notices it.

The rules tests cover cross-user access, unauthenticated access, every validation branch, and
the append-only guarantee. Security properties asserted by reading are properties nobody has
actually checked.

---

## Measured

| | |
| --- | --- |
| Search across 10,000 transactions | 0.44 ms |
| Safe-to-Spend recompute, 10,000 transactions | 10 ms |
| Initial page payload | 991 kB raw / **295 kB gzipped** |
| API latency | p50 99 ms · p95 130 ms · p99 343 ms |
| API errors, 200 requests at 20 concurrent | 0 |

Search is the one that mattered: it runs on every keystroke, so it has one animation frame
(16.7 ms) to finish. An index is built once per data change, not once per keystroke.

---

## Notable design decisions

**Category and track are independent axes.** A category is *what you bought* (for analysis);
a track is *which pot it came out of* (for budgeting). Keeping them separate means a dinner
on holiday is category `Food`, track `Goa Trip` — and never distorts the monthly food budget.

**Only one of four movement types is spending.** `expense` reduces money; `income`,
`transfer` and `refund` do not. That is what lets goals and daily spending share one ledger:
a savings contribution never looks like money you have lost.

**Bills due before payday are held a cycle early.** If salary lands on the 5th and rent is
due on the 1st, that rent cannot come from that month's salary. The app reserves exactly one
instance at all times — never zero, never two — so the 1st never arrives short.

**Nothing enters the app unchecked.** Firestore is schemaless, so every document passes
through a validation layer (`app/src/lib/sanitize.ts`) rather than a type cast. Strict about
amounts and dates, where there is no safe default; lenient about descriptive fields, where
losing one costs nothing.

**Soft deletes only.** Records are corrected by appending. Hard delete is refused *by the
security rules*, not merely avoided by the client.

---

## Known limitations

- Voice does not route to a named account — "spent 500 from HDFC" logs the expense but not
  the account.
- No UI for transfers between your own accounts; record them as two entries.
- Automatic ingestion of bank-alert emails is designed but not built.
- Rate limiting is per Cloud Run instance rather than shared, so the effective ceiling scales
  with instance count.
- A full `script-src` Content Security Policy is not deployed — only `frame-ancestors`.

---

## Stack

React 19 · TypeScript (strict) · Vite 8 · Tailwind CSS v4 · Recharts · Vitest
· Firebase Authentication · Cloud Firestore · Firebase Hosting
· FastAPI · Cloud Run · Vertex AI (Gemini 3.6 Flash)

Built for the Google Patchamomma 2026 Build Phase.

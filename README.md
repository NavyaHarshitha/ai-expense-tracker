# Safe to Spend

**An expense tracker you talk to.** Say what you spent; it tells you what is genuinely left
to spend today, after the rent, EMIs and SIPs that have not gone out yet.

**Live:** https://ai-expense-tracker-navya.web.app

Open it, sign in with Google, and it works. For voice, receipts and the written monthly
review, add your own free Gemini key in **Settings** — it takes about a minute, and the
app walks you through it.

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
- **Costs nothing to run.** Each person brings a free Gemini key, so there is no server and
  no bill, and one person's usage never touches anyone else's allowance.

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
      └──────────────►  Gemini API · gemini-3.6-flash
          the user's own key, from this device only
            1. assemble prompt (user text fenced as data)
            2. filter response to a tool allowlist, capped at 20 actions
            3. validate every action before it is shown  (planActions.ts)
            4. the client writes to Firestore: structural changes after
               an explicit Apply, small expenses at once with an Undo
```

**The load-bearing decision: the model never writes anything.** A plan comes back as
*intended actions*. The client validates them and shows them; a new track, a rename or a
large amount waits for an explicit Apply, and a small expense saves at once with an Undo.
Either way the client performs the write through its own path. So there is exactly one route into the
ledger, and the Firestore security rules govern all of it.

**Why there is no backend.** The first version ran the model behind a FastAPI service on
Cloud Run, billed to the project, with token verification and per-user rate limiting to
protect those credits (tag [`v1-cloud-run`](https://github.com/NavyaHarshitha/ai-expense-tracker/tree/v1-cloud-run)). Once the free trial
ended, hosting it for friends meant paying for their usage. So each user now brings a free
key from Google AI Studio, and the browser calls Gemini directly. The server's guards
existed to protect a shared, billed key; with no shared key there is nothing left for them
to protect. The prompts, tool declarations and output checks moved into
`app/src/lib/gemini.ts` unchanged, and the property above survived the move intact — the
server never held write credentials either.

The key is stored in that browser only (`localStorage`), never in Firestore, and is sent
only to Google, in a header rather than the URL.

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

Sign in with Google. The app works immediately against Firestore. For voice, receipts
and the monthly review, open **Settings** and add a free key from
[Google AI Studio](https://aistudio.google.com/apikey).

### 3. Deploy the security rules

**Do this before using it with real data.** The rules are the entire authorization layer.

```bash
cd ..
npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID
```

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
  src/lib/gemini.ts   prompts, tool declarations, size caps, tool allowlist
  src/lib/geminiKey.ts  the user's key, kept on this device
  src/hooks/          Firestore subscriptions and capture hooks
  src/components/     UI
  src/pages/          Home · Add Expense · Dashboard · Settings
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
255 unit tests      app/src/**/*.test.ts
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
| Initial page payload | 998 kB raw / **294 kB gzipped** |
| Gemini client, loaded only when needed | 16 kB raw / 7 kB gzipped |

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
- The Gemini key is per device: on a new phone or laptop, it has to be added again.
- A full `script-src` Content Security Policy is not deployed — only `frame-ancestors`. That
  matters more now that a key sits in `localStorage`, where injected script could read it.
  The exposure is a free-tier key the user can revoke in one click, which is why it is
  acceptable here, but a strict CSP is the next hardening step.

---

## Stack

React 19 · TypeScript (strict) · Vite 8 · Tailwind CSS v4 · Recharts · Vitest
· Firebase Authentication · Cloud Firestore · Firebase Hosting
· Gemini API (Gemini 3.6 Flash), called from the browser

Built for the Google Patchamomma 2026 Build Phase.

# Firestore rules tests

The security rules are the *entire* authorization layer for this app - the
browser talks to Firestore directly, so anything the rules permit is permitted
full stop. That makes them worth testing rather than eyeballing.

These run against the real Firestore emulator, not a mock.

## Run

```bash
npm install @firebase/rules-unit-testing firebase
npx firebase emulators:exec --only firestore --project rules-test "node firestore.rules.test.mjs"
```

Requires Java (the emulator is a JAR).

## What is covered

- **Legacy rows** - a document missing a descriptive field stays writable; only the money-critical fields are required, so the rules never strand history behind a schema the user never chose.
- **Isolation** - a second signed-in user cannot read or write any part of the
  first user's data: transactions, profile, or accounts. An unauthenticated
  caller gets nothing at all.
- **Money shape** - negative, non-numeric, absent and over-ceiling amounts are
  refused; so are malformed dates and unknown movement types. Zero is allowed,
  because a correction to nil is legitimate.
- **Updates** - the same validation applies to a patch, so an edit cannot sneak
  a negative amount into a row that was created valid.
- **Append-only** - hard delete is refused; removal is a `deletedAt` timestamp.

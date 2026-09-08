import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'

const env = await initializeTestEnvironment({
  projectId: 'rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
})

const alice = env.authenticatedContext('alice').firestore()
const bob   = env.authenticatedContext('bob').firestore()
const anon  = env.unauthenticatedContext().firestore()

const T = (o = {}) => ({
  occurredOn: '2026-09-09', amountMinor: 25000, movement: 'expense',
  trackId: 't1', categoryName: 'Food', description: 'Lunch',
  paymentMethod: 'upi', source: 'manual', createdAt: 1, deletedAt: null, ...o,
})

let pass = 0, fail = 0
const check = async (name, p) => {
  try { await p; console.log(`  PASS  ${name}`); pass++ }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); fail++ }
}

const aTxn = (id) => doc(alice, `users/alice/transactions/${id}`)

console.log('\n--- isolation ---')
await check('alice writes her own transaction',
  assertSucceeds(setDoc(aTxn('t1'), T())))
await check('bob CANNOT read alice\'s transaction',
  assertFails(getDoc(doc(bob, 'users/alice/transactions/t1'))))
await check('bob CANNOT write to alice\'s ledger',
  assertFails(setDoc(doc(bob, 'users/alice/transactions/evil'), T())))
await check('anonymous CANNOT read anything',
  assertFails(getDoc(doc(anon, 'users/alice/transactions/t1'))))
await check('bob CANNOT read alice\'s profile',
  assertFails(getDoc(doc(bob, 'users/alice'))))
await check('bob CANNOT read alice\'s accounts',
  assertFails(getDoc(doc(bob, 'users/alice/accounts/a1'))))

console.log('\n--- money shape ---')
await check('rejects a NEGATIVE amount',
  assertFails(setDoc(aTxn('neg'), T({ amountMinor: -50000 }))))
await check('rejects a STRING amount',
  assertFails(setDoc(aTxn('str'), T({ amountMinor: '25000' }))))
await check('rejects an amount past the precision ceiling',
  assertFails(setDoc(aTxn('big'), T({ amountMinor: 99999999999999 }))))
const omit = (o, k) => { const c = { ...o }; delete c[k]; return c }
await check('rejects a MISSING amount',
  assertFails(setDoc(aTxn('none'), omit(T(), 'amountMinor'))))
await check('rejects a malformed date',
  assertFails(setDoc(aTxn('bad'), T({ occurredOn: 'yesterday' }))))
await check('rejects a missing date',
  assertFails(setDoc(aTxn('nodate'), omit(T(), 'occurredOn'))))
await check('rejects an unknown movement',
  assertFails(setDoc(aTxn('mv'), T({ movement: 'wormhole' }))))
await check('accepts zero (a correction to nil)',
  assertSucceeds(setDoc(aTxn('zero'), T({ amountMinor: 0 }))))
await check('accepts a refund',
  assertSucceeds(setDoc(aTxn('ref'), T({ movement: 'refund' }))))

console.log('\n--- updates keep the invariant ---')
await check('soft delete is allowed',
  assertSucceeds(updateDoc(aTxn('t1'), { deletedAt: Date.now() })))
await check('an update CANNOT sneak in a negative amount',
  assertFails(updateDoc(aTxn('t1'), { amountMinor: -1 })))
await check('a valid amount edit is allowed',
  assertSucceeds(updateDoc(aTxn('t1'), { amountMinor: 30000 })))
await check('HARD delete is refused',
  assertFails(deleteDoc(aTxn('t1'))))

console.log('\n--- legacy rows stay editable ---')
await check('a row with NO description can still be written',
  assertSucceeds(setDoc(aTxn('legacy'), omit(T(), 'description'))))
await check('a row with NO categoryName can still be written',
  assertSucceeds(setDoc(aTxn('legacy2'), omit(T(), 'categoryName'))))
await check('but a non-string description is still refused',
  assertFails(setDoc(aTxn('badstr'), T({ description: 42 }))))

console.log('\n--- other collections still work ---')
for (const c of ['tracks', 'accounts', 'categories', 'settings', 'insights']) {
  await check(`alice writes ${c}`,
    assertSucceeds(setDoc(doc(alice, `users/alice/${c}/x`), { name: 'X', archived: false })))
  await check(`bob CANNOT write alice's ${c}`,
    assertFails(setDoc(doc(bob, `users/alice/${c}/x`), { name: 'X' })))
}

console.log(`\n${pass} passed, ${fail} failed`)
await env.cleanup()
process.exit(fail ? 1 : 0)

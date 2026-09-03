/*
Demo data seeder.

An empty dashboard demos nothing - every chart is blank and Safe-to-Spend has
no spend to subtract. This writes two months of plausible history so the app
can be shown, and so later phases (recurring detection, forecasting) have
something to find.

Runs client-side as the signed-in user, deliberately: the Admin SDK would mean
handling a service-account key for no benefit here, and writing through the
same security rules as the real app proves those rules actually permit normal use.
*/

import { addDoc, collection, setDoc, doc } from 'firebase/firestore'

import { db, userPath } from '../lib/firebase'
import { toPaise } from '../lib/money'
import type { PaymentMethod, Track, Transaction } from '../lib/types'

const MERCHANTS: Array<[string, string, number, number, PaymentMethod]> = [
  // description, category, min ₹, max ₹, method
  ['Swiggy', 'Food', 180, 520, 'upi'],
  ['Auto to office', 'Transport', 40, 120, 'cash'],
  ['Uber', 'Transport', 90, 340, 'upi'],
  ['BigBasket', 'Groceries', 600, 2400, 'card'],
  ['Chai and snacks', 'Food', 20, 80, 'cash'],
  ['Blinkit', 'Groceries', 150, 700, 'upi'],
  ['Zomato', 'Food', 220, 600, 'upi'],
  ['Metro card recharge', 'Transport', 200, 500, 'upi'],
  ['Pharmacy', 'Health', 120, 900, 'upi'],
  ['Electricity bill', 'Bills', 900, 2200, 'bank_transfer'],
  ['Mobile recharge', 'Bills', 239, 799, 'upi'],
  ['Amazon', 'Shopping', 300, 3200, 'card'],
  ['Salon', 'Other', 250, 800, 'upi'],
  ['Movie tickets', 'Other', 300, 900, 'card'],
]

function iso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/*
Deterministic pseudo-random, seeded from the index, so re-seeding produces the
same history instead of a different demo every run.
*/
function rand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export async function seedDemoData(uid: string) {
  const tracksCol = collection(db, userPath(uid, 'tracks'))

  const specs: Array<Omit<Track, 'id'>> = [
    { name: 'Daily Expenses', type: 'spending', archived: false, monthlyLimitMinor: toPaise(22000), createdAt: Date.now() },
    { name: 'Home Loan EMI', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(18400), dueDay: 28, createdAt: Date.now() },
    { name: 'Emergency Fund', type: 'goal', archived: false, targetMinor: toPaise(300000), plannedMonthlyMinor: toPaise(10000), raidable: false, priority: 1, createdAt: Date.now() },
    { name: 'Goa Trip', type: 'project', archived: false, budgetMinor: toPaise(30000), plannedMonthlyMinor: toPaise(5000), phase: 'accumulating', createdAt: Date.now() },
  ]

  const ids: Record<string, string> = {}
  for (const spec of specs) {
    const ref = await addDoc(tracksCol, spec)
    ids[spec.name] = ref.id
  }

  // Income needs to exist or Safe-to-Spend is meaningless.
  await setDoc(
    doc(db, userPath(uid, 'settings'), 'profile'),
    { monthlyIncomeMinor: toPaise(92000) },
    { merge: true },
  )

  const txCol = collection(db, userPath(uid, 'transactions'))
  const now = new Date()
  const writes: Array<Promise<unknown>> = []

  // Two months back to today, roughly one or two expenses a day.
  for (let dayOffset = 60; dayOffset >= 0; dayOffset--) {
    const date = new Date(now)
    date.setDate(date.getDate() - dayOffset)

    const count = rand(dayOffset) > 0.65 ? 2 : 1

    for (let i = 0; i < count; i++) {
      const seed = dayOffset * 7 + i * 13
      const [description, categoryName, min, max, paymentMethod] =
        MERCHANTS[Math.floor(rand(seed) * MERCHANTS.length)]

      const rupees = Math.round(min + rand(seed + 1) * (max - min))

      const txn: Omit<Transaction, 'id'> = {
        occurredOn: iso(date),
        amountMinor: toPaise(rupees),
        movement: 'expense',
        trackId: ids['Daily Expenses'],
        categoryName,
        description,
        paymentMethod,
        source: 'seed',
        createdAt: Date.now(),
        deletedAt: null,
      }
      writes.push(addDoc(txCol, txn))
    }
  }

  // Salary, EMI payments, and savings transfers for each of the two months.
  for (const monthsAgo of [1, 0]) {
    const base = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)

    writes.push(
      addDoc(txCol, {
        occurredOn: iso(new Date(base.getFullYear(), base.getMonth(), 1)),
        amountMinor: toPaise(92000), movement: 'income', trackId: ids['Daily Expenses'],
        categoryName: 'Other', description: 'Salary', paymentMethod: 'bank_transfer',
        source: 'seed', createdAt: Date.now(), deletedAt: null,
      } satisfies Omit<Transaction, 'id'>),
    )

    // Charged to the commitment track, so Safe-to-Spend must not count it twice.
    writes.push(
      addDoc(txCol, {
        occurredOn: iso(new Date(base.getFullYear(), base.getMonth(), 28)),
        amountMinor: toPaise(18400), movement: 'expense', trackId: ids['Home Loan EMI'],
        categoryName: 'Bills', description: 'Home loan EMI', paymentMethod: 'bank_transfer',
        source: 'seed', createdAt: Date.now(), deletedAt: null,
      } satisfies Omit<Transaction, 'id'>),
    )

    // A transfer, not an expense - this money is saved, not spent.
    writes.push(
      addDoc(txCol, {
        occurredOn: iso(new Date(base.getFullYear(), base.getMonth(), 2)),
        amountMinor: toPaise(10000), movement: 'transfer', trackId: ids['Emergency Fund'],
        toTrackId: ids['Emergency Fund'], categoryName: 'Other',
        description: 'To emergency fund', paymentMethod: 'bank_transfer',
        source: 'seed', createdAt: Date.now(), deletedAt: null,
      } satisfies Omit<Transaction, 'id'>),
    )

    writes.push(
      addDoc(txCol, {
        occurredOn: iso(new Date(base.getFullYear(), base.getMonth(), 3)),
        amountMinor: toPaise(5000), movement: 'transfer', trackId: ids['Goa Trip'],
        toTrackId: ids['Goa Trip'], categoryName: 'Other', description: 'To Goa trip fund',
        paymentMethod: 'bank_transfer', source: 'seed', createdAt: Date.now(), deletedAt: null,
      } satisfies Omit<Transaction, 'id'>),
    )
  }

  await Promise.all(writes)
  return { tracks: specs.length, transactions: writes.length }
}

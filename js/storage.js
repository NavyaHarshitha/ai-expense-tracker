/*
Responsibility:
Load expenses
Save expenses
*/

const STORAGE_KEY = "expenses";

export function loadExpenses() {
  const savedExpenses = localStorage.getItem(STORAGE_KEY);

  if (!savedExpenses) {
    return [];
  }

  try {
    const parsedExpenses = JSON.parse(savedExpenses);

    return Array.isArray(parsedExpenses) ? parsedExpenses : [];
  } catch (error) {
    console.error("Could not read saved expenses:", error);

    return [];
  }
}

export function saveExpenses(expenses) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(expenses)
  );
}
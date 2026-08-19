/*
Responsibility:
Pure calculations over an expenses array
(shared by the add-expense page and the dashboard page)
*/

export function calculateTotal(expenses) {
  return expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );
}

export function calculateHighestExpense(expenses) {
  return expenses.reduce(
    (highest, expense) => {
      return expense.amount > highest
        ? expense.amount
        : highest;
    },
    0
  );
}

export function calculateTopCategory(expenses) {
  if (expenses.length === 0) {
    return "None";
  }

  const categoryCounts = {};

  // Count each category
  expenses.forEach(function (expense) {
    const category = expense.category;
    categoryCounts[category] =
      (categoryCounts[category] || 0) + 1;
  });

  // Find the highest count
  let highestCount = 0;
  let topCategory = "";

  for (const category in categoryCounts) {
    if (categoryCounts[category] > highestCount) {
      highestCount = categoryCounts[category];
      topCategory = category;
    }
  }

  // Check if there is a tie
  let highestCountOccurrences = 0;
  for (const category in categoryCounts) {
    if (categoryCounts[category] === highestCount) {
      highestCountOccurrences++;
    }
  }

  if (highestCountOccurrences > 1) {
    return "No dominant category";
  }

  return topCategory;
}

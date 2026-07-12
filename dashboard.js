const savedExpenses = localStorage.getItem("expenses");
const expenses = JSON.parse(savedExpenses) || [];

const dashboardTotal = document.getElementById("dashboard-total");
const dashboardCount = document.getElementById("dashboard-count");
const dashboardHighest = document.getElementById("dashboard-highest");
const dashboardTopCategory = document.getElementById("dashboard-top-category");
const dashboardExpenseList = document.getElementById("dashboard-expense-list");
const dashboardTableTotal = document.getElementById("dashboard-table-total");

function calculateTotal() {
  return expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );
}

function calculateHighestExpense() {
  return expenses.reduce(
    (highest, expense) => {
      return expense.amount > highest
        ? expense.amount
        : highest;
    },
    0
  );
}

function renderDashboardExpenses() {
  dashboardExpenseList.innerHTML = "";

  expenses.forEach(function (expense) {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${expense.date}</td>
      <td>${expense.description}</td>
      <td>${expense.category}</td>
      <td>${expense.paymentMethod}</td>
      <td>₹${expense.amount}</td>
    `;

    dashboardExpenseList.appendChild(row);
  });
}

function calculateTopCategory() {
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

const total = calculateTotal();
const highestExpense = calculateHighestExpense();
const topCategory = calculateTopCategory();

dashboardTotal.textContent = `₹${total}`;
dashboardCount.textContent = expenses.length;
dashboardHighest.textContent = `₹${highestExpense}`;
dashboardTableTotal.textContent = `₹${total}`;
dashboardTopCategory.textContent = topCategory;

renderDashboardExpenses();
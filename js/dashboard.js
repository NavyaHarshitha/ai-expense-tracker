import { loadExpenses } from "./storage.js";

import {
  calculateTotal,
  calculateHighestExpense,
  calculateTopCategory
} from "./calculations.js";

const expenses = loadExpenses();

const dashboardTotal = document.getElementById("dashboard-total");
const dashboardCount = document.getElementById("dashboard-count");
const dashboardHighest = document.getElementById("dashboard-highest");
const dashboardTopCategory = document.getElementById("dashboard-top-category");
const dashboardExpenseList = document.getElementById("dashboard-expense-list");
const dashboardTableTotal = document.getElementById("dashboard-table-total");

function addCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.appendChild(cell);
}

function renderDashboardExpenses() {
  dashboardExpenseList.innerHTML = "";

  expenses.forEach(function (expense) {
    const row = document.createElement("tr");

    addCell(row, expense.date);
    addCell(row, expense.description);
    addCell(row, expense.category);
    addCell(row, expense.paymentMethod);
    addCell(row, `₹${expense.amount}`);

    dashboardExpenseList.appendChild(row);
  });
}

const total = calculateTotal(expenses);
const highestExpense = calculateHighestExpense(expenses);
const topCategory = calculateTopCategory(expenses);

dashboardTotal.textContent = `₹${total}`;
dashboardCount.textContent = expenses.length;
dashboardHighest.textContent = `₹${highestExpense}`;
dashboardTableTotal.textContent = `₹${total}`;
dashboardTopCategory.textContent = topCategory;

renderDashboardExpenses();
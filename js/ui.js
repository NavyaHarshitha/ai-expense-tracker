/*
Responsibility:
Render expenses
Create buttons
Fill the edit form
Calculate the displayed total
*/

import { saveExpenses } from "./storage.js";

import {
  expenses,
  setEditingIndex
} from "./state.js";

import { calculateTotal } from "./calculations.js";

function createExpenseDeleteButton(
  index,
  renderExpenses
) {
  const deleteButton =
    document.createElement("button");

  deleteButton.type = "button";
  deleteButton.classList.add(
    "expense-delete-button"
  );

  deleteButton.setAttribute(
    "aria-label",
    "Delete expense"
  );

  deleteButton.setAttribute(
    "title",
    "Delete expense"
  );

  deleteButton.innerHTML = `
    <svg class="expense-delete-button__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z"></path>
      <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"></path>
    </svg>
  `;

  deleteButton.addEventListener("click", function () {
    expenses.splice(index, 1);

    saveExpenses(expenses);
    renderExpenses();
  });

  return deleteButton;
}

function createExpenseEditButton(
  expense,
  index,
  inputs,
  clearFormErrors
) {
  const editButton =
    document.createElement("button");

  editButton.type = "button";
  editButton.classList.add(
    "expense-edit-button"
  );

  editButton.setAttribute(
    "aria-label",
    "Edit expense"
  );

  editButton.setAttribute(
    "title",
    "Edit expense"
  );

  editButton.innerHTML = `
    <svg class="expense-edit-button__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false">
      <path d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25Z"></path>
      <path d="M19.71 7.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.05 1.05 2.75 2.75 1.05-1.05Z"></path>
    </svg>
  `;

  editButton.addEventListener("click", function () {
    inputs.date.value = expense.date;
    inputs.description.value = expense.description;
    inputs.category.value = expense.category;
    inputs.paymentMethod.value =
      expense.paymentMethod;
    inputs.amount.value = expense.amount;

    setEditingIndex(index);
    clearFormErrors();
  });

  return editButton;
}

export function renderExpenses({
  expenseList,
  totalExpense,
  inputs,
  clearFormErrors
}) {
  expenseList.innerHTML = "";

  expenses.forEach(function (expense, index) {
    const listItem =
      document.createElement("li");

    const editButton =
      createExpenseEditButton(
        expense,
        index,
        inputs,
        clearFormErrors
      );

    const deleteButton =
      createExpenseDeleteButton(
        index,
        function () {
          renderExpenses({
            expenseList,
            totalExpense,
            inputs,
            clearFormErrors
          });
        }
      );

    listItem.textContent =
      `${expense.date} | ` +
      `${expense.description} | ` +
      `${expense.category} | ` +
      `${expense.paymentMethod} | ` +
      `₹${expense.amount} `;

    listItem.appendChild(editButton);
    listItem.appendChild(deleteButton);

    expenseList.appendChild(listItem);
  });

  totalExpense.textContent = calculateTotal(expenses);
}
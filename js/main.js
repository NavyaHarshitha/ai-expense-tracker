/*
Responsibility:
Select DOM elements
Connect all modules
Handle form submission
*/

import { saveExpenses } from "./storage.js";

import {
  expenses,
  editingIndex,
  clearEditingIndex
} from "./state.js";

import {
  validateExpense,
  clearErrors
} from "./validation.js";

import { renderExpenses } from "./ui.js";

const manualExpenseForm =
  document.getElementById("manual-expense-form");

const expenseDateInput =
  document.getElementById("expense-date");

const descriptionInput =
  document.getElementById("description");

const categoryInput =
  document.getElementById("category");

const paymentMethodInput =
  document.getElementById("payment-method");

const amountInput =
  document.getElementById("amount");

const expenseList =
  document.getElementById("expense-list");

const totalExpense =
  document.getElementById("total-expense");

const dateError =
  document.getElementById("date-error");

const descriptionError =
  document.getElementById("description-error");

const categoryError =
  document.getElementById("category-error");

const paymentMethodError =
  document.getElementById(
    "payment-method-error"
  );

const amountError =
  document.getElementById("amount-error");

const inputs = {
  date: expenseDateInput,
  description: descriptionInput,
  category: categoryInput,
  paymentMethod: paymentMethodInput,
  amount: amountInput
};

const fields = {
  date: {
    input: expenseDateInput,
    error: dateError
  },

  description: {
    input: descriptionInput,
    error: descriptionError
  },

  category: {
    input: categoryInput,
    error: categoryError
  },

  paymentMethod: {
    input: paymentMethodInput,
    error: paymentMethodError
  },

  amount: {
    input: amountInput,
    error: amountError
  }
};

function clearFormErrors() {
  clearErrors(Object.values(fields));
}

function render() {
  renderExpenses({
    expenseList,
    totalExpense,
    inputs,
    clearFormErrors
  });
}

manualExpenseForm.addEventListener(
  "submit",
  function (event) {
    event.preventDefault();

    if (!validateExpense(fields)) {
      return;
    }

    const expense = {
      date: expenseDateInput.value,
      description:
        descriptionInput.value.trim(),
      category: categoryInput.value,
      paymentMethod:
        paymentMethodInput.value,
      amount: Number(amountInput.value)
    };

    if (editingIndex === null) {
      expenses.push(expense);
    } else {
      expenses[editingIndex] = expense;
      clearEditingIndex();
    }

    saveExpenses(expenses);
    render();

    manualExpenseForm.reset();
    clearFormErrors();
  }
);

render();
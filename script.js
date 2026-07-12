const savedExpenses = localStorage.getItem("expenses"); //local storage in web browser
const expenses = JSON.parse(savedExpenses) || []; // parsing back the saved data, or creating new array,safe check as null
let editingIndex = null; // for edit purpose ( this is a state in react)

//creating variables in js of css/html elements for access
const manualExpenseForm = document.getElementById("manual-expense-form");

const expenseDateInput = document.getElementById("expense-date");
const descriptionInput = document.getElementById("description");
const categoryInput = document.getElementById("category");
const paymentMethodInput = document.getElementById("payment-method");
const amountInput = document.getElementById("amount");

const expenseList = document.getElementById("expense-list");
const totalExpense = document.getElementById("total-expense");

const dateError = document.getElementById("date-error");
const descriptionError = document.getElementById("description-error");
const categoryError = document.getElementById("category-error");
const paymentMethodError = document.getElementById("payment-method-error");
const amountError = document.getElementById("amount-error");

function saveExpenses() {
  localStorage.setItem(
    "expenses",
    JSON.stringify(expenses) //in JSON we save as string so converting data to string here for saving
  );
}

function calculateTotal(){
    return expenses.reduce((sum, expense)=> sum + expense.amount,0);
  }

function showError(inputElement, errorElement, message) {
  inputElement.classList.add("input-error");
  errorElement.textContent = message;
}

function clearError(inputElement, errorElement) {
  inputElement.classList.remove("input-error");
  errorElement.textContent = "";
}

function clearErrors() {
  clearError(expenseDateInput, dateError);
  clearError(descriptionInput, descriptionError);
  clearError(categoryInput, categoryError);
  clearError(paymentMethodInput, paymentMethodError);
  clearError(amountInput, amountError);
}

function validateExpense() {
  clearErrors();

  if (expenseDateInput.value === "") {
    showError(
      expenseDateInput,
      dateError,
      "Date is required."
    );

    return false;
  }

  if (descriptionInput.value.trim() === "") {
    showError(
      descriptionInput,
      descriptionError,
      "Description is required."
    );

    return false;
  }

  if (categoryInput.value === "") {
    showError(
      categoryInput,
      categoryError,
      "Category is required."
    );

    return false;
  }

  if (paymentMethodInput.value === "") {
    showError(
      paymentMethodInput,
      paymentMethodError,
      "Payment method is required."
    );

    return false;
  }

  if (amountInput.value === "") {
    showError(
      amountInput,
      amountError,
      "Amount is required."
    );

    return false;
  }

  const amount = Number(amountInput.value);

  if (Number.isNaN(amount)) {
    showError(
      amountInput,
      amountError,
      "Amount must be a valid number."
    );

    return false;
  }

  if (amount <= 0) {
    showError(
      amountInput,
      amountError,
      "Amount must be greater than 0."
    );

    return false;
  }

  return true;
}

function createExpenseDeleteButton(index) {
  const deleteButton = document.createElement("button");

  deleteButton.type = "button";
  deleteButton.classList.add("expense-delete-button");
  deleteButton.setAttribute("aria-label", "Delete expense");
  deleteButton.setAttribute("title", "Delete expense");
  deleteButton.innerHTML = `
    <svg class="expense-delete-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z"></path>
      <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"></path>
    </svg>
  `;

  deleteButton.addEventListener("click", function () {
    expenses.splice(index, 1); // where we delete the index
    saveExpenses();
    renderExpenses(); // in react it automatically renders , for now we manually render each time state changes
  });

  return deleteButton;
}

function createExpenseEditButton(expense, index) {
  const editButton = document.createElement("button");

  editButton.type = "button";
  editButton.classList.add("expense-edit-button");
  editButton.setAttribute("aria-label", "Edit expense");
  editButton.setAttribute("title", "Edit expense");
  editButton.innerHTML = `
    <svg class="expense-edit-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25Z"></path>
      <path d="M19.71 7.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.05 1.05 2.75 2.75 1.05-1.05Z"></path>
    </svg>
  `;

  editButton.addEventListener("click", function () {
    expenseDateInput.value = expense.date;
    descriptionInput.value = expense.description;
    categoryInput.value = expense.category;
    paymentMethodInput.value = expense.paymentMethod;
    amountInput.value = expense.amount;

    editingIndex = index; // using this index we can access existing entry for edit

    clearErrors();
  });

  return editButton;
}

//function to render the entered expense in html.
function renderExpenses() {
  expenseList.innerHTML = "";

  expenses.forEach(function (expense, index) { // for each to introduce index in expense array
    const listItem = document.createElement("li");
    const editButton = createExpenseEditButton(expense, index);
    const deleteButton = createExpenseDeleteButton(index);

    listItem.textContent =
      `${expense.date} | ${expense.description} | ${expense.category} | ${expense.paymentMethod} | ₹${expense.amount} `;

    listItem.appendChild(editButton);
    listItem.appendChild(deleteButton);
    expenseList.appendChild(listItem);
  });

  totalExpense.textContent = calculateTotal();
}

manualExpenseForm.addEventListener("submit", function (event) {
  event.preventDefault(); // to make website to not refresh
    if (!validateExpense()) {
      return;
    }

  const expense = {
    date: expenseDateInput.value,
    description: descriptionInput.value,
    category: categoryInput.value,
    paymentMethod: paymentMethodInput.value,
    amount: Number(amountInput.value)
  };

  if (editingIndex === null) {
    expenses.push(expense);
  } else {
    expenses[editingIndex] = expense;
    editingIndex = null; // reset after edit is done
  }

  saveExpenses();
  renderExpenses();
  manualExpenseForm.reset();

  clearErrors();
});

renderExpenses(); 

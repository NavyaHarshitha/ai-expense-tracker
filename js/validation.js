/*
Responsibility:
Show validation errors
Clear errors
Validate the form
*/

export function showError(
  inputElement,
  errorElement,
  message
) {
  inputElement.classList.add("input-error");
  errorElement.textContent = message;
}

export function clearError(inputElement, errorElement) {
  inputElement.classList.remove("input-error");
  errorElement.textContent = "";
}

export function clearErrors(fields) {
  const fieldsList = Array.isArray(fields)
    ? fields
    : Object.values(fields);

  fieldsList.forEach(function (field) {
    clearError(field.input, field.error);
  });
}

export function validateExpense(fields) {
  clearErrors(fields);

  const {
    date,
    description,
    category,
    paymentMethod,
    amount
  } = fields;

  let isValid = true;

  if (date.input.value === "") {
    showError(
      date.input,
      date.error,
      "Date is required."
    );

    isValid = false;
  }

  if (description.input.value.trim() === "") {
    showError(
      description.input,
      description.error,
      "Description is required."
    );

    isValid = false;
  }

  if (category.input.value === "") {
    showError(
      category.input,
      category.error,
      "Category is required."
    );

    isValid = false;
  }

  if (paymentMethod.input.value === "") {
    showError(
      paymentMethod.input,
      paymentMethod.error,
      "Payment method is required."
    );

    isValid = false;
  }

  if (amount.input.value === "") {
    showError(
      amount.input,
      amount.error,
      "Amount is required."
    );

    isValid = false;
  } else {
    const amountValue = Number(amount.input.value);

    if (Number.isNaN(amountValue)) {
      showError(
        amount.input,
        amount.error,
        "Amount must be a valid number."
      );

      isValid = false;
    } else if (amountValue <= 0) {
      showError(
        amount.input,
        amount.error,
        "Amount must be greater than 0."
      );

      isValid = false;
    }
  }

  return isValid;
}
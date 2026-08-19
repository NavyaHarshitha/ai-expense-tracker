/*
Responsibility:
Store application data
Store editing state
*/

import { loadExpenses } from "./storage.js";

export const expenses = loadExpenses();

export let editingIndex = null;

export function setEditingIndex(index) {
  editingIndex = index;
}

export function clearEditingIndex() {
  editingIndex = null;
}
// Expense Manager Module
// Handles expense tracking and budget calculations for timeline items

/**
 * Render the expense list for a timeline item
 * @param {Object} item - Timeline item containing expenses
 * @param {Object} state - Application state with travelData and viewing indices
 */
export function renderExpenseList(item, state = {}) {
    const listEl = document.getElementById('detail-expense-list');
    const totalEl = document.getElementById('detail-total-budget');

    if (!item.expenses) item.expenses = [];

    let html = '';
    let total = 0;

    item.expenses.forEach((exp, idx) => {
        // Support both formats (migration period)
        const description = exp.description || exp.desc || '내역 없음';
        const amount = exp.amount || exp.cost || 0;

        total += Number(amount);
        html += `
        <div class="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-lg group">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-700 dark:text-gray-300">${description}</span>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-sm font-bold text-text-main dark:text-white">₩${Number(amount).toLocaleString()}</span>
                <button type="button" onclick="deleteExpense(${idx})" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><span class="material-symbols-outlined text-sm">delete</span></button>
            </div>
        </div>`;
    });

    if (item.expenses.length === 0) {
        html = '<p class="text-xs text-gray-400 text-center py-2">지출 내역이 없습니다.</p>';
    }

    listEl.innerHTML = html;

    // Update total budget (sum of expenses)
    totalEl.value = total;
    item.budget = total;
}

/**
 * Calculate total budget across all timeline items
 * @param {Object} travelData - Travel data containing all days and timeline items
 * @returns {number} Total budget amount
 */
export function updateTotalBudget(travelData) {
    let total = 0;
    if (travelData.days) {
        travelData.days.forEach(day => {
            if (day.timeline) {
                day.timeline.forEach(item => {
                    // Legacy budget field
                    if (item.budget) {
                        total += Number(item.budget);
                    }
                    // Sum expenses array
                    if (item.expenses && Array.isArray(item.expenses)) {
                        item.expenses.forEach(exp => {
                            total += Number(exp.amount || 0);
                        });
                    }
                });
            }
        });
    }
    travelData.meta.budget = `₩${total.toLocaleString()}`;
    return total;
}

/**
 * Delete a specific expense from an item
 * @param {number} expIndex - Index of expense to delete
 * @param {Object} item - Timeline item containing the expense
 * @param {Object} travelData - Travel data for budget recalculation
 * @param {Function} onUpdate - Callback after deletion
 */
export function deleteExpense(expIndex, item, travelData, onUpdate) {
    item.expenses.splice(expIndex, 1);

    // Recalculate total
    let total = 0;
    item.expenses.forEach(exp => {
        total += Number(exp.amount || 0);
    });
    item.budget = total;

    // Update total budget
    updateTotalBudget(travelData);

    // Update budget display
    const budgetEl = document.getElementById('budget-amount');
    if (budgetEl) {
        budgetEl.textContent = travelData.meta.budget || '₩0';
    }

    // Callback for further updates (e.g., re-render, autosave)
    if (onUpdate) {
        onUpdate();
    }
}

/**
 * Add a new expense to an item
 * @param {Object} item - Timeline item to add expense to
 * @param {string} description - Expense description
 * @param {number} amount - Expense amount
 */
export function addExpense(item, description, amount) {
    if (!item.expenses) item.expenses = [];

    item.expenses.push({
        description: description,
        amount: Number(amount)
    });

    // Update item budget
    item.budget = item.expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
}

/**
 * Get total expenses for a specific day
 * @param {Object} day - Day object containing timeline
 * @returns {number} Total expenses for the day
 */
export function getDayExpenses(day) {
    if (!day || !day.timeline) return 0;

    let total = 0;
    day.timeline.forEach(item => {
        if (item.budget) {
            total += Number(item.budget);
        }
        if (item.expenses && Array.isArray(item.expenses)) {
            item.expenses.forEach(exp => {
                total += Number(exp.amount || 0);
            });
        }
    });

    return total;
}

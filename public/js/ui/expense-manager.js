import { travelData, viewingItemIndex, targetDayIndex } from '../state.js';
import { escapeHtml } from '../ui-utils.js';
import {
    calculateTravelBudgetTotal,
    ensureExpenseList,
    getDayExpensesTotal,
    getExpenseAmount,
    getExpenseDescription,
    syncItemExpenseBudget
} from '../features/expenses/expense-helpers.js';

// Expense Manager Module
// Handles expense tracking, budget calculations (Logic Only)

/**
 * Render the expense list for a timeline item
 */
export function renderExpenseList(item, state = {}) {
    const listEl = document.getElementById('detail-expense-list');
    const totalEl = document.getElementById('detail-total-budget');
    if (!listEl || !totalEl) return;

    const expenses = ensureExpenseList(item);

    let html = '';
    let total = 0;

    expenses.forEach((exp, idx) => {
        const description = getExpenseDescription(exp);
        const amount = getExpenseAmount(exp);

        total += Number(amount);
        html += `
        <div class="timeline-detail-expense-row group">
            <div class="timeline-detail-expense-copy">
                <span class="timeline-detail-expense-title">${escapeHtml(description)}</span>
            </div>
            <div class="timeline-detail-expense-trailing">
                <span class="timeline-detail-expense-amount">₩${Number(amount).toLocaleString()}</span>
                <button type="button" onclick="window.deleteExpenseItem(${idx})" class="timeline-detail-expense-delete"><span class="material-symbols-outlined text-sm">delete</span></button>
            </div>
        </div>`;
    });

    if (expenses.length === 0) {
        html = '<p class="timeline-detail-empty-text">지출 내역이 없습니다.</p>';
    }

    listEl.innerHTML = html;
    totalEl.value = total.toLocaleString();
    item.budget = total;
}

/**
 * Calculate total budget across all timeline items and update meta
 */
export function updateTotalBudget(travelData) {
    const total = calculateTravelBudgetTotal(travelData);

    // Update display
    const budgetEl = document.getElementById('budget-amount');
    if (budgetEl) {
        budgetEl.textContent = travelData.meta.budget || '₩0';
        // Remove click handler related to Budget Manager Modal
        budgetEl.onclick = null; // Reset
        // 원래의 동작을 위해 onclick을 제거하거나, openExpenseDetailModal() 호출이 index.html에 있다면 그대로 둠.
        // 하지만 index.html에는 div 전체에 onclick="openExpenseDetailModal()"이 걸려있음.
        // 따라서 span 내부의 onclick을 제거해야 이벤트 버블링으로 원래 모달이 뜸.
        budgetEl.classList.remove('cursor-pointer');
        budgetEl.title = "";
    }

    return total;
}

export function deleteExpense(expIndex, item, travelData, onUpdate) {
    item.expenses.splice(expIndex, 1);
    syncItemExpenseBudget(item);

    updateTotalBudget(travelData);
    if (onUpdate) onUpdate();
}

export function addExpense(item, description, amount) {
    const expenses = ensureExpenseList(item);
    const newExpense = { description: description, amount: Number(amount) };
    // [Added] Check if adding from 'General' context (Expense Detail View)
    if (window.isAddingFromDetail) {
        newExpense.isGeneral = true;
    }
    expenses.push(newExpense);
    syncItemExpenseBudget(item);
}

export function getDayExpenses(day) {
    return getDayExpensesTotal(day);
}

// Window Bindings

window.deleteExpenseItem = function (idx) {
    const tDayIdx = (typeof window.targetDayIndex === 'number') ? window.targetDayIndex : targetDayIndex;
    const vItemIdx = (typeof window.viewingItemIndex === 'number') ? window.viewingItemIndex : viewingItemIndex;
    if (tDayIdx === null || vItemIdx === null) return;
    const item = travelData.days[tDayIdx]?.timeline[vItemIdx];
    if (item) {
        deleteExpense(idx, item, travelData, () => {
            renderExpenseList(item);
            if (window.renderItinerary) window.renderItinerary();
            if (window.autoSave) window.autoSave();
            if (typeof window.refreshExpenseDetail === 'function') window.refreshExpenseDetail();
        });
    }
};

export default {
    renderExpenseList,
    updateTotalBudget,
    deleteExpense,
    addExpense,
    getDayExpenses
};

import { travelData, viewingItemIndex, targetDayIndex } from '../state.js';

// Expense Manager Module
// Handles expense tracking, budget calculations (Logic Only)

/**
 * Render the expense list for a timeline item
 */
export function renderExpenseList(item, state = {}) {
    const listEl = document.getElementById('detail-expense-list');
    const totalEl = document.getElementById('detail-total-budget');
    if (!listEl || !totalEl) return;

    if (!item.expenses) item.expenses = [];

    let html = '';
    let total = 0;

    item.expenses.forEach((exp, idx) => {
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
                <button type="button" onclick="window.deleteExpenseItem(${idx})" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><span class="material-symbols-outlined text-sm">delete</span></button>
            </div>
        </div>`;
    });

    if (item.expenses.length === 0) {
        html = '<p class="text-xs text-gray-400 text-center py-2">지출 내역이 없습니다.</p>';
    }

    listEl.innerHTML = html;
    totalEl.value = total;
    item.budget = total;
}

/**
 * Calculate total budget across all timeline items and update meta
 */
export function updateTotalBudget(travelData) {
    let total = 0;
    if (travelData.days) {
        travelData.days.forEach(day => {
            if (day.timeline) {
                day.timeline.forEach(item => {
                    // [Fix] Avoid double counting & Force Recalculation
                    if (item.expenses && Array.isArray(item.expenses) && item.expenses.length > 0) {
                        const sum = item.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
                        item.budget = sum;
                        total += sum;
                    } else if (item.budget) {
                        total += Number(item.budget);
                    }
                });
            }
        });
    }
    travelData.meta.budget = `₩${total.toLocaleString()}`;

    // Update display
    const budgetEl = document.getElementById('budget-amount');
    if (budgetEl) {
        budgetEl.textContent = travelData.meta.budget || '₩0';
        // Remove click handler related to Budget Manager Modal
        budgetEl.onclick = null; // Reset
        // 원래의 동작을 위해 onclick을 제거하거나, openExpenseDetailModal() 호출이 index.html에 있다면 그대로 둠.
        // 하지만 index.html에는 div 전체에 onclick="openExpenseDetailModal()"이 걸려있음.
        // 따라서 span 내부의 onclick을 제거해야 이벤트 버블링으로 원래 모달이 뜸.
        budgetEl.style.cursor = '';
        budgetEl.title = "";
    }

    return total;
}

export function deleteExpense(expIndex, item, travelData, onUpdate) {
    item.expenses.splice(expIndex, 1);

    // Recalculate
    let total = 0;
    item.expenses.forEach(exp => { total += Number(exp.amount || 0); });
    item.budget = total;

    updateTotalBudget(travelData);
    if (onUpdate) onUpdate();
}

export function addExpense(item, description, amount) {
    if (!item.expenses) item.expenses = [];
    const newExpense = { description: description, amount: Number(amount) };
    // [Added] Check if adding from 'General' context (Expense Detail View)
    if (window.isAddingFromDetail) {
        newExpense.isGeneral = true;
    }
    item.expenses.push(newExpense);
    item.budget = item.expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
}

export function getDayExpenses(day) {
    if (!day || !day.timeline) return 0;
    let total = 0;
    day.timeline.forEach(item => {
        if (item.expenses && Array.isArray(item.expenses) && item.expenses.length > 0) {
            item.expenses.forEach(exp => { total += Number(exp.amount || 0); });
        } else if (item.budget) {
            total += Number(item.budget);
        }
    });
    return total;
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

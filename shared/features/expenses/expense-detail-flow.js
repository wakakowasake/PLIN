import {
    calculateExpenseTotal,
    getExpenseAmount,
    getExpenseDescription,
    getExpenseDisplayTitle
} from './expense-helpers.js';

export function buildExpenseDetailState(travelData) {
    let totalExpense = 0;
    const expensesByDay = [];

    (travelData.days || []).forEach((day, dayIdx) => {
        let dayTotal = 0;
        const dayExpenses = [];
        const timeline = day.timeline || [];

        timeline.forEach((item, itemIdx) => {
            if (item.budget && (!item.expenses || item.expenses.length === 0)) {
                const amount = Number(item.budget);
                dayTotal += amount;
                dayExpenses.push({
                    title: item.title,
                    description: '예산',
                    amount,
                    dayIdx,
                    itemIdx,
                    isBudget: true
                });
            }

            (item.expenses || []).forEach((expense, expIdx) => {
                const amount = getExpenseAmount(expense);
                if (amount <= 0) {
                    return;
                }

                dayTotal += amount;
                dayExpenses.push({
                    title: getExpenseDisplayTitle(item, timeline, itemIdx, expense),
                    description: getExpenseDescription(expense),
                    amount,
                    dayIdx,
                    itemIdx,
                    expIdx
                });
            });
        });

        expensesByDay.push({
            date: day.date,
            total: dayTotal,
            expenses: dayExpenses,
            dayIdx
        });

        totalExpense += dayTotal;
    });

    return { totalExpense, expensesByDay };
}

export function deleteExpenseFromTravelData(travelData, dayIdx, itemIdx, expIdx) {
    if (dayIdx < 0 || !travelData.days || dayIdx >= travelData.days.length) {
        return null;
    }

    const day = travelData.days[dayIdx];
    if (itemIdx < 0 || !day.timeline || itemIdx >= day.timeline.length) {
        return null;
    }

    const item = day.timeline[itemIdx];
    if (!Array.isArray(item.expenses) || expIdx < 0 || expIdx >= item.expenses.length) {
        return null;
    }

    item.expenses.splice(expIdx, 1);
    item.budget = calculateExpenseTotal(item.expenses);

    return item;
}

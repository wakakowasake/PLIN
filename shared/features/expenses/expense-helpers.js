export function ensureExpenseList(item) {
    if (!Array.isArray(item.expenses)) {
        item.expenses = [];
    }
    return item.expenses;
}

export function getExpenseDescription(expense) {
    return expense?.description || expense?.desc || '내역 없음';
}

export function getExpenseAmount(expense) {
    return Number(expense?.amount ?? expense?.cost ?? 0);
}

export function calculateExpenseTotal(expenses = []) {
    return expenses.reduce((sum, expense) => sum + getExpenseAmount(expense), 0);
}

export function syncItemExpenseBudget(item) {
    const total = calculateExpenseTotal(ensureExpenseList(item));
    item.budget = total;
    return total;
}

export function calculateTravelBudgetTotal(travelData) {
    let total = 0;

    (travelData.days || []).forEach((day) => {
        (day.timeline || []).forEach((item) => {
            if (Array.isArray(item.expenses) && item.expenses.length > 0) {
                total += syncItemExpenseBudget(item);
            } else if (item.budget) {
                total += Number(item.budget);
            }
        });
    });

    if (travelData.meta) {
        travelData.meta.budget = `₩${total.toLocaleString()}`;
    }

    return total;
}

export function getDayExpensesTotal(day) {
    let total = 0;

    (day?.timeline || []).forEach((item) => {
        if (Array.isArray(item.expenses) && item.expenses.length > 0) {
            total += calculateExpenseTotal(item.expenses);
        } else if (item.budget) {
            total += Number(item.budget);
        }
    });

    return total;
}

export function getExpenseDisplayTitle(item, timeline, itemIndex, expense) {
    if (expense?.isGeneral) {
        return '';
    }

    if (item?.isTransit) {
        const prevItem = itemIndex > 0 ? timeline[itemIndex - 1] : null;
        const nextItem = itemIndex < timeline.length - 1 ? timeline[itemIndex + 1] : null;
        const from = prevItem && !prevItem.isTransit ? prevItem.title : '출발지';
        const to = nextItem && !nextItem.isTransit ? nextItem.title : '도착지';
        return `${item.title} (${from}→${to})`;
    }

    return item?.title || '';
}

export function calculateSplitAmount(total, peopleCount) {
    const parsedCount = Number(peopleCount);
    if (!parsedCount || parsedCount < 1) {
        return null;
    }

    return Math.ceil(Number(total || 0) / parsedCount);
}

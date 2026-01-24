import { travelData } from '../state.js';
import { escapeHtml } from '../ui-utils.js';
import ExpenseManager from './expense-manager.js';

/**
 * Ensure the expense detail modal exists in the DOM
 */
export function ensureExpenseDetailModal() {
    if (!document.getElementById('expense-detail-modal')) {
        const modal = document.createElement('div');
        modal.id = 'expense-detail-modal';
        modal.className = 'hidden fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm';

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeExpenseDetailModal();
        });

        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh] modal-slide-in" onclick="event.stopPropagation()">
                <div class="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gradient-to-r from-green-50 to-emerald-50 dark:from-gray-800 dark:to-gray-800">
                    <h3 class="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-green-600">payments</span>
                        지출 상세
                    </h3>
                    <button onclick="window.closeExpenseDetailModal()" aria-label="지출 상세 닫기"
                        class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div class="p-4 overflow-y-auto custom-scrollbar flex-1">
                     <div class="bg-card-light dark:bg-card-dark rounded-xl p-6 mb-6 text-center border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden group">
                        <div class="absolute inset-0 bg-gradient-to-br from-green-50/50 to-emerald-50/50 dark:from-green-900/10 dark:to-emerald-900/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mb-1 relative z-10">총 예상 지출</p>
                        <h2 id="total-expense-amount" class="text-4xl font-black text-gray-800 dark:text-white tracking-tight relative z-10">₩0</h2>
                    </div>

                    <div id="expense-by-day-list" class="space-y-4 mb-6">
                        <!-- JS로 채워짐 -->
                    </div>

                    <div class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700/50">
                        <h4 class="text-md font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <span class="material-symbols-outlined">calculate</span>
                            N분의 1 정산
                        </h4>
                        <div class="flex gap-2 mb-4">
                            <div class="relative flex-1">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">인원</span>
                                <input type="number" id="split-people-count" value="1" min="1"
                                    class="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                            </div>
                            <button onclick="window.calculateSplit()" class="bg-primary hover:bg-primary-dark text-white px-6 rounded-xl font-bold transition-all shadow-md hover:shadow-lg active:scale-95 whitespace-nowrap">
                                계산하기
                            </button>
                        </div>
                        <div id="split-result" class="hidden bg-white dark:bg-gray-800 rounded-lg p-4 text-center border border-primary/20 shadow-sm animate-fade-in">
                            <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">1인당 부담금</p>
                            <p id="per-person-amount" class="text-2xl font-bold text-primary">₩0</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

export function openExpenseDetailModal() {
    ensureExpenseDetailModal();
    const modal = document.getElementById('expense-detail-modal');
    modal.classList.remove('hidden');
    renderExpenseDetailContent();
}

export function closeExpenseDetailModal() {
    const modal = document.getElementById('expense-detail-modal');
    if (modal) modal.classList.add('hidden');
}

function renderExpenseDetailContent() {
    // 전체 지출 계산 및 일자별 그룹화
    let totalExpense = 0;
    const expensesByDay = [];

    if (travelData.days) {
        travelData.days.forEach((day, dayIdx) => {
            let dayTotal = 0;
            const dayExpenses = [];

            if (day.timeline) {
                day.timeline.forEach((item, itemIdx) => {
                    // Item budget (Legacy or manually set)
                    if (item.budget && (!item.expenses || item.expenses.length === 0)) {
                        const amount = Number(item.budget);
                        dayTotal += amount;
                        dayExpenses.push({
                            title: item.title,
                            description: '예산',
                            amount: amount,
                            dayIdx: dayIdx,
                            itemIdx: itemIdx,
                            isBudget: true
                        });
                    }

                    // Expenses array
                    if (item.expenses && Array.isArray(item.expenses)) {
                        item.expenses.forEach((exp, expIdx) => {
                            const amount = Number(exp.amount || 0);
                            if (amount > 0) {
                                dayTotal += amount;

                                // 이동수단인 경우 출발지->도착지 붙이기
                                let displayTitle = item.title;
                                if (item.isTransit) {
                                    const prevItem = itemIdx > 0 ? day.timeline[itemIdx - 1] : null;
                                    const nextItem = itemIdx < day.timeline.length - 1 ? day.timeline[itemIdx + 1] : null;
                                    const from = prevItem && !prevItem.isTransit ? prevItem.title : '출발지';
                                    const to = nextItem && !nextItem.isTransit ? nextItem.title : '도착지';

                                    displayTitle = `${item.title} (${from}→${to})`;
                                }

                                // [Added] General Expense (Added from Detail View) -> Empty Title
                                if (exp.isGeneral) {
                                    displayTitle = '';
                                }

                                dayExpenses.push({
                                    title: displayTitle,
                                    description: exp.description,
                                    amount: amount,
                                    dayIdx: dayIdx,
                                    itemIdx: itemIdx,
                                    expIdx: expIdx
                                });
                            }
                        });
                    }
                });
            }

            // if (dayTotal > 0) {
            expensesByDay.push({
                date: day.date,
                total: dayTotal,
                expenses: dayExpenses,
                dayIdx: dayIdx
            });
            // }

            totalExpense += dayTotal;
        });
    }

    // 전체 금액 표시
    const totalAmountEl = document.getElementById('total-expense-amount');
    if (totalAmountEl) totalAmountEl.textContent = `₩${totalExpense.toLocaleString()}`;

    // 일자별 지출 표시
    const dayListEl = document.getElementById('expense-by-day-list');
    if (!dayListEl) return;

    if (expensesByDay.length === 0) {
        dayListEl.innerHTML = '<p class="text-center text-gray-400 py-8">지출 내역이 없습니다</p>';
    } else {
        dayListEl.innerHTML = expensesByDay.map((dayData, idx) => `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                <div class="flex justify-between items-center mb-3">
                    <div class="flex items-center gap-2">
                        <h5 class="font-bold text-gray-800 dark:text-white">${dayData.date}</h5>
                        <button onclick="window.addExpenseFromDetail(${dayData.dayIdx})" class="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded transition-colors font-bold flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">add</span> 추가
                        </button>
                    </div>
                    <p class="text-lg font-bold text-primary">₩${dayData.total.toLocaleString()}</p>
                </div>
                <div class="space-y-2">
                    ${dayData.expenses.map(exp => `
                        <div class="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-900 p-2 rounded-lg group">
                            <div class="flex-1 min-w-0">
                                <p class="font-bold text-gray-800 dark:text-white text-base truncate">${escapeHtml(exp.description)}</p>
                                ${exp.title ? `<p class="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1 mt-0.5"><span class="material-symbols-outlined text-[10px]">place</span> ${escapeHtml(exp.title)}</p>` : ''}
                            </div>
                            <div class="flex items-center gap-2">
                                <p class="font-bold text-gray-800 dark:text-white ml-2">₩${exp.amount.toLocaleString()}</p>
                                ${(!exp.isBudget && exp.dayIdx !== undefined) ? `
                                <button onclick="window.deleteExpenseFromDetail(${exp.dayIdx}, ${exp.itemIdx}, ${exp.expIdx})" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1" title="삭제">
                                    <span class="material-symbols-outlined text-sm">delete</span>
                                </button>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    // N분의 1 결과 숨기기
    const splitResult = document.getElementById('split-result');
    const splitInput = document.getElementById('split-people-count');
    if (splitResult && splitInput) {
        splitResult.classList.add('hidden');
        splitInput.value = '1';
    }
}

export function calculateSplit() {
    const peopleCount = Number(document.getElementById('split-people-count').value);
    if (!peopleCount || peopleCount < 1) {
        alert('인원 수를 입력해주세요.');
        return;
    }

    const totalText = document.getElementById('total-expense-amount').textContent;
    const total = Number(totalText.replace(/[^0-9]/g, ''));
    const perPerson = Math.ceil(total / peopleCount);

    document.getElementById('per-person-amount').textContent = `₩${perPerson.toLocaleString()}`;
    document.getElementById('split-result').classList.remove('hidden');
}

export function deleteExpenseFromDetail(dayIdx, itemIdx, expIdx) {
    // [User Request] Remove confirmation
    // if (!confirm('이 지출 내역을 삭제하시겠습니까?')) return;

    // dayIdx 검증
    if (dayIdx < 0 || !travelData.days || dayIdx >= travelData.days.length) return;
    const day = travelData.days[dayIdx];

    // itemIdx 검증
    if (itemIdx < 0 || !day.timeline || itemIdx >= day.timeline.length) return;
    const item = day.timeline[itemIdx];

    // expIdx 검증
    if (!item.expenses || expIdx < 0 || expIdx >= item.expenses.length) return;

    // 삭제
    item.expenses.splice(expIdx, 1);

    // 재계산 (budget 필드 업데이트)
    const sum = item.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    item.budget = sum;

    // 전체 예산 재계산
    ExpenseManager.updateTotalBudget(travelData);

    // 화면 갱신
    renderExpenseDetailContent();
    if (window.renderItinerary) window.renderItinerary();
    if (window.renderItinerary) window.renderItinerary();
    if (window.autoSave) window.autoSave();
}

// [Added] Refresh Detail View Helper
window.refreshExpenseDetail = function () {
    const modal = document.getElementById('expense-detail-modal');
    if (modal && !modal.classList.contains('hidden')) {
        renderExpenseDetailContent();
    }
};

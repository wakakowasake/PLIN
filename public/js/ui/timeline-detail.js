// Timeline Detail Modal Module
// Handles viewing and editing timeline item details including memos
import { Z_INDEX } from './constants.js';
import { setViewingItemIndex } from '../state.js';
import { unlockBodyScroll } from './modals.js';

/**
 * Close the detail modal
 * 📌 [Fix] Match modals.js: unlock scroll + reset state
 */
export function closeDetailModal() {
    const el = document.getElementById('item-detail-modal');
    if (el) el.classList.add('hidden');
    const frame = document.getElementById('detail-map-frame');
    if (frame) frame.src = '';
    setViewingItemIndex(null);
    unlockBodyScroll();
}

/**
 * Open memo modal for viewing/editing memo items
 * @param {Object} item - Memo item to display
 */
export function openMemoModal(item) {
    const modal = document.getElementById('memo-detail-modal');
    const content = document.getElementById('memo-detail-content');
    const bookmarksContainer = document.getElementById('memo-bookmarks');
    const bookmarksList = document.getElementById('memo-bookmarks-list');

    // Clear content (in case textarea remained from previous edit)
    content.innerHTML = "";

    // Parse links and render
    const { html, links } = processMemoContent(item.title);
    content.innerHTML = html;
    renderBookmarks(links, bookmarksContainer, bookmarksList);

    // Reset buttons (in case reopening after save)
    const btnContainer = modal.querySelector('.mt-6');
    if (btnContainer) {
        const btn = btnContainer.querySelector('button');
        if (btn) {
            btn.setAttribute('onclick', 'editCurrentMemo()');
            btn.innerHTML = `<span class="material-symbols-outlined text-sm">edit</span> 수정`;
            btn.className = "text-sm bg-primary/10 hover:bg-primary/20 text-primary px-4 py-2 rounded-2xl font-bold transition-colors flex items-center gap-1";
        }
    }

    modal.classList.remove('hidden');
}

/**
 * Close memo modal
 */
export function closeMemoModal() {
    document.getElementById('memo-detail-modal').classList.add('hidden');
}

/**
 * Switch memo modal to edit mode
 * @param {number} viewingItemIndex - Index of the item being viewed
 */
export function editCurrentMemo(viewingItemIndex, getContentElement) {
    if (viewingItemIndex === null) return;

    const contentEl = getContentElement();
    const currentText = contentEl.innerText;

    // Convert to textarea (inline editing)
    contentEl.innerHTML = `<textarea id="memo-edit-area" class="w-full h-60 bg-white/80 dark:bg-gray-800/80 border border-primary/30 rounded-2xl p-4 text-gray-800 dark:text-gray-200 resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none leading-relaxed font-body text-base placeholder-gray-400" placeholder="메모를 입력하세요">${currentText}</textarea>`;

    // Change button (edit -> save)
    const modal = document.getElementById('memo-detail-modal');
    const btnContainer = modal.querySelector('.mt-6');
    if (btnContainer) {
        const btn = btnContainer.querySelector('button');
        if (btn) {
            btn.setAttribute('onclick', 'saveCurrentMemo()');
            btn.innerHTML = `<span class="material-symbols-outlined text-sm">save</span> 저장`;
            btn.className = "text-sm bg-primary text-white hover:bg-orange-500 px-6 py-2 rounded-2xl font-bold transition-colors flex items-center gap-1 shadow-md";
        }
    }

    setTimeout(() => {
        const area = document.getElementById('memo-edit-area');
        if (area) area.focus();
    }, 50);
}

/**
 * Save memo changes
 * @param {number} viewingItemIndex - Index of the item being edited
 * @param {number} targetDayIndex - Index of the day
 * @param {Object} travelData - Travel data object
 * @param {Function} renderItinerary - Function to re-render itinerary
 * @param {Function} autoSave - Function to auto-save
 */
export function saveCurrentMemo(viewingItemIndex, targetDayIndex, travelData, renderItinerary, autoSave) {
    if (viewingItemIndex === null) return;

    const textarea = document.getElementById('memo-edit-area');
    if (!textarea) return;

    const newText = textarea.value;

    // Update data
    travelData.days[targetDayIndex].timeline[viewingItemIndex].title = newText;

    const { html, links } = processMemoContent(newText);

    // Restore UI (view mode)
    const contentEl = document.getElementById('memo-detail-content');
    contentEl.innerHTML = html;
    renderBookmarks(links, document.getElementById('memo-bookmarks'), document.getElementById('memo-bookmarks-list'));

    // Restore button (save -> edit)
    const modal = document.getElementById('memo-detail-modal');
    const btnContainer = modal.querySelector('.mt-6');
    if (btnContainer) {
        const btn = btnContainer.querySelector('button');
        if (btn) {
            btn.setAttribute('onclick', 'editCurrentMemo()');
            btn.innerHTML = `<span class="material-symbols-outlined text-sm">edit</span> 수정`;
            btn.className = "text-sm bg-primary/10 hover:bg-primary/20 text-primary px-4 py-2 rounded-2xl font-bold transition-colors flex items-center gap-1";
        }
    }
}

/**
 * Process memo content to detect and linkify URLs
 * @param {string} text - Raw memo text
 * @returns {{html: string, links: string[]}} Processed HTML and extracted links
 */
function processMemoContent(text) {
    if (!text) return { html: '', links: [] };

    // URL regex
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const links = [];

    // HTML escape (security)
    const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const html = safeText.replace(urlRegex, (url) => {
        links.push(url);
        return `<a href="${url}" target="_blank" class="text-primary hover:underline break-all" data-action="stop-propagation">${url}</a>`;
    });

    return { html, links };
}

/**
 * Render bookmark cards for extracted links
 * @param {string[]} links - Array of URLs
 * @param {HTMLElement} container - Container element
 * @param {HTMLElement} list - List element to populate
 */
function renderBookmarks(links, container, list) {
    if (!links || links.length === 0) {
        container.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    let html = '';
    // Remove duplicates
    const uniqueLinks = [...new Set(links)];

    uniqueLinks.forEach(link => {
        try {
            const urlObj = new URL(link);
            html += `
                <a href="${link}" target="_blank" class="flex items-center gap-3 p-4 bg-card-light dark:bg-card-dark border border-gray-100 dark:border-gray-700 rounded-2xl hover:bg-primary/10 transition-colors group">
                    <div class="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                        <span class="material-symbols-outlined">public</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-gray-800 dark:text-gray-200 truncate group-hover:text-primary transition-colors">${urlObj.hostname}</p>
                        <p class="text-xs text-gray-500 truncate opacity-70">${link}</p>
                    </div>
                    <span class="material-symbols-outlined text-gray-400 text-sm">open_in_new</span>
                </a>
            `;
        } catch (e) {
            // Invalid URL ignored
        }
    });

    list.innerHTML = html;
    container.classList.remove('hidden');
}

/**
 * Update item note field
 * @param {string} value - New note value
 * @param {number} viewingItemIndex - Index of item being viewed
 * @param {number} targetDayIndex - Day index
 * @param {Object} travelData - Travel data object
 * @param {Function} autoSave - Auto-save function
 */
export function updateItemNote(value, viewingItemIndex, targetDayIndex, travelData, autoSave) {
    if (viewingItemIndex === null) return;
    travelData.days[targetDayIndex].timeline[viewingItemIndex].note = value;
    autoSave();
}

/**
 * Enable note editing in detail modal
 */
export function enableNoteEdit() {
    const noteField = document.getElementById('detail-note');
    if (noteField) {
        noteField.readOnly = false;
        noteField.focus();
        noteField.classList.add('ring-2', 'ring-primary');
    }
}

// [Dynamic Modal Injection]
export function ensureItemDetailModal() {
    if (document.getElementById('item-detail-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'item-detail-modal';
    // 📌 [Fix] Z-Index consistency: Use Z_INDEX.MODAL_VIEW (150) from constants.js
    // React Component: Can use inline styles or CSS modules
    modal.className = 'hidden fixed inset-0 flex items-end justify-center bg-black/30 p-0 md:p-4';
    modal.style.zIndex = Z_INDEX.MODAL_VIEW;
    modal.innerHTML = `
        <div class="timeline-detail-sheet modal-surface-card w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col modal-slide-in">
            <div class="timeline-detail-handle-wrap">
                <div class="timeline-detail-handle"></div>
            </div>
            <div class="timeline-detail-header shrink-0">
                <button type="button" data-action="close-detail" class="timeline-detail-back-button" title="목록으로">
                    <span class="material-symbols-outlined">arrow_back</span>
                </button>
                <div class="timeline-detail-header-copy">
                    <h2 id="detail-header-title" class="timeline-detail-header-title">일정 상세</h2>
                </div>
                <div id="detail-action-buttons" class="timeline-detail-actions">
                    <button type="button" data-action="delete-current-item" class="timeline-detail-delete-button hidden" title="삭제">삭제</button>
                    <button type="button" data-action="edit-current-item" class="timeline-detail-edit-button hidden" title="수정">수정</button>
                </div>
            </div>

            <div id="detail-content" class="timeline-detail-content flex-1 overflow-y-auto">
                <div class="timeline-detail-body">
                    <div class="timeline-detail-summary-card">
                        <h3 id="detail-title" class="timeline-detail-summary-title">제목</h3>
                        <div class="timeline-detail-meta-row">
                            <span id="detail-tag" class="timeline-detail-stat-pill">태그</span>
                            <span id="detail-day-meta" class="timeline-detail-stat-pill">일정 정보</span>
                            <span id="detail-time" class="timeline-detail-stat-pill">시간</span>
                            <span id="detail-expense-pill" class="timeline-detail-stat-pill hidden">지출</span>
                        </div>
                    </div>

                    <div id="detail-map-section" class="timeline-detail-section timeline-detail-map-section hidden">
                        <h4 class="timeline-detail-section-label">위치</h4>
                        <p id="detail-location-text" class="timeline-detail-section-body">위치</p>
                        <button type="button" data-action="find-directions" class="timeline-detail-primary-action">
                            경로 보기
                        </button>
                        <div class="timeline-detail-map-frame-wrap">
                            <iframe id="detail-map-frame" class="w-full h-full border-0 absolute inset-0" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
                        </div>
                    </div>

                    <div class="timeline-detail-section" ondblclick="enablePlaceNoteEdit()">
                        <h4 class="timeline-detail-section-label">메모 / 설명</h4>
                        <textarea id="detail-note" class="timeline-detail-note" rows="4" placeholder="등록된 메모가 아직 없어요." onchange="updateItemNote(this.value)" readonly></textarea>
                    </div>

                    <div id="detail-memories-section" class="timeline-detail-section hidden">
                        <h4 class="timeline-detail-section-label">추억</h4>
                        <div id="detail-memories-list" class="timeline-detail-memory-list"></div>
                    </div>

                    <div id="detail-expense-section" class="timeline-detail-section">
                        <div class="timeline-detail-section-header">
                            <div>
                                <h4 class="timeline-detail-section-label">지출 내역</h4>
                                <p id="detail-expense-support" class="timeline-detail-section-support">지출 내역이 없습니다.</p>
                            </div>
                            <button type="button" id="detail-add-expense-btn" class="timeline-detail-secondary-action">추가</button>
                        </div>
                        <div id="detail-expense-list" class="timeline-detail-expense-list"></div>
                        <div class="timeline-detail-total-row">
                            <span>총 지출</span>
                            <input id="detail-total-budget" type="text" class="timeline-detail-total-input" readonly>
                        </div>
                    </div>

                    <div id="detail-attachment-section" class="timeline-detail-section">
                        <div class="timeline-detail-section-header">
                            <h4 class="timeline-detail-section-label">첨부 파일</h4>
                            <button type="button" id="detail-add-attachment-btn" onclick="document.getElementById('attachment-upload-item').click()" class="timeline-detail-muted-action">추가</button>
                            <input type="file" id="attachment-upload-item" class="hidden" accept="image/*,application/pdf" onchange="handleAttachmentUpload(this, 'item')">
                        </div>
                        <div id="detail-attachment-list" class="timeline-detail-attachment-list"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// [Dynamic Modal Injection for Memo]
export function ensureMemoDetailModal() {
    if (document.getElementById('memo-detail-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'memo-detail-modal';
    // 📌 [Fix] Z-Index consistency: Use Z_INDEX.MODAL_VIEW (150) - same level as item-detail-modal
    // React Component: Can use CSS modules or inline styles
    modal.className = `hidden fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`;
    modal.style.zIndex = Z_INDEX.MODAL_VIEW;
    modal.innerHTML = `
        <div class="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-md h-[400px] flex flex-col overflow-hidden modal-slide-in">
            <div class="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-card-light dark:bg-gray-800/50">
                <h3 class="text-lg font-bold text-text-main dark:text-white flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary">sticky_note_2</span>
                    메모 상세
                </h3>
                <button type="button" data-action="close-memo" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            
            <div id="memo-detail-content" class="flex-1 p-6 overflow-y-auto whitespace-pre-wrap text-gray-700 dark:text-gray-300 leading-relaxed font-body text-lg">
                <!-- Content injected here -->
            </div>

            <div id="memo-bookmarks" class="hidden px-6 pt-0 pb-2">
                <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">링크 미리보기</h4>
                <div id="memo-bookmarks-list" class="flex flex-col gap-2"></div>
            </div>

            <div class="p-5 border-t border-gray-100 dark:border-gray-700 mt-auto bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-2">
                 <button type="button" data-action="delete-memo" class="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors" title="삭제">
                    <span class="material-symbols-outlined">delete</span>
                </button>
                <div class="flex-1"></div>
                <button type="button" data-action="close-memo" class="px-4 py-2 text-gray-500 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors">닫기</button>
                <button type="button" data-action="edit-memo" class="text-sm bg-primary/10 hover:bg-primary/20 text-primary px-4 py-2 rounded-2xl font-bold transition-colors flex items-center gap-1">
                    <span class="material-symbols-outlined text-sm">edit</span> 수정
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

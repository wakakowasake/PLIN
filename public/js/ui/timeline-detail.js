// Timeline Detail Modal Module
// Handles viewing and editing timeline item details including memos

/**
 * Close the detail modal
 */
export function closeDetailModal() {
    document.getElementById('item-detail-modal').classList.add('hidden');
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
            btn.className = "text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1";
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
    contentEl.innerHTML = `<textarea id="memo-edit-area" class="w-full h-60 bg-white/50 dark:bg-black/20 border-2 border-yellow-300 dark:border-yellow-600/50 rounded-lg p-3 text-gray-800 dark:text-gray-200 resize-none focus:ring-0 outline-none leading-relaxed font-body text-lg placeholder-gray-400" placeholder="메모를 입력하세요">${currentText}</textarea>`;

    // Change button (edit -> save)
    const modal = document.getElementById('memo-detail-modal');
    const btnContainer = modal.querySelector('.mt-6');
    const btn = btnContainer.querySelector('button');

    btn.setAttribute('onclick', 'saveCurrentMemo()');
    btn.innerHTML = `<span class="material-symbols-outlined text-sm">save</span> 저장`;
    btn.className = "text-sm bg-primary text-white hover:bg-orange-500 px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-1 shadow-md";

    setTimeout(() => document.getElementById('memo-edit-area').focus(), 50);
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
    const btn = btnContainer.querySelector('button');

    btn.setAttribute('onclick', 'editCurrentMemo()');
    btn.innerHTML = `<span class="material-symbols-outlined text-sm">edit</span> 수정`;
    btn.className = "text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1";

    renderItinerary();
    autoSave();
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
        return `<a href="${url}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline break-all" onclick="event.stopPropagation()">${url}</a>`;
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
                <a href="${link}" target="_blank" class="flex items-center gap-3 p-3 bg-white/50 dark:bg-black/20 border border-yellow-200 dark:border-yellow-700/30 rounded-xl hover:bg-yellow-100/50 dark:hover:bg-yellow-900/30 transition-colors group">
                    <div class="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center text-yellow-700 dark:text-yellow-500 flex-shrink-0">
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
    modal.className = 'hidden fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[85vh]">
            <!-- Sticky Header -->
            <div class="sticky top-0 bg-white dark:bg-card-dark z-20 border-b border-gray-100 dark:border-gray-700 p-6 pb-4 shrink-0">
                <div class="flex justify-between items-start">
                    <div class="flex-1 w-full min-w-0">
                        <div class="flex items-center gap-2 mb-2">
                            <span id="detail-tag" class="px-2 py-1 rounded text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">태그</span>
                            <span id="detail-time" class="text-sm text-gray-500 font-medium">시간</span>
                        </div>
                        <h2 id="detail-title" class="text-2xl font-bold text-text-main dark:text-white leading-tight mb-1 truncate">제목</h2>
                        <div class="flex flex-col gap-1 mt-1 w-full">
                            <button type="button" onclick="openGoogleMapsExternal()" class="text-sm text-primary flex items-center gap-1 hover:underline text-left w-fit max-w-full">
                                <span class="material-symbols-outlined text-sm shrink-0">location_on</span>
                                <span id="detail-location-text" class="truncate">위치</span>
                            </button>
                        </div>
                    </div>
                    <div id="detail-action-buttons" class="flex items-center gap-1 ml-3 shrink-0">
                        <button type="button" onclick="editCurrentItem()" class="text-primary hover:bg-primary/10 p-2 rounded-full transition-colors" title="수정">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button type="button" onclick="deleteCurrentItem()" class="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors" title="삭제">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                        <button type="button" onclick="closeDetailModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 rounded-full transition-colors">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>
                <!-- Find Way Button: Full Width Below Title -->
                <button type="button" onclick="findDirectionsToPlace()" class="w-full justify-center py-3 text-sm font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors bg-blue-50 dark:bg-blue-900/20 rounded-xl mt-4">
                    <span class="material-symbols-outlined text-lg">directions</span>
                    <span>내 위치에서 길찾기</span>
                </button>
            </div>

            <!-- Content Container -->
            <!-- Mobile: overflow-y-auto (scrolls whole content), Desktop: overflow-hidden (split panes) -->
            <div id="detail-content" class="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row-reverse">
                
                <!-- Right Column (Details) -->
                <!-- Mobile: h-auto (part of flow), Desktop: overflow-y-auto (independent scroll) -->
                <div class="flex-1 p-6 flex flex-col gap-6 w-full md:w-1/2 bg-white dark:bg-card-dark md:overflow-y-auto md:h-full shrink-0">
                    <!-- Memories Section -->
                    <div id="detail-memories-section" class="hidden">
                        <h4 class="text-xs font-bold text-gray-500 uppercase mb-3">추억</h4>
                        <div id="detail-memories-list" class="flex flex-col gap-3"></div>
                    </div>

                    <!-- Note Section -->
                    <div class="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700" ondblclick="enablePlaceNoteEdit()">
                        <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">메모 / 설명</h4>
                        <textarea id="detail-note" class="w-full bg-transparent border-none p-0 text-sm text-gray-700 dark:text-gray-300 resize-none focus:ring-0 leading-relaxed cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded transition-colors" rows="4" placeholder="메모를 입력하세요..." onchange="updateItemNote(this.value)" readonly></textarea>
                    </div>

                    <!-- Expenses Section -->
                    <div>
                        <div class="flex justify-between items-center mb-3">
                            <h4 class="text-xs font-bold text-gray-500 uppercase">지출 내역</h4>
                            <button type="button" id="detail-add-expense-btn" class="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1">
                                <span class="material-symbols-outlined text-sm">add</span> 추가
                            </button>
                        </div>
                        <div id="detail-expense-list" class="flex flex-col gap-2 mb-3 max-h-40 overflow-y-auto"></div>
                        <div class="flex justify-between items-center border-t border-gray-100 dark:border-gray-700 pt-3">
                            <span class="font-bold text-sm text-gray-600 dark:text-gray-400">총 지출</span>
                            <div class="relative w-40">
                                <span class="absolute left-3 top-2 text-gray-500 font-bold">₩</span>
                                <input id="detail-total-budget" type="number" class="w-full pl-8 pr-2 py-1.5 bg-gray-50 dark:bg-gray-900 border-none rounded-lg text-right font-bold text-xl text-primary outline-none cursor-default" readonly>
                            </div>
                        </div>
                    </div>

                    <!-- Attachments Section -->
                    <div class="border-t border-gray-100 dark:border-gray-700 pt-4">
                        <div class="flex justify-between items-center mb-3">
                            <h4 class="text-xs font-bold text-gray-500 uppercase">첨부 파일 (티켓/PDF)</h4>
                            <button type="button" onclick="document.getElementById('attachment-upload-item').click()" class="text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1">
                                <span class="material-symbols-outlined text-sm">upload_file</span> 추가
                            </button>
                            <input type="file" id="attachment-upload-item" class="hidden" accept="image/*,application/pdf" onchange="handleAttachmentUpload(this, 'item')">
                        </div>
                        <div id="detail-attachment-list" class="grid grid-cols-2 md:grid-cols-3 gap-3"></div>
                    </div>
                </div>

                <!-- Left Column (Map) -->
                <!-- Mobile: h-64 shrink-0 (part of scroll), Desktop: h-full (side pane) -->
                <div id="detail-map-section" class="hidden w-full md:w-1/2 h-64 md:h-auto bg-gray-100 dark:bg-gray-800 relative border-t md:border-t-0 md:border-r border-gray-200 dark:border-gray-700 shrink-0">
                    <div class="absolute bottom-4 left-4 right-4 z-10">
                        <button type="button" onclick="openGoogleMapsExternal()" class="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/90 backdrop-blur border border-gray-200/50 text-gray-700 rounded-xl shadow-sm font-bold text-sm hover:bg-white transition-colors">
                            <span class="material-symbols-outlined text-lg">map</span> 구글맵 앱에서 보기
                        </button>
                    </div>
                    <iframe id="detail-map-frame" class="w-full h-full border-0 absolute inset-0" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

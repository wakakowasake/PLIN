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

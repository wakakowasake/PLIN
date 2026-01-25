/**
 * List Manager Module
 * Handles modals and logic for Shopping List and Checklist
 */

import { travelData, isReadOnlyMode } from '../state.js';
import { Z_INDEX } from './constants.js';

/**
 * Ensure the list management modal exists in the DOM
 */
export function ensureListModal() {
    let modal = document.getElementById('list-manager-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'list-manager-modal';
        modal.className = 'hidden fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm';

        modal.onclick = (e) => {
            if (e.target === modal) closeListModal();
        };

        modal.innerHTML = `
        <div class="bg-white dark:bg-card-dark rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden modal-slide-in" onclick="event.stopPropagation()">
            <div class="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                <h3 class="text-xl font-bold text-text-main dark:text-white flex items-center gap-2">
                    <span id="list-modal-icon" class="material-symbols-outlined text-primary">shopping_bag</span>
                    <span id="list-modal-title">리스트 관리</span>
                </h3>
                <button type="button" onclick="window.closeListModal()"
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            
            <div class="p-6 bg-gray-50 dark:bg-black/10">
                <div class="flex gap-2 mb-3">
                    <input type="text" id="list-item-input" 
                        class="flex-1 min-w-0 px-4 py-3 rounded-xl border-2 border-transparent bg-white dark:bg-card-dark text-text-main dark:text-white focus:border-primary outline-none transition-all shadow-sm"
                        placeholder="새 항목 입력..." onkeyup="if(event.key==='Enter') window.addCurrentListItem()">
                    <button onclick="window.addCurrentListItem()"
                        class="flex-shrink-0 bg-primary text-white p-3 rounded-xl hover:bg-orange-500 shadow-md transition-all flex items-center justify-center">
                        <span class="material-symbols-outlined">add</span>
                    </button>
                </div>
                <!-- Location Picker (Only for Shopping) -->
                <div id="list-location-area" class="hidden">
                    <p class="text-[10px] font-bold text-gray-400 uppercase mb-2 px-1">구매 예정 장소 연결</p>
                    <div id="list-location-picker" class="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                        <!-- Locations dynamically rendered here -->
                    </div>
                </div>
            </div>

            <div id="list-modal-content" class="flex-1 overflow-y-auto p-6 flex flex-col gap-3">
                <!-- 리스트 아이템들이 여기에 렌더링됨 -->
            </div>

            <div class="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <button onclick="window.closeListModal()"
                    class="px-6 py-2 bg-gray-100 dark:bg-gray-800 text-text-main dark:text-white rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    닫기
                </button>
            </div>
        </div>
        `;
        document.body.appendChild(modal);
    }
    // [Fix] 항상 최신 Z-Index 적용
    modal.style.zIndex = Z_INDEX.MODAL_SELECTOR;
}

let activeListType = 'shopping'; // 'shopping' or 'check'
let selectedLocation = null;

export function openShoppingListModal() {
    activeListType = 'shopping';
    selectedLocation = null;
    updateModalTitle('쇼핑 리스트', 'shopping_bag');
    renderLocationPicker();
    renderListInModal();
    showListModal();
}

export function openChecklistModal() {
    activeListType = 'check';
    selectedLocation = null;
    updateModalTitle('준비물 리스트', 'checklist');
    renderListInModal();
    showListModal();
}

function updateModalTitle(title, icon) {
    ensureListModal();
    document.getElementById('list-modal-title').textContent = title;
    document.getElementById('list-modal-icon').textContent = icon;
    document.getElementById('list-item-input').placeholder = `${title} 항목 추가...`;

    // Toggle Location Picker visibility
    const locArea = document.getElementById('list-location-area');
    if (activeListType === 'shopping') {
        locArea.classList.remove('hidden');
    } else {
        locArea.classList.add('hidden');
    }
}

export function renderLocationPicker() {
    const container = document.getElementById('list-location-picker');
    if (!container) return;

    // Extract unique locations from timeline
    const locations = [];
    if (travelData.days) {
        travelData.days.forEach(day => {
            if (day.timeline) {
                day.timeline.forEach(item => {
                    if (item.title && !item.isTransit && item.tag !== '메모') {
                        if (!locations.some(l => l.title === item.title)) {
                            locations.push({ title: item.title, location: item.location });
                        }
                    }
                });
            }
        });
    }

    if (locations.length === 0) {
        container.innerHTML = '<p class="text-[11px] text-gray-400 py-2">등록된 장소가 없습니다.</p>';
        return;
    }

    container.innerHTML = locations.map((loc, i) => {
        const isSel = selectedLocation && selectedLocation.title === loc.title;
        return `
            <button onclick="window.selectListLocation(${i}, '${loc.title.replace(/'/g, "\\'")}')"
                class="flex-shrink-0 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all ${isSel ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white dark:bg-card-dark text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary'}">
                ${loc.title}
            </button>
        `;
    }).join('');

    // Attach data for window handler
    window.pickerLocations = locations;
}

window.selectListLocation = (idx, title) => {
    if (selectedLocation && selectedLocation.title === title) {
        selectedLocation = null;
    } else {
        selectedLocation = window.pickerLocations[idx];
    }
    renderLocationPicker();
};

function showListModal() {
    const modal = document.getElementById('list-manager-modal');
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('list-item-input').focus(), 100);
}

export function closeListModal() {
    const modal = document.getElementById('list-manager-modal');
    if (modal) modal.classList.add('hidden');
}

export function renderListInModal() {
    const container = document.getElementById('list-modal-content');
    if (!container) return;

    const list = activeListType === 'shopping' ? travelData.shoppingList : travelData.checklist;

    if (!list || list.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2 opacity-20">list_alt</span>
                <p>등록된 항목이 없습니다.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map((item, index) => `
        <div class="flex items-center gap-3 p-1 group">
            <button onclick="window.toggleListCheck('${activeListType}', ${index})" 
                class="flex-shrink-0 text-gray-400 hover:text-primary transition-colors">
                <span class="material-symbols-outlined text-2xl">${item.checked ? 'check_box' : 'check_box_outline_blank'}</span>
            </button>
            <div class="flex-1 min-w-0">
                <div class="flex flex-col">
                    <input type="text" value="${item.text}" 
                        onchange="window.updateListItemText('${activeListType}', ${index}, this.value)"
                        class="w-full bg-transparent border-none text-text-main dark:text-white outline-none focus:ring-0 ${item.checked ? 'line-through text-gray-400' : ''}">
                    ${item.location ? `
                        <div class="flex items-center gap-1 text-[10px] text-primary font-bold px-1">
                            <span class="material-symbols-outlined text-xs">location_on</span>
                            ${item.location}
                        </div>
                    ` : ''}
                </div>
            </div>
            <button onclick="window.deleteListItem('${activeListType}', ${index})" 
                class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <span class="material-symbols-outlined">delete</span>
            </button>
        </div>
    `).join('');
}

export function addCurrentListItem() {
    const input = document.getElementById('list-item-input');
    const text = input.value.trim();
    if (!text) return;

    const newItem = { text, checked: false };
    if (activeListType === 'shopping' && selectedLocation) {
        newItem.location = selectedLocation.title;
        newItem.locationDetail = selectedLocation.location;
    }

    if (activeListType === 'shopping') {
        travelData.shoppingList.push(newItem);
    } else {
        travelData.checklist.push(newItem);
    }

    input.value = '';
    selectedLocation = null;
    renderLocationPicker();
    renderListInModal();
    if (window.renderLists) window.renderLists();
    if (window.autoSave) window.autoSave();
}

// Global exposure for HTML handlers (managed by ui.js usually, but we can do it here too)
window.openShoppingListModal = openShoppingListModal;
window.openChecklistModal = openChecklistModal;
window.closeListModal = closeListModal;
window.addCurrentListItem = addCurrentListItem;
window.renderListInModal = renderListInModal;
window.updateListItemText = (type, index, text) => {
    const list = type === 'shopping' ? travelData.shoppingList : travelData.checklist;
    if (list[index]) {
        list[index].text = text;
        if (window.renderLists) window.renderLists();
        if (window.autoSave) window.autoSave();
    }
};

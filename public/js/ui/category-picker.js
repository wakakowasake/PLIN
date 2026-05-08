// Category Selection Modal Module
// Handles the category picker UI for timeline items

// Category list data
export const categoryList = [
    { code: 'meal', name: '식사', icon: 'restaurant' },
    { code: 'culture', name: '문화', icon: 'museum' },
    { code: 'sightseeing', name: '관광', icon: 'photo_camera' },
    { code: 'shopping', name: '쇼핑', icon: 'shopping_bag' },
    { code: 'accommodation', name: '숙소', icon: 'hotel' },
    { code: 'custom', name: '기타', icon: 'star' }
];

/**
 * Initialize the category modal by populating the grid with category buttons
 */
export function initCategoryModal() {
    const list = document.getElementById('category-grid');
    if (list.children.length === 0) {
        categoryList.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = "flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/30 transition-all aspect-square group";
            btn.onclick = () => selectCategory(cat);
            btn.innerHTML = `
                <div class="w-12 h-12 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center shadow-sm text-gray-500 dark:text-gray-300 group-hover:text-primary group-hover:scale-110 transition-all">
                    <span class="material-symbols-outlined text-2xl">${cat.icon}</span>
                </div>
                <span class="font-bold text-sm">${cat.name}</span>
            `;
            list.appendChild(btn);
        });
    }
}

/**
 * Open the category selection modal
 */
export function openCategoryModal() {
    initCategoryModal();
    document.getElementById('category-selection-modal').classList.remove('hidden');
}

/**
 * Close the category selection modal
 */
export function closeCategoryModal() {
    document.getElementById('category-selection-modal').classList.add('hidden');
}

/**
 * Select a category and update the input field
 * @param {Object} cat - Category object with code, name, and icon
 */
export function selectCategory(cat) {
    const input = document.getElementById('item-category');
    input.value = cat.name;
    input.dataset.value = cat.code;
    closeCategoryModal();
}

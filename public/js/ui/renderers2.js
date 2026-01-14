import { travelData, currentDayIndex, isEditing } from '../state.js';

function safeGet(id) { return document.getElementById(id); }

export function renderTimelineItemHtml(item, index, dayIndex, isLast, isFirst) {
    const lineStyle = isLast ? `bg-gradient-to-b from-gray-200 to-transparent dark:from-gray-700` : `bg-gray-200 dark:bg-gray-700`;
    const linePosition = isFirst ? 'top-6 -bottom-8' : 'top-0 -bottom-8';
    let iconBg = item.isTransit ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-card-dark';
    let iconColor = item.isTransit ? 'text-primary/70' : 'text-primary';
    let iconStyle = '';
    if (item.tag === '메모') {
        iconBg = 'bg-yellow-50 dark:bg-yellow-900/20';
        iconColor = 'text-yellow-600 dark:text-yellow-400';
    } else if (item.color) {
        iconBg = '';
        iconColor = '';
        const fgColor = item.textColor || '#ffffff';
        iconStyle = `background-color: ${item.color}; color: ${fgColor}; border-color: ${item.color};`;
    }

    const editClass = isEditing ? "edit-mode-active ring-2 ring-primary/50 ring-offset-2" : "cursor-pointer hover:shadow-lg transform transition-all hover:-translate-y-1";
    const clickHandler = isEditing ? `onclick="editTimelineItem(${index}, ${dayIndex})"` : `onclick="viewTimelineItem(${index}, ${dayIndex})"`;
    const contextHandler = `oncontextmenu="openContextMenu(event, 'item', ${index}, ${dayIndex})"`;
    const isMemoryLocked = travelData.meta?.memoryLocked || false;
    const draggableAttr = isMemoryLocked ? 'draggable="false"' : `draggable="true" ondragstart="dragStart(event, ${index}, ${dayIndex})" ondragend="dragEnd(event)" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="drop(event, ${index})" data-drop-index="${index}"`;
    const zIndex = 100 - index;

    let html = `
        <div ${draggableAttr} ontouchstart="touchStart(event, ${index}, 'item')" ontouchmove="touchMove(event)" ontouchend="touchEnd(event)" data-index="${index}" style="z-index: ${zIndex};" class="relative grid grid-cols-[auto_1fr] gap-x-3 md:gap-x-6 group/timeline-item pb-8 timeline-item-transition rounded-xl" ${contextHandler}>
        <div class="drag-indicator absolute -top-3 left-0 right-0 h-1 bg-primary rounded-full hidden z-50 shadow-sm pointer-events-none"></div>

        <div class="relative flex flex-col items-center" data-timeline-icon="true">
            <div class="absolute ${linePosition} w-0.5 ${lineStyle} timeline-vertical-line"></div>
            <div class="w-10 h-10 rounded-full ${iconBg} border-2 border-primary/30 flex items-center justify-center z-10 shadow-sm relative shrink-0 mt-1" style="${iconStyle}">
                <span class="material-symbols-outlined ${iconColor} text-xl" style="${item.color ? 'color: inherit' : ''}">${item.icon}</span>
            </div>
            ${!isMemoryLocked ? `<div class="absolute -bottom-8 left-1/2 -translate-x-1/2 z-20 add-item-btn-container transition-opacity duration-200">
                <button type="button" onclick="openAddModal(${index}, ${dayIndex})" class="w-8 h-8 rounded-full bg-white dark:bg-card-dark border border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary transition-colors shadow-sm cursor-pointer transform hover:scale-110" title="일정 추가">
                    <span class="material-symbols-outlined text-lg">add</span>
                </button>
            </div>` : ''}
        </div>
        <div class="pb-2 pt-1 flex flex-col justify-center min-w-0">
    `;

    if (item.image) {
        html += `...`;
    } else if (item.tag === '메모') {
        html += `...`;
    } else if (item.isTransit) {
        html += `...`;
    } else {
        html += `...`;
    }

    html += `</div></div>`;
    return html;
}

export function renderItinerary() {
    return; // delegated implementation lives in ui.js while refactoring continues
}

export function renderLists() {
    return; // delegated
}

export function renderAttachments(item, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!item?.attachments || item.attachments.length === 0) {
        container.innerHTML = '<p class="col-span-full text-xs text-gray-400 text-center py-2">첨부된 파일이 없습니다.</p>';
        return;
    }
    let html = '';
    item.attachments.forEach((att, index) => {
        const isImage = att.type && att.type.startsWith && att.type.startsWith('image/');
        const bgClass = isImage ? '' : 'bg-gray-100 dark:bg-gray-700';
        const fileData = att.url || att.data;
        const content = isImage ? `<div class="w-full h-full bg-cover bg-center" style="background-image: url('${fileData}')"></div>` : `<div class="w-full h-full flex flex-col items-center justify-center text-gray-500"><span class="material-symbols-outlined text-2xl mb-1">picture_as_pdf</span><span class="text-[10px] px-2 truncate w-full text-center">${att.name || ''}</span></div>`;
        html += `
            <div class="relative group aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 ${bgClass}">
                ${content}
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button onclick="openAttachment('${fileData}', '${att.type}')" class="text-white hover:text-primary p-1" title="열기">
                        <span class="material-symbols-outlined">visibility</span>
                    </button>
                    <button onclick="deleteAttachment(${index}, '${containerId}')" class="text-white hover:text-red-500 p-1" title="삭제">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

export function renderWeeklyWeather() {
    return; // delegated
}

export default { renderItinerary, renderTimelineItemHtml, renderLists, renderAttachments, renderWeeklyWeather };
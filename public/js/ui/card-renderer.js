/**
 * CardRenderer - 타임라인 아이템 카드 렌더링
 * 
 * Phase 3 렌더링 리팩토링 - 컴포넌트 분할
 * renderers.js에서 분리된 카드 렌더링 로직
 */

import { isEditing } from '../state.js';
import { escapeHtml, formatDuration, normalizeGooglePhotoUrl } from '../ui-utils.js';

/**
 * 여행 완료 여부 확인
 */
export function isTripCompleted() {
    // travelData를 여기서 직접 import하지 않으므로, 호출자가 상태를 제공해야 함
    // 또는 렌더러에서 상태 접근
    if (typeof window !== 'undefined' && window.travelData) {
        const data = window.travelData;
        if (!data || !data.days || data.days.length === 0) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lastDayStr = data.days[data.days.length - 1].date;
        if (!lastDayStr) return false;
        const lastDay = new Date(lastDayStr);
        lastDay.setHours(0, 0, 0, 0);
        return today > lastDay;
    }
    return false;
}

function normalizePlanBCardData(planB) {
    if (!planB) return null;

    if (typeof planB === 'string') {
        const title = planB.trim();
        return title ? { title, location: '', note: '' } : null;
    }

    if (typeof planB === 'object') {
        const title = String(planB.title || '').trim();
        const location = String(planB.location || '').trim();
        const note = String(planB.note || '').trim();
        if (!title && !location && !note) return null;
        return {
            title: title || location || 'Plan B',
            location,
            note
        };
    }

    return null;
}

function renderPlanBBackCard(planBData) {
    if (!planBData) return '';

    return `
        <div class="pointer-events-none absolute inset-x-2 top-3 -bottom-3 z-0 rounded-2xl border border-primary/20 bg-primary/10 dark:bg-primary/10 shadow-sm px-3 py-2 flex flex-col justify-end">
            <div class="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                <span class="material-symbols-outlined text-xs">alt_route</span>
                <span>Plan B</span>
            </div>
            <p class="text-xs font-bold text-text-main dark:text-white truncate">${escapeHtml(planBData.title)}</p>
            ${planBData.location ? `<p class="text-[11px] text-text-muted dark:text-gray-300 truncate">${escapeHtml(planBData.location)}</p>` : ''}
            ${planBData.note ? `<p class="text-[11px] text-text-muted dark:text-gray-300 line-clamp-1">${escapeHtml(planBData.note)}</p>` : ''}
        </div>
    `;
}

function renderTimelineTag(label, variant = 'default') {
    const safeLabel = String(label || '').trim();
    if (!safeLabel) return '';

    return `<span class="timeline-row-tag timeline-row-tag-${variant}">${escapeHtml(safeLabel)}</span>`;
}

function renderTimelineTitle(title) {
    const safeTitle = String(title || '').trim() || '일정';
    return `<h3 class="timeline-card-title">${escapeHtml(safeTitle)}</h3>`;
}

function renderTimelineLocation(location) {
    const safeLocation = String(location || '').trim();
    if (!safeLocation) return '';

    return `<p class="timeline-card-location">${escapeHtml(safeLocation)}</p>`;
}

function isSafeCssColor(value) {
    const safeValue = String(value || '').trim();
    if (!safeValue) return false;

    return /^#[0-9a-f]{3,8}$/i.test(safeValue)
        || /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*(?:0|1|0?\.\d+|[\d.]+%))?\s*\)$/i.test(safeValue);
}

function isDuplicateTransitTitle(title, label) {
    const normalizedTitle = String(title || '').replace(/\s+/g, '');
    const normalizedLabel = String(label || '').replace(/\s+/g, '');
    if (!normalizedTitle || !normalizedLabel) return false;

    return normalizedTitle === normalizedLabel
        || normalizedTitle === `${normalizedLabel}이동`
        || normalizedTitle === `${normalizedLabel}로이동`;
}

function renderTransitStepChip(label, options = {}) {
    const safeLabel = String(label || '').trim();
    if (!safeLabel) return '';

    const type = String(options.type || '').trim();
    const icon = String(options.icon || '').trim();
    const isNeutral = type === 'walk'
        || type === 'custom'
        || icon === 'directions_walk'
        || safeLabel === '도보'
        || safeLabel === '기타';
    const color = isSafeCssColor(options.color) ? String(options.color).trim() : '';
    const textColor = isSafeCssColor(options.textColor) ? String(options.textColor).trim() : '';
    const style = color ? ` style="background-color: ${color}; color: ${textColor || '#ffffff'};"` : '';
    const variantClass = color
        ? 'timeline-transit-step-chip-colored'
        : (isNeutral ? 'timeline-transit-step-chip-neutral' : 'timeline-transit-step-chip-default');

    return `<span class="timeline-transit-step-chip ${variantClass}"${style}>${escapeHtml(safeLabel)}</span>`;
}

function renderTimelineNote(note) {
    const safeNote = String(note || '').trim();
    if (!safeNote) return '';

    return `
        <div class="timeline-card-note-box">
            <p class="timeline-card-note">${escapeHtml(safeNote)}</p>
        </div>
    `;
}

function renderPhotoPreview(imageUrl, title) {
    const normalizedImage = normalizeGooglePhotoUrl(imageUrl, 800);
    if (!normalizedImage) return '';

    return `
        <div class="timeline-photo-section">
            <div class="timeline-photo-row">
                <img src="${normalizedImage}" alt="${escapeHtml(title || '일정 이미지')}" class="timeline-photo-preview" loading="eager" decoding="async" fetchpriority="auto" onerror="this.closest('.timeline-photo-section')?.remove();">
            </div>
        </div>
    `;
}

/**
 * 이미지가 있는 타임라인 아이템 카드 (사진 있는 활동)
 */
export function buildImageCard(item, editClass, clickHandler, index, dayIndex) {
    const planBData = normalizePlanBCardData(item.planB);
    const wrapperClass = planBData ? 'pb-3' : '';
    const imageUrl = normalizeGooglePhotoUrl(item.image, 800)
        || '';

    return `
            <div class="relative ${wrapperClass}">
                ${renderPlanBBackCard(planBData)}
                <div class="timeline-content-card timeline-content-card-image relative z-10 ${editClass}" ${clickHandler}>
                    <div class="timeline-card-header">
                        <div class="timeline-card-copy">
                            <div class="timeline-card-tag-row">
                                ${renderTimelineTag(item.tag || '장소')}
                                ${item.duration !== undefined && item.duration !== null ? renderTimelineTag(formatDuration(item.duration), 'accent') : ''}
                            </div>
                            ${renderTimelineTitle(item.title)}
                            ${renderTimelineLocation(item.location)}
                            ${renderTimelineNote(item.note)}
                            ${renderPhotoPreview(imageUrl, item.title)}
                        </div>
                    </div>
                </div>
            </div>`;
}

/**
 * 메모 카드 (노란색 포스트잇 스타일)
 */
export function buildMemoCard(item, index, dayIndex, editClass, clickHandler) {
    const contextHandler = `oncontextmenu="event.stopPropagation(); openContextMenu(event, 'item', ${index}, ${dayIndex})"`;

    return `
            <div class="timeline-content-card timeline-content-card-memo relative ${editClass}"
                data-action="view-item" data-index="${index}" data-day="${dayIndex}" ${contextHandler}>
                <div class="timeline-card-header">
                    <div class="timeline-card-copy">
                        <div class="timeline-card-tag-row">
                            ${renderTimelineTag(item.tag || '메모', 'memo')}
                        </div>
                        <div class="timeline-card-note-box timeline-card-note-box-standalone">
                            <p class="timeline-card-note">${escapeHtml(item.title || item.note || '')}</p>
                        </div>
                    </div>
                    ${isEditing ? `<button type="button" data-action="delete-item" data-index="${index}" data-day="${dayIndex}" class="timeline-row-delete-button"><span class="material-symbols-outlined text-lg">delete</span></button>` : ''}
                </div>                
            </div>`;
}

/**
 * 대중교통/경로 카드 (종이 택시 모양)
 */
export function buildTransitCard(item, index, dayIndex, editClass) {
    let contentHtml;

    if (item.title && item.title.includes('<span')) {
        const dangerPatterns = [/on\w+\s*=/i, /javascript:/i, /<script/i, /alert\(/i, /prompt\(/i, /confirm\(/i, /data:/i];
        const isDangerous = dangerPatterns.some(pattern => pattern.test(item.title));

        if (isDangerous) {
            contentHtml = `<span class="text-red-500 font-bold">[보안 차단됨]</span> ${escapeHtml(item.title)}`;
        } else {
            contentHtml = item.title;
        }
    } else {
        let tagsHtml = '';
        let primaryChipLabel = '';
        if (item.detailedSteps && item.detailedSteps.length > 0) {
            const routeSteps = item.detailedSteps.filter(s => s && (s.tag || s.title || s.type));
            if (routeSteps.length > 0) {
                tagsHtml = routeSteps.map(s => {
                    const label = s.tag || s.title || (s.type === 'walk' ? '도보' : '이동');
                    if (!primaryChipLabel) primaryChipLabel = label;
                    return renderTransitStepChip(label, {
                        color: s.color,
                        textColor: s.textColor,
                        type: s.type,
                        icon: s.icon
                    });
                }).join('<span class="material-symbols-outlined timeline-transit-step-arrow">arrow_forward</span>');
            }
        } else if (item.tag) {
            primaryChipLabel = item.tag;
            tagsHtml = renderTransitStepChip(item.tag, {
                type: item.transitType,
                icon: item.icon
            });
        } else if (item.title) {
            primaryChipLabel = item.title;
            tagsHtml = renderTransitStepChip(item.title, {
                type: item.transitType,
                icon: item.icon
            });
        }

        const showTitle = Boolean(item.title) && !item.detailedSteps?.length && !isDuplicateTransitTitle(item.title, primaryChipLabel);
        const titleText = showTitle ? `<span class="timeline-transit-title">${escapeHtml(item.title)}</span>` : '';
        contentHtml = `${tagsHtml} ${titleText}`;
    }

    return `
            <div class="timeline-content-card timeline-content-card-transit ${editClass}" data-action="view-route" data-index="${index}" data-day="${dayIndex}">
                <div class="timeline-card-header">
                    <div class="timeline-card-copy">
                        <div class="timeline-card-tag-row">
                            ${renderTimelineTag(item.tag || '이동', 'transit')}
                            ${renderTimelineTag(typeof item.duration === 'number' ? formatDuration(item.duration) : (item.duration || ''), 'accent')}
                        </div>
                        <div class="timeline-card-transit-content">
                            ${contentHtml}
                        </div>
                        ${renderTimelineLocation(item.location)}
                        ${renderTimelineNote(item.note)}
                    </div>
                </div>
            </div>`;
}

/**
 * 기본 카드 (가장 일반적인 활동)
 */
export function buildDefaultCard(item, index, dayIndex, editClass, clickHandler) {
    const planBData = normalizePlanBCardData(item.planB);
    const wrapperClass = planBData ? 'pb-3' : '';

    return `
            <div class="relative ${wrapperClass}">
                ${renderPlanBBackCard(planBData)}
                <div class="timeline-content-card timeline-content-card-default relative z-10 ${editClass}" ${clickHandler}>
                    <div class="timeline-card-header">
                        <div class="timeline-card-copy">
                            <div class="timeline-card-tag-row">
                                ${renderTimelineTag(item.tag || '일정')}
                                ${item.duration !== undefined && item.duration !== null ? renderTimelineTag(formatDuration(item.duration), 'accent') : ''}
                            </div>
                            ${renderTimelineTitle(item.title)}
                            ${renderTimelineLocation(item.location)}
                            ${renderTimelineNote(item.note)}
                        </div>
                        ${isEditing ? `<button type="button" data-action="delete-item" data-index="${index}" data-day="${dayIndex}" class="timeline-row-delete-button"><span class="material-symbols-outlined text-base md:text-lg">delete</span></button>` : ''}
                    </div>
                </div>
            </div>`;
}

import { firebaseReady } from '../firebase.js';
import { currentUser, newTripDataTemp, defaultTravelData, setNewTripDataTemp, isGuestMode, setTravelData, setCurrentTripId, setIsEditing } from '../state.js';
import { escapeHtml, normalizeGooglePhotoUrl } from '../ui-utils.js';
import { showLoading, hideLoading, showToast } from './modals.js';
import { Z_INDEX } from './constants.js';
import logger from '../logger.js';
import { setupWizardAutocomplete } from '../map.js';
import { renderItinerary } from './renderers.js';
import {
    bindTripCreateTitleInput,
    buildTripCreatePayload,
    closeTripCreateModalFlow,
    openTripCreateModalFlow,
    readTripCreateFormValues,
    showTripWizardStep,
    syncTripDateConstraint,
    syncTripCreateTitleCounter,
    validateTripDateRange
} from '../features/trips/trip-form.js';
import {
    readDuplicateOptions,
    resetDuplicateOptions
} from '../features/trips/trip-duplicate-flow.js';
import { fetchBackendJson } from '../services/backend/api-client.js';
import { TRIP_TITLE_MAX_LENGTH, truncateTripTitle } from '../../../shared/features/trips/trip-title.js';
import {
    destinationCategoryOptions,
    destinationScopeOptions,
    popularTripDestinations
} from '../../../shared/features/trips/trip-destinations-data.js';

const TRIP_CREATE_DESTINATION_LIMIT = 12;
const TRIP_CREATE_DEFAULT_SCOPE = 'domestic';
const TRIP_CREATE_SCOPE_ORDER = {
    domestic: 0,
    international: 1
};
const TRIP_CREATE_CATEGORY_LABEL_OVERRIDES = {
    all: '인기 여행지',
    'southeast-asia': '동남아',
    capital: '수도권'
};
let tripCreateScope = TRIP_CREATE_DEFAULT_SCOPE;
let tripCreateCategoryByScope = {
    international: 'all',
    domestic: 'all'
};
let tripCreateSelectedDestinationId = '';
let tripCreatePlaceEventBound = false;
let tripCreateReturnView = 'main';

function renderTripListLoading(listEl) {
    if (!listEl) return;

    listEl.innerHTML = '<div class="col-span-full text-center py-12"><div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-primary"></div><p class="mt-4 text-gray-400 text-sm">여행 계획을 불러오는 중...</p></div>';
}

function isActiveTripListRequest(listEl, uid) {
    const safeUid = String(uid || '').trim();
    return Boolean(safeUid)
        && listEl?.dataset.tripListOwnerUid === safeUid
        && currentUser?.uid === safeUid;
}

export function clearTripListForAuthChange(uid = '') {
    const listEl = ensureTripListContainer();
    if (!listEl) return;

    const safeUid = String(uid || '').trim();
    listEl.dataset.tripListOwnerUid = safeUid;
    if (safeUid) {
        renderTripListLoading(listEl);
        return;
    }

    listEl.innerHTML = '';
}

// [Helper] 여행 목록 컨테이너가 없으면 생성
function ensureTripListContainer() {
    let listEl = document.getElementById('trip-list');
    if (!listEl || !document.body.contains(listEl)) {
        const mainView = document.getElementById('main-view');
        if (mainView) {
            // 메인 뷰 내부에 리스트 컨테이너 생성
            const container = document.createElement('div');
            container.id = "trip-list";
            container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20 animate-fade-in";

            // 제목 뒤나 적절한 위치에 삽입
            const title = document.getElementById('main-view-title');
            // [Fix] UI 깨짐 방지를 위해 mainView의 마지막에 추가하거나 명시적인 위치 사용
            mainView.appendChild(container);
            listEl = container;
            // logger.debug("[Auto-Fix] Missing #trip-list element was created.");
        }
    }
    return listEl;
}

function parseTripDate(value) {
    const safeValue = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) return null;

    const parsed = new Date(`${safeValue}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCompactTripDate(value) {
    const parsed = parseTripDate(value);
    if (!parsed) return String(value || '').trim();

    return `${parsed.getFullYear()}.${parsed.getMonth() + 1}.${parsed.getDate()}`;
}

function buildTripDayCount(plan) {
    const explicitDayCount = String(plan?.meta?.dayCount || '').trim();
    if (explicitDayCount) return explicitDayCount;

    const dayLength = Array.isArray(plan?.days) ? plan.days.length : 0;
    if (!dayLength) return '일정 미정';
    if (dayLength === 1) return '당일치기';
    return `${dayLength - 1}박 ${dayLength}일`;
}

function findTripCoverImage(plan) {
    const candidates = [
        plan?.meta?.coverImage,
        plan?.meta?.mapImage,
        plan?.coverImage,
        plan?.mapImage
    ];

    for (const day of plan?.days || []) {
        for (const item of day?.items || []) {
            candidates.push(item?.image);
        }
    }

    const firstImage = candidates.find((value) => typeof value === 'string' && value.trim());
    return normalizeGooglePhotoUrl(firstImage, 800) || '';
}

function readTripDateRange(plan) {
    const startDate = String(plan?.meta?.startDate || plan?.days?.[0]?.date || '').trim();
    const endDate = String(plan?.meta?.endDate || plan?.days?.[plan.days.length - 1]?.date || '').trim();

    if (startDate && endDate) {
        return {
            startDate,
            endDate,
            label: `${formatCompactTripDate(startDate)}-${formatCompactTripDate(endDate)}`
        };
    }

    if (startDate) {
        return {
            startDate,
            endDate: '',
            label: formatCompactTripDate(startDate)
        };
    }

    return {
        startDate: '',
        endDate: '',
        label: ''
    };
}

function readTripLocation(plan) {
    const explicitLocation = String(plan?.meta?.location || '').trim();
    if (explicitLocation) return explicitLocation;

    const rawSubInfo = String(plan?.meta?.subInfo || '').trim();
    const [prefix] = rawSubInfo.split(/\s*[•·]\s*/);
    return String(prefix || '').trim();
}

function normalizeTripCreateSearchText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['"`’.,()\-_/|]+/g, '')
        .replace(/\s+/g, '');
}

function getOrderedTripCreateScopes() {
    return [...destinationScopeOptions]
        .sort((left, right) => (
            (TRIP_CREATE_SCOPE_ORDER[left.id] ?? 99) - (TRIP_CREATE_SCOPE_ORDER[right.id] ?? 99)
        ));
}

function getTripCreateCategories(scope = tripCreateScope) {
    return (destinationCategoryOptions?.[scope] || [])
        .map((category) => ({
            ...category,
            label: TRIP_CREATE_CATEGORY_LABEL_OVERRIDES[category.id] || category.label
        }));
}

function matchesTripCreateDestination(destination, query) {
    const normalizedQuery = normalizeTripCreateSearchText(query);
    if (!normalizedQuery) return true;

    const haystack = normalizeTripCreateSearchText([
        destination.name,
        destination.subtitle,
        ...(destination.keywords || [])
    ].join(' '));

    return haystack.includes(normalizedQuery);
}

function getFilteredTripCreateDestinations() {
    const categoryId = tripCreateCategoryByScope[tripCreateScope] || 'all';
    const query = document.getElementById('new-trip-location')?.value || '';

    return popularTripDestinations
        .filter((destination) => destination.scope === tripCreateScope)
        .filter((destination) => categoryId === 'all' || destination.categoryId === categoryId)
        .filter((destination) => matchesTripCreateDestination(destination, query))
        .slice(0, TRIP_CREATE_DESTINATION_LIMIT);
}

function resetTripCreateTempPlace() {
    newTripDataTemp.locationName = '';
    newTripDataTemp.address = '';
    newTripDataTemp.lat = null;
    newTripDataTemp.lng = null;
    newTripDataTemp.mapImage = '';
}

function updateTripCreateTitlePreview() {
    const location = (
        newTripDataTemp.locationName
        || document.getElementById('new-trip-location')?.value?.trim()
        || ''
    );
    const generatedTitle = location
        ? truncateTripTitle(`${location} 여행`, TRIP_TITLE_MAX_LENGTH)
        : '';
    const titleInput = document.getElementById('new-trip-title');
    const preview = document.getElementById('new-trip-title-preview');

    if (titleInput) titleInput.value = generatedTitle;
    if (preview) preview.textContent = generatedTitle || '여행지를 고르면 제목이 자동으로 만들어져요.';
    syncTripCreateTitleCounter();
}

function updateTripCreateDurationPreview() {
    const startDate = document.getElementById('new-trip-start')?.value || '';
    const endDate = document.getElementById('new-trip-end')?.value || '';
    const preview = document.getElementById('trip-create-date-duration');
    if (!preview) return;

    const start = parseTripDate(startDate);
    const end = parseTripDate(endDate);
    if (!start || !end || end < start) {
        preview.textContent = '날짜 확인';
        return;
    }

    const totalDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
    preview.textContent = totalDays === 1 ? '당일치기' : `${totalDays - 1}박 ${totalDays}일`;
}

function renderTripCreateScopeTabs() {
    const scopeTabs = document.getElementById('trip-create-scope-tabs');
    if (!scopeTabs) return;

    scopeTabs.innerHTML = getOrderedTripCreateScopes().map((scope) => {
        const isActive = scope.id === tripCreateScope;
        return `
            <button type="button" class="trip-create-scope-tab ${isActive ? 'is-active' : ''}" data-trip-create-action="set-scope" data-scope="${escapeHtml(scope.id)}">
                ${escapeHtml(scope.label)}
            </button>
        `;
    }).join('');
}

function renderTripCreateCategoryChips() {
    const categoryChips = document.getElementById('trip-create-category-chips');
    if (!categoryChips) return;

    const activeCategory = tripCreateCategoryByScope[tripCreateScope] || 'all';
    categoryChips.innerHTML = getTripCreateCategories().map((category) => {
        const isActive = category.id === activeCategory;
        return `
            <button type="button" class="trip-create-category-chip ${isActive ? 'is-active' : ''}" data-trip-create-action="set-category" data-category="${escapeHtml(category.id)}">
                ${escapeHtml(category.label)}
            </button>
        `;
    }).join('');
}

function renderTripCreateDestinationList() {
    const list = document.getElementById('trip-create-destination-list');
    if (!list) return;

    const destinations = getFilteredTripCreateDestinations();
    if (!destinations.length) {
        list.innerHTML = `
            <div class="trip-create-empty-card">
                <strong>조건에 맞는 인기 여행지가 아직 없어요.</strong>
                <span>검색어를 바꾸거나 직접 입력으로 시작해 보세요.</span>
            </div>
        `;
        return;
    }

    list.innerHTML = destinations.map((destination, index) => {
        const isSelected = tripCreateSelectedDestinationId === destination.id;
        const imageUrl = normalizeGooglePhotoUrl(destination.imageUrl, 320) || '';
        return `
            <button type="button" class="trip-create-destination-row ${isSelected ? 'is-selected' : ''}" data-trip-create-action="select-destination" data-destination-id="${escapeHtml(destination.id)}">
                <span class="trip-create-destination-image-frame">
                    ${imageUrl ? `
                    <img src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async" fetchpriority="${index < 5 ? 'high' : 'auto'}" onerror="this.remove();">
                    ` : ''}
                    <span class="trip-create-destination-fallback">${escapeHtml(destination.name.slice(0, 1))}</span>
                </span>
                <span class="trip-create-destination-copy">
                    <span class="trip-create-destination-title">${escapeHtml(destination.name)}</span>
                    <span class="trip-create-destination-subtitle">${escapeHtml(destination.subtitle || '대표 여행지')}</span>
                </span>
                <span class="trip-create-destination-select">${isSelected ? '선택됨' : '선택'}</span>
            </button>
        `;
    }).join('');
}

function updateTripCreateSelectionSummary() {
    const summary = document.getElementById('trip-create-selection-summary');
    const summaryText = document.getElementById('trip-create-selection-text');
    const location = (
        newTripDataTemp.locationName
        || document.getElementById('new-trip-location')?.value?.trim()
        || ''
    );

    if (!summary || !summaryText) return;

    if (!location) {
        summary.classList.add('hidden');
        summaryText.textContent = '';
        return;
    }

    summary.classList.remove('hidden');
    summaryText.textContent = location;
}

function renderTripCreateDestinationPicker() {
    renderTripCreateScopeTabs();
    renderTripCreateCategoryChips();
    renderTripCreateDestinationList();
    updateTripCreateSelectionSummary();
    updateTripCreateTitlePreview();
    updateTripCreateDurationPreview();
}

function selectTripCreateDestination(destinationId) {
    const destination = popularTripDestinations.find((item) => item.id === destinationId);
    const input = document.getElementById('new-trip-location');
    if (!destination || !input) return;

    if (tripCreateSelectedDestinationId === destination.id) {
        tripCreateSelectedDestinationId = '';
        input.value = '';
        resetTripCreateTempPlace();
        renderTripCreateDestinationPicker();
        return;
    }

    tripCreateSelectedDestinationId = destination.id;
    input.value = destination.name;
    newTripDataTemp.locationName = destination.name;
    newTripDataTemp.address = destination.name;
    newTripDataTemp.lat = Number.isFinite(destination.latitude) ? destination.latitude : null;
    newTripDataTemp.lng = Number.isFinite(destination.longitude) ? destination.longitude : null;
    newTripDataTemp.mapImage = destination.imageUrl || '';
    renderTripCreateDestinationPicker();
}

function bindTripCreateModalControls(modal) {
    if (!modal || modal.dataset.tripCreateControlsBound === 'true') return;

    modal.addEventListener('click', (event) => {
        const target = event.target.closest('[data-trip-create-action]');
        if (!target) return;

        const action = target.dataset.tripCreateAction;
        if (action === 'set-scope') {
            tripCreateScope = target.dataset.scope || TRIP_CREATE_DEFAULT_SCOPE;
            renderTripCreateDestinationPicker();
            return;
        }

        if (action === 'set-category') {
            tripCreateCategoryByScope = {
                ...tripCreateCategoryByScope,
                [tripCreateScope]: target.dataset.category || 'all'
            };
            renderTripCreateDestinationPicker();
            return;
        }

        if (action === 'select-destination') {
            selectTripCreateDestination(target.dataset.destinationId || '');
        }
    });

    modal.addEventListener('input', (event) => {
        if (event.target?.id === 'new-trip-location') {
            if (tripCreateSelectedDestinationId && event.target.value.trim() !== newTripDataTemp.locationName) {
                tripCreateSelectedDestinationId = '';
                resetTripCreateTempPlace();
            }
            renderTripCreateDestinationPicker();
        }

        if (event.target?.id === 'new-trip-start' || event.target?.id === 'new-trip-end') {
            updateTripCreateDurationPreview();
        }
    });

    modal.addEventListener('change', (event) => {
        if (event.target?.id === 'new-trip-start' || event.target?.id === 'new-trip-end') {
            updateTripCreateDurationPreview();
        }
    });

    if (!tripCreatePlaceEventBound) {
        document.addEventListener('plin:new-trip-place-selected', () => {
            tripCreateSelectedDestinationId = '';
            renderTripCreateDestinationPicker();
        });
        tripCreatePlaceEventBound = true;
    }

    modal.dataset.tripCreateControlsBound = 'true';
}

function resetTripCreateModalState() {
    tripCreateScope = TRIP_CREATE_DEFAULT_SCOPE;
    tripCreateCategoryByScope = {
        international: 'all',
        domestic: 'all'
    };
    tripCreateSelectedDestinationId = '';
    document.querySelector('#new-trip-modal .trip-create-footer')?.classList.remove('is-date-step');
    document.querySelector('#new-trip-modal .trip-create-modal-header')?.classList.remove('is-date-step');
    const headerTitle = document.querySelector('#new-trip-modal .trip-create-modal-header .trip-create-title');
    const headerSubtitle = document.querySelector('#new-trip-modal .trip-create-modal-header .trip-create-subtitle');
    if (headerTitle) headerTitle.textContent = '어디로 떠나시나요?';
    if (headerSubtitle) headerSubtitle.textContent = '앱처럼 여행지를 먼저 고르고, 날짜는 다음 단계에서 정해요.';
    renderTripCreateDestinationPicker();
}

function enterTripCreateScreen() {
    const mainView = document.getElementById('main-view');
    const detailView = document.getElementById('detail-view');
    const isDetailVisible = detailView && !detailView.classList.contains('hidden');

    tripCreateReturnView = isDetailVisible ? 'detail' : 'main';
    mainView?.classList.add('hidden');
    detailView?.classList.add('hidden');
    document.getElementById('back-btn')?.classList.add('hidden');
    document.body.classList.add('trip-create-screen-active');
}

function leaveTripCreateScreen({ restorePreviousView = true } = {}) {
    const mainView = document.getElementById('main-view');
    const detailView = document.getElementById('detail-view');

    document.body.classList.remove('trip-create-screen-active');
    if (!restorePreviousView) return;

    if (tripCreateReturnView === 'detail') {
        mainView?.classList.add('hidden');
        detailView?.classList.remove('hidden');
        document.getElementById('back-btn')?.classList.remove('hidden');
        return;
    }

    detailView?.classList.add('hidden');
    mainView?.classList.remove('hidden');
    document.getElementById('back-btn')?.classList.add('hidden');
}

function validateTripCreatePlace() {
    const locationInput = document.getElementById('new-trip-location');
    const location = newTripDataTemp.locationName || locationInput?.value?.trim() || '';

    if (!location) {
        showToast('여행지를 검색하거나 아래에서 한 곳을 선택해 주세요.', 'warning');
        locationInput?.focus();
        return false;
    }

    updateTripCreateTitlePreview();
    return true;
}

function resolveTripStatus(plan, endDate) {
    if (plan?.meta?.status === 'completed' || plan?.status === 'completed') return 'completed';

    const parsedEndDate = parseTripDate(endDate);
    if (!parsedEndDate) return 'planning';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today > parsedEndDate ? 'completed' : 'planning';
}

function buildTripCardMetaLines(plan, dateRange) {
    const location = readTripLocation(plan);
    const lines = [];

    if (location) lines.push(location);
    if (dateRange.label) lines.push(dateRange.label);
    if (!lines.length && plan?.meta?.subInfo) lines.push(String(plan.meta.subInfo).trim());

    return lines.filter(Boolean).slice(0, 2);
}

// [Helper] 새 여행 생성 화면이 없으면 생성
function ensureNewTripModal() {
    let modal = document.getElementById('new-trip-modal');
    // 화면이 없거나 이전 버전이면 새로 생성
    if (!modal || modal.innerHTML.trim() === "" || modal.dataset.tripCreateLayoutVersion !== 'app-screen-v1') {
        if (modal) modal.remove(); // 기존 껍데기가 있다면 제거

        modal = document.createElement('div');
        modal.id = 'new-trip-modal';
        modal.dataset.tripCreateLayoutVersion = 'app-screen-v1';
        modal.className = 'trip-create-screen fixed inset-0 hidden overflow-hidden';
        // 새 여행 만들기는 앱 내 별도 화면처럼 보여야 해서 사이드 내비게이션보다 위에 둔다.
        modal.style.zIndex = String(Math.max(Z_INDEX.MODAL_SYSTEM, 700));
        modal.innerHTML = `
            <div class="trip-create-screen-shell trip-create-modal-card w-full h-full overflow-hidden">
                <div class="trip-create-modal-header">
                    <button data-action="close-new-trip" class="trip-create-screen-back-button" aria-label="여행 목록으로 돌아가기">
                        <span class="material-symbols-outlined">arrow_back</span>
                        <span>여행 목록</span>
                    </button>
                    <div class="trip-create-header-copy">
                        <p class="trip-create-step-label">새 여행 만들기</p>
                        <h3 class="trip-create-title">어디로 떠나시나요?</h3>
                        <p class="trip-create-subtitle">앱처럼 여행지를 먼저 고르고, 날짜는 다음 단계에서 정해요.</p>
                    </div>
                </div>

                <input type="hidden" id="new-trip-title" value="">
                <span id="new-trip-title-counter" class="hidden">0/${TRIP_TITLE_MAX_LENGTH}</span>

                <div class="modal-surface-body trip-create-modal-body">
                    <!-- Step 1: 장소 설정 -->
                    <div id="wizard-step-1" class="trip-create-step trip-create-place-step">
                        <div class="trip-create-field-block">
                            <div class="trip-create-search-row">
                                <div class="trip-create-search-wrap">
                                    <span class="material-symbols-outlined">search</span>
                                    <input type="text" id="new-trip-location" onkeypress="if(event.key==='Enter'){event.preventDefault();nextWizardStep(2);}" class="modal-text-input trip-create-search-input" placeholder="도시나 장소를 검색해 보세요">
                                </div>
                                <button type="button" data-action="manual-input" data-mode="new-trip" class="trip-create-manual-button">직접 입력</button>
                            </div>
                            <p class="trip-create-generated-title" id="new-trip-title-preview">여행지를 고르면 제목이 자동으로 만들어져요.</p>
                        </div>

                        <div class="trip-create-filter-section">
                            <div id="trip-create-scope-tabs" class="trip-create-scope-tabs"></div>
                            <div id="trip-create-category-chips" class="trip-create-category-chips no-scrollbar"></div>
                        </div>

                        <div id="trip-create-destination-list" class="trip-create-destination-list"></div>

                        <div id="trip-create-selection-summary" class="trip-create-selection-summary hidden">
                            <span class="trip-create-selection-label">선택한 여행지</span>
                            <strong id="trip-create-selection-text"></strong>
                        </div>
                    </div>

                    <!-- Step 2: 날짜 설정 -->
                    <div id="wizard-step-2" class="trip-create-step trip-create-date-step hidden">
                        <div class="trip-create-date-header">
                            <div>
                                <p class="trip-create-step-label">날짜</p>
                                <h3 class="trip-create-title">언제 떠나시나요?</h3>
                            </div>
                            <span id="trip-create-date-duration" class="trip-create-duration-pill">2박 3일</span>
                        </div>
                        <div class="trip-create-date-card">
                            <label class="trip-create-date-field">
                                <span>출발일</span>
                                <input type="date" id="new-trip-start" class="modal-text-input trip-create-date-input">
                            </label>
                            <div class="trip-create-date-divider"></div>
                            <label class="trip-create-date-field">
                                <span>돌아오는 날</span>
                                <input type="date" id="new-trip-end" class="modal-text-input trip-create-date-input">
                            </label>
                        </div>
                    </div>
                </div>

                <div class="modal-surface-footer trip-create-footer">
                    <button type="button" data-action="prev-wizard-step" data-step="1" class="modal-secondary-button trip-create-back-button">이전</button>
                    <button type="button" data-action="next-wizard-step" data-step="2" class="modal-primary-button trip-create-next-button">다음</button>
                    <button type="button" data-action="finish-wizard" class="modal-primary-button trip-create-finish-button hidden">여행 만들기</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        bindTripCreateModalControls(modal);
        bindTripCreateTitleInput();
        syncTripCreateTitleCounter();
        logger.debug("[Auto-Fix] Missing #new-trip-modal was created.");
    }
    return modal;
}

export async function loadTripList(uid) {
    await firebaseReady;
    if (!uid) {
        clearTripListForAuthChange('');
        return;
    }

    const listEl = ensureTripListContainer();
    if (!listEl) {
        console.error("Critical: Could not find or create #trip-list element.");
        return;
    }

    // [Fix] 기존에 정적으로 존재하는 '새 여행 만들기' 버튼이 있다면 숨김 처리 (중복 방지)
    const staticCreateBtn = document.querySelector('button[data-action="create-trip"]:not(#trip-list *)');
    if (staticCreateBtn) staticCreateBtn.classList.add('hidden');

    listEl.dataset.tripListOwnerUid = uid;
    renderTripListLoading(listEl);

    try {
        const result = await fetchBackendJson('/plans?limit=50');
        if (!isActiveTripListRequest(listEl, uid)) {
            return;
        }

        const trips = Array.isArray(result?.trips) ? result.trips : [];

        if (trips.length === 0) {
            listEl.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-16 text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <span class="material-symbols-outlined text-6xl mb-4 text-gray-300">travel_explore</span>
                    <p class="text-xl font-bold text-gray-600 dark:text-gray-300 mb-2">아직 여행 계획이 없습니다</p>
                    <p class="text-sm mb-8">새로운 여행을 만들어보세요!</p>
                    <button data-action="create-trip" class="px-6 py-3 bg-primary text-white rounded-2xl font-bold shadow-lg hover:bg-orange-600 transition-all transform hover:scale-105 flex items-center gap-2">
                        <span class="material-symbols-outlined">add_circle</span> 새 여행 만들기
                    </button>
                </div>
            `;
            return;
        }

        let html = '';
        trips.forEach((plan, index) => {
            const id = plan.id;
            const title = plan.meta?.title || '제목 없음';
            const currentRole = typeof plan.currentRole === 'string'
                ? plan.currentRole
                : (
                    currentUser?.uid
                        ? (
                            plan.createdBy === currentUser.uid
                            || plan.userId === currentUser.uid
                            || plan.members?.[currentUser.uid] === 'owner'
                                ? 'owner'
                                : (plan.members?.[currentUser.uid] || '')
                        )
                        : ''
                );
            const canManageShare = currentRole === 'owner' || currentRole === 'editor';
            const canDeleteTrip = currentRole === 'owner';

            const coverImage = findTripCoverImage(plan);
            const dateRange = readTripDateRange(plan);
            const status = resolveTripStatus(plan, dateRange.endDate);
            const isCompleted = status === 'completed';
            const statusLabel = isCompleted ? '기록' : '계획';
            const dayCount = buildTripDayCount(plan);
            const metaLines = buildTripCardMetaLines(plan, dateRange);
            const hasCoverClass = coverImage ? 'has-cover' : 'no-cover';
            const completedClass = isCompleted ? 'is-completed' : '';

            html += `
                <div class="trip-summary-card ${hasCoverClass} ${completedClass} group relative cursor-pointer" data-action="open-trip" data-id="${id}" oncontextmenu="event.preventDefault(); event.stopPropagation(); toggleTripMenu('${id}'); return false;">
                    <div class="trip-summary-cover">
                        ${coverImage ? `
                        <img
                            src="${escapeHtml(coverImage)}"
                            alt=""
                            class="trip-summary-cover-image"
                            loading="eager"
                            decoding="async"
                            fetchpriority="${index < 3 ? 'high' : 'auto'}"
                            onerror="this.remove(); this.closest('.trip-summary-card')?.classList.remove('has-cover'); this.closest('.trip-summary-card')?.classList.add('no-cover');"
                        >
                        <div class="trip-summary-cover-overlay"></div>
                        ` : `
                        <div class="trip-summary-fallback-accent"></div>
                        `}
                        <div class="trip-summary-card-content">
                            <div class="trip-summary-top-row">
                                <span class="trip-summary-status-badge">${statusLabel}</span>
                                <button type="button" data-action="toggle-trip-menu" data-id="${id}" class="trip-summary-menu-trigger" aria-label="${escapeHtml(title)} 메뉴 열기">
                                    <span class="trip-summary-menu-dot"></span>
                                    <span class="trip-summary-menu-dot"></span>
                                    <span class="trip-summary-menu-dot"></span>
                                </button>
                            </div>
                            <div class="trip-summary-bottom">
                                <div class="trip-summary-day-chip">${escapeHtml(dayCount)}</div>
                                <h3 class="trip-summary-title">${escapeHtml(title)}</h3>
                                ${metaLines.map((line) => `
                                <p class="trip-summary-date">${escapeHtml(line)}</p>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    
                    <div id="trip-menu-${id}" class="trip-summary-menu hidden absolute z-30 animate-fade-in">
                        ${canManageShare ? `
                        <button data-action="open-share-modal" data-id="${id}" class="w-full text-left px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                            <span class="material-symbols-outlined text-base text-primary">share</span> 공유
                        </button>
                        ` : ''}
                        <button data-action="duplicate-trip" data-id="${id}" class="w-full text-left px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                            <span class="material-symbols-outlined text-base text-primary">content_copy</span> 사본 만들기
                        </button>
                        ${canDeleteTrip ? `
                        <button data-action="delete-trip" data-id="${id}" class="w-full text-left px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors">
                            <span class="material-symbols-outlined text-base">delete</span> 삭제
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        // 새 여행 만들기 카드 추가 (리스트 맨 앞이나 뒤에)
        html = `
            <div data-action="create-trip" class="trip-summary-card trip-summary-create group relative cursor-pointer">
                <div class="trip-summary-create-accent"></div>
                <div class="trip-summary-create-body">
                    <div class="trip-summary-create-icon">
                        <span class="material-symbols-outlined text-3xl text-primary">add</span>
                    </div>
                    <div>
                        <span class="trip-summary-create-label">새 여행 만들기</span>
                        <p class="trip-summary-create-copy">어디로 떠날지 정하고 첫 일정을 담아보세요.</p>
                    </div>
                </div>
            </div>
        ` + html;

        listEl.innerHTML = html;

    } catch (e) {
        if (!isActiveTripListRequest(listEl, uid)) {
            return;
        }

        console.error("Error loading trips:", e);
        listEl.innerHTML = '<div class="col-span-full text-center text-red-500 py-8 bg-red-50 rounded-xl">여행 목록을 불러오는데 실패했습니다.<br><span class="text-xs text-gray-500">' + e.message + '</span></div>';
    }
}

export function createNewTrip() {
    const result = openTripCreateModalFlow({
        setNewTripDataTemp,
        ensureNewTripModal,
        syncDateConstraint: syncTripDateConstraint
    });
    enterTripCreateScreen();
    resetTripCreateModalState();
    setupWizardAutocomplete();
    return result;
}

export function closeNewTripModal() {
    const result = closeTripCreateModalFlow();
    leaveTripCreateScreen();
    return result;
}

export function nextWizardStep(step) {
    return showTripWizardStep(step, {
        validateStepTwo: validateTripCreatePlace,
        onStepShown: (currentStep) => {
            const footer = document.querySelector('#new-trip-modal .trip-create-footer');
            footer?.classList.toggle('is-date-step', currentStep === 2);
            const header = document.querySelector('#new-trip-modal .trip-create-modal-header');
            const headerTitle = header?.querySelector('.trip-create-title');
            const headerSubtitle = header?.querySelector('.trip-create-subtitle');
            header?.classList.toggle('is-date-step', currentStep === 2);
            if (headerTitle) headerTitle.textContent = currentStep === 2 ? '날짜 선택' : '어디로 떠나시나요?';
            if (headerSubtitle) headerSubtitle.textContent = currentStep === 2
                ? '출발일과 돌아오는 날을 정하면 일정판이 만들어져요.'
                : '앱처럼 여행지를 먼저 고르고, 날짜는 다음 단계에서 정해요.';

            if (currentStep === 1) {
                renderTripCreateDestinationPicker();
                setTimeout(() => {
                    document.getElementById('new-trip-location')?.focus();
                }, 100);
                setupWizardAutocomplete();
                return;
            }

            updateTripCreateDurationPreview();
        }
    });
}

export async function finishNewTripWizard() {
    if (!currentUser && !isGuestMode) {
        showToast("여행을 저장하려면 로그인이 필요해요! 🔒", 'warning');
        return;
    }

    const {
        titleInput,
        startInput,
        endInput,
        title: rawTitle,
        startDate,
        endDate,
        location
    } = readTripCreateFormValues(newTripDataTemp);

    if (!titleInput || !startInput || !endInput) {
        console.error("New trip wizard inputs not found. Re-initializing modal.");
        ensureNewTripModal(); // 복구 시도
        showToast("입력 폼 오류가 발생했어요. 다시 시도해주세요 😢", 'error');
        return;
    }

    let title = truncateTripTitle(rawTitle, TRIP_TITLE_MAX_LENGTH);

    if (!location) {
        showToast("여행지를 먼저 선택해 주세요. ✨", 'warning');
        nextWizardStep(1);
        return;
    }

    if (!validateTripDateRange(startInput, endInput, { showToast, showMessage: false })) {
        showToast("여행 날짜를 입력해주세요! ✨", 'warning');
        return;
    }

    // 제목이 비어있으면 "여행지명 + 여행"으로 자동 생성
    if (!title && location) {
        title = truncateTripTitle(`${location} 여행`, TRIP_TITLE_MAX_LENGTH);
    } else if (!title) {
        showToast("여행 제목을 입력해주세요! ✨", 'warning');
        return;
    }

    showLoading();

    try {
        if (isGuestMode) {
            const currentUid = currentUser?.uid || "guest_user";
            const newTrip = buildTripCreatePayload({
                title,
                startDate,
                endDate,
                location,
                defaultTravelData,
                newTripDataTemp,
                currentUid,
                normalizeGooglePhotoUrl
            });

            // [Guest Mode] Firestore 저장 없이 로컬 상태만 업데이트
            setTravelData(newTrip);
            setCurrentTripId(null);
            closeNewTripModal();

            // [New] 게스트 모드 초기 수정 모드 활성화
            setIsEditing(true);
            window.isGlobalEditMode = true;

            // 편집기 뷰로 전환
            document.getElementById('main-view')?.classList.add('hidden');
            document.getElementById('detail-view')?.classList.remove('hidden');
            document.getElementById('back-btn')?.classList.remove('hidden');

            renderItinerary();

            // [New] 수정 버튼 UI 업데이트 (즉시 반영)
            const lockBtn = document.getElementById('memory-lock-btn');
            if (lockBtn) {
                lockBtn.innerHTML = `<span class="material-symbols-outlined text-xl">check</span><span class="text-sm font-bold ml-1">수정 완료</span>`;
                lockBtn.classList.remove('bg-primary', 'hover:bg-orange-500');
                lockBtn.classList.add('btn-active');
            }

            showToast("게스트 모드로 여행을 시작합니다! 수정 모드가 자동으로 켜졌어요. ✨");
        } else {
            const result = await fetchBackendJson('/plans', {
                method: 'POST',
                body: {
                    title,
                    startDate,
                    endDate,
                    location,
                    place: {
                        latitude: newTripDataTemp?.lat ?? null,
                        longitude: newTripDataTemp?.lng ?? null,
                        mapImageUrl: normalizeGooglePhotoUrl(newTripDataTemp?.mapImage, 1600) || ''
                    }
                }
            });
            closeNewTripModal();
            if (result?.trip?.id && window.openTrip) {
                window.openTrip(result.trip.id, { editMode: true });
            }
        }

    } catch (e) {
        console.error("Error creating trip:", e);
        alert("여행 생성 중 오류가 발생했습니다: " + e.message);
    } finally {
        hideLoading();
    }
}

export function deleteTrip(tripId) {
    window.openConfirmationModal(
        "여행 계획 삭제",
        "정말 이 여행 계획을 보내주시겠습니까? 🗑️\n삭제된 여행은 복구할 수 없습니다.",
        async () => {
            try {
                showLoading();
                await fetchBackendJson(`/plans/${encodeURIComponent(tripId)}`, {
                    method: 'DELETE'
                });
                if (currentUser) loadTripList(currentUser.uid);
            } catch (e) {
                console.error("Error deleting trip:", e);
                alert("삭제 실패: " + e.message);
            } finally {
                hideLoading();
            }
        }
    );
}

// [Duplicate Trip Logic]

let pendingDuplicateTripId = null;

function ensureCopyOptionsModal() {
    let modal = document.getElementById('copy-options-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'copy-options-modal';
        modal.className = 'fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
        // 📌 [Fix] Z-Index consistency: Use Z_INDEX.MODAL_SYSTEM (400)
        modal.style.zIndex = Z_INDEX.MODAL_SYSTEM;
        modal.innerHTML = `
                <div class="modal-surface-card copy-options-modal-card bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transform transition-all scale-100">
                    <div class="modal-surface-body p-6">
                        <h3 class="text-xl font-bold mb-2 text-gray-800 dark:text-white">여행 사본 만들기</h3>
                        <p class="text-sm text-gray-500 mb-6">새 여행에 담을 항목을 선택해 주세요.</p>

                        <div class="space-y-3 mb-8">
                            <label class="copy-option-card flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-region" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">지역 및 날짜</span>
                                        <span class="text-xs text-gray-400">여행지 정보와 기간 설정</span>
                                    </div>
                            </label>
                            <label class="copy-option-card flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-places" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">일정 (장소)</span>
                                        <span class="text-xs text-gray-400">방문할 장소와 이동 수단</span>
                                    </div>
                            </label>
                            <label class="copy-option-card flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-memos" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">메모</span>
                                        <span class="text-xs text-gray-400">작성한 메모 사항</span>
                                    </div>
                            </label>
                            <label class="copy-option-card flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-budget" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">예산 및 지출</span>
                                        <span class="text-xs text-gray-400">가계부 내역 및 예산 설정</span>
                                    </div>
                            </label>
                            <label class="copy-option-card flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-shopping" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">쇼핑리스트</span>
                                        <span class="text-xs text-gray-400">구매할 물품 목록</span>
                                    </div>
                            </label>
                            <label class="copy-option-card flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-supplies" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">준비물</span>
                                        <span class="text-xs text-gray-400">체크리스트</span>
                                    </div>
                            </label>
                        </div>

                        <div class="flex justify-end gap-3">
                            <button data-action="close-copy-modal" class="modal-secondary-button px-5 py-2.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-bold transition-colors">취소</button>
                            <button data-action="execute-duplicate" class="modal-primary-button px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 dark:shadow-none flex items-center gap-2">
                                <span class="material-symbols-outlined text-sm">content_copy</span> 사본 만들기
                            </button>
                        </div>
                    </div>
            </div >
                `;
        document.body.appendChild(modal);
    }
    return modal;
}

export function closeCopyOptionsModal() {
    const modal = document.getElementById('copy-options-modal');
    if (modal) {
        modal.classList.add('hidden');
        resetDuplicateOptions(modal);
    }
    pendingDuplicateTripId = null;
}
window.closeCopyOptionsModal = closeCopyOptionsModal;

export async function duplicateTrip(tripId) {
    try {
        pendingDuplicateTripId = tripId;
        ensureCopyOptionsModal().classList.remove('hidden');
    } catch (e) {
        console.error(e);
        alert("데이터 로드 실패: " + e.message);
    }
}
window.duplicateTrip = duplicateTrip;

export async function executeDuplicate() {
    if (!pendingDuplicateTripId) return;

    try {
        showLoading();
        const duplicateOptions = readDuplicateOptions();
        await fetchBackendJson(`/plans/${encodeURIComponent(pendingDuplicateTripId)}/duplicate`, {
            method: 'POST',
            body: {
                duplicateOptions
            }
        });

        closeCopyOptionsModal();
        if (currentUser) loadTripList(currentUser.uid);

        showToast("여행 사본을 만들었어요.");

    } catch (e) {
        console.error(e);
        alert("사본 만들기 실패: " + e.message);
    } finally {
        hideLoading();
    }
}
window.executeDuplicate = executeDuplicate;

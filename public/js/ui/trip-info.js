// Trip Info Editor Module
// Handles editing trip metadata (title, dates, hero image)
import { auth } from '../firebase.js';
import { showToast, showLoading, hideLoading } from './modals.js';
import { normalizeGooglePhotoUrl, extractGooglePhotoReference } from '../ui-utils.js';
import { BACKEND_URL } from '../config.js';
import { fetchBackendJson } from '../services/backend/api-client.js';
import { ensureDayPlanBranchState, switchDayPlan } from './plan-branches.js';
import { saveTripInfoFlow, updateDateRangeFlow } from '../features/trip-info/trip-info-flow.js';

const FALLBACK_HERO_IMAGE = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop";
const IMAGE_CHECK_TIMEOUT_MS = 7000;
const UNSPLASH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const UNSPLASH_CACHE_PREFIX = "trip_hero_unsplash_";

function canLoadImage(url, timeoutMs = IMAGE_CHECK_TIMEOUT_MS) {
    return new Promise((resolve) => {
        if (!url) {
            resolve(false);
            return;
        }

        const img = new Image();
        const timer = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            resolve(false);
        }, timeoutMs);

        img.onload = () => {
            clearTimeout(timer);
            resolve(true);
        };

        img.onerror = () => {
            clearTimeout(timer);
            resolve(false);
        };

        img.src = url;
    });
}

function isGenericFallbackImage(url = '') {
    const raw = String(url || '').trim();
    if (!raw) return true;
    return raw.includes('photo-1488646953014-85cb44e25828');
}

function normalizeSearchQuery(raw = '') {
    let query = String(raw || '').trim();
    if (!query) return '';

    query = query.split('•')[0].trim();
    query = query.split('|')[0].trim();
    query = query.replace(/\d{4}[./-]\d{1,2}[./-]\d{1,2}.*/g, '').trim();
    query = query.replace(/\d{1,2}월\s*\d{1,2}일.*/g, '').trim();
    query = query.replace(/\s{2,}/g, ' ');
    query = query.replace(/([가-힣]{2,})(특별시|광역시|특별자치시|특별자치도|도|시|군|구|부|현)$/g, '$1');
    return query;
}

function buildLocationQueryCandidates(meta = {}) {
    const rawCandidates = [
        meta.locationName,
        meta.location,
        meta.subInfo,
        meta.title
    ];

    const seen = new Set();
    const candidates = [];
    rawCandidates.forEach((raw) => {
        const query = normalizeSearchQuery(raw);
        if (!query || query.length < 2) return;
        if (seen.has(query)) return;
        seen.add(query);
        candidates.push(query);
    });

    return candidates;
}

function getUnsplashCache(query) {
    try {
        const key = `${UNSPLASH_CACHE_PREFIX}${query.toLowerCase()}`;
        const cached = localStorage.getItem(key);
        if (!cached) return '';

        const { url, timestamp } = JSON.parse(cached);
        if (!url || !timestamp) return '';
        if (Date.now() - Number(timestamp) > UNSPLASH_CACHE_TTL_MS) {
            localStorage.removeItem(key);
            return '';
        }
        return url;
    } catch (error) {
        return '';
    }
}

function setUnsplashCache(query, url) {
    try {
        const key = `${UNSPLASH_CACHE_PREFIX}${query.toLowerCase()}`;
        localStorage.setItem(key, JSON.stringify({ url, timestamp: Date.now() }));
    } catch (error) {
        // localStorage 사용 불가 또는 quota 초과는 무시
    }
}

async function fetchUnsplashHeroImage(query) {
    if (!query || !BACKEND_URL) return '';

    const cached = getUnsplashCache(query);
    if (cached) {
        console.info("[TripImage] Unsplash 캐시 사용", { query, url: cached });
        return cached;
    }

    try {
        const data = await fetchBackendJson(`/unsplash-proxy?query=${encodeURIComponent(query)}`);
        const url =
            data?.results?.[0]?.urls?.regular ||
            data?.results?.[0]?.urls?.full ||
            data?.results?.[0]?.urls?.small ||
            '';
        if (url) {
            setUnsplashCache(query, url);
        }
        return url;
    } catch (error) {
        console.warn("[TripImage] Unsplash fetch failed:", error);
        return '';
    }
}

async function fetchGoogleHeroImageByCoords(lat, lng) {
    if (!BACKEND_URL) return '';
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return '';
    if (!window.google?.maps?.places) return '';

    return new Promise((resolve) => {
        try {
            const service = new google.maps.places.PlacesService(document.createElement('div'));
            const location = new google.maps.LatLng(Number(lat), Number(lng));
            service.nearbySearch({ location, radius: 2000 }, (results, status) => {
                if (
                    status !== google.maps.places.PlacesServiceStatus.OK ||
                    !Array.isArray(results) ||
                    !results.length
                ) {
                    console.info("[TripImage] Google 좌표 기반 검색 실패", { status });
                    resolve('');
                    return;
                }

                const withPhoto = results.find((result) => Array.isArray(result?.photos) && result.photos.length > 0);
                const photo = withPhoto?.photos?.[0];
                if (!photo) {
                    resolve('');
                    return;
                }

                let reference = photo.photo_reference || '';
                if (!reference && typeof photo.getPhotoReference === 'function') {
                    try {
                        reference = photo.getPhotoReference() || '';
                    } catch (error) {
                        reference = '';
                    }
                }
                if (!reference && typeof photo.getUrl === 'function') {
                    const rawUrl = photo.getUrl({ maxWidth: 1600, maxHeight: 1200 });
                    reference = extractGooglePhotoReference(rawUrl);
                }

                if (!reference) {
                    resolve('');
                    return;
                }

                resolve(`${BACKEND_URL}/google-photo-proxy?reference=${encodeURIComponent(reference)}&maxwidth=1600`);
            });
        } catch (error) {
            console.warn("[TripImage] Google nearby fallback failed:", error);
            resolve('');
        }
    });
}

async function persistTripInfoViaBackend(input) {
    const tripId = String(window.currentTripId || '').trim();
    const user = auth.currentUser;

    if (!tripId || !user) {
        return null;
    }

    const result = await fetchBackendJson(`/plans/${encodeURIComponent(tripId)}/meta`, {
        method: 'PATCH',
        body: {
            ...input,
            sourceClient: 'web'
        }
    });

    return result?.trip || null;
}

function applyPersistedTripState(trip) {
    if (!trip || typeof trip !== 'object') {
        return;
    }

    const currentData = window.travelData || {};
    const nextTrip = {
        ...currentData,
        ...trip,
        meta: trip.meta || currentData.meta,
        days: Array.isArray(trip.days) ? trip.days : currentData.days,
        shoppingList: trip.shoppingList ?? currentData.shoppingList ?? [],
        checklist: trip.checklist ?? currentData.checklist ?? []
    };

    window.setTravelData?.(nextTrip);
    if (trip.id) {
        window.currentTripId = trip.id;
        window.setCurrentTripId?.(trip.id);
    }
}

/**
 * Close the trip info modal
 */
export function closeTripInfoModal() {
    document.getElementById('trip-info-modal').classList.add('hidden');
}

/**
 * Save trip info from the modal
 * @param {Object} travelData - Travel data object to update
 * @param {number} currentDayIndex - Current selected day index
 * @param {Function} updateMeta - Function to update metadata
 * @param {Function} selectDay - Function to select a day
 * @param {Function} renderItinerary - Function to re-render itinerary
 * @param {Function} autoSave - Function to auto-save data
 */
export function saveTripInfo(travelData, currentDayIndex, updateMeta, selectDay, renderItinerary, autoSave) {
    return saveTripInfoFlow({
        travelData,
        currentDayIndex,
        updateMeta,
        selectDay,
        renderItinerary,
        autoSave,
        closeTripInfoModal,
        showToast,
        persistTripInfo: window.currentTripId && auth.currentUser ? persistTripInfoViaBackend : null,
        applyPersistedTrip: applyPersistedTripState
    });
}

/**
 * Reset hero image to default
 * @param {Object} travelData - Travel data object
 * @param {Function} updateMeta - Function to update metadata
 * @param {Function} renderItinerary - Function to re-render itinerary
 * @param {Function} autoSave - Function to auto-save data
 */
export async function resetHeroImage(travelData, updateMeta, renderItinerary, autoSave) {
    if (!confirm("배경 이미지를 초기 설정된 이미지로 되돌리시겠습니까?")) return;

    const normalizedDefault = normalizeGooglePhotoUrl(travelData?.meta?.defaultMapImage, 1600);
    const normalizedCover = normalizeGooglePhotoUrl(travelData?.meta?.coverImage, 1600);
    const queryCandidates = buildLocationQueryCandidates(travelData?.meta || {});
    const hasCoords =
        Number.isFinite(Number(travelData?.meta?.lat)) &&
        Number.isFinite(Number(travelData?.meta?.lng));

    console.info("[TripImage] 복구 시도", {
        defaultMapImage: normalizedDefault || "",
        coverImage: normalizedCover || "",
        queryCandidates,
        hasCoords
    });

    showLoading();
    try {
        const candidates = [];
        if (normalizedDefault) {
            candidates.push({ source: 'defaultMapImage', url: normalizedDefault });
        }
        if (normalizedCover && normalizedCover !== normalizedDefault) {
            candidates.push({ source: 'coverImage', url: normalizedCover });
        }

        const needsDynamicSearch = !normalizedDefault || isGenericFallbackImage(normalizedDefault);
        if (needsDynamicSearch) {
            for (const query of queryCandidates) {
                const unsplashImage = await fetchUnsplashHeroImage(query);
                console.info("[TripImage] Unsplash 검색 결과", { query, found: Boolean(unsplashImage) });
                if (unsplashImage) {
                    candidates.unshift({ source: `unsplash:${query}`, url: unsplashImage });
                    break;
                }
            }

            if (!candidates.some((candidate) => candidate.source.startsWith('unsplash:'))) {
                const googleImage = await fetchGoogleHeroImageByCoords(travelData?.meta?.lat, travelData?.meta?.lng);
                console.info("[TripImage] Google 좌표 기반 후보", { found: Boolean(googleImage) });
                if (googleImage) {
                    candidates.unshift({ source: 'google-nearby', url: googleImage });
                }
            }
        }

        candidates.push({ source: 'fallback', url: FALLBACK_HERO_IMAGE });

        let finalImage = FALLBACK_HERO_IMAGE;
        let selectedSource = 'fallback';
        for (const candidate of candidates) {
            const normalizedCandidate = normalizeGooglePhotoUrl(candidate.url, 1600) || candidate.url;
            const isLoadable = await canLoadImage(normalizedCandidate);
            console.info("[TripImage] 후보 검증", {
                source: candidate.source,
                url: normalizedCandidate,
                isLoadable
            });
            if (isLoadable) {
                finalImage = normalizedCandidate;
                selectedSource = candidate.source;
                break;
            }
        }

        if (selectedSource === 'fallback') {
            showToast("기본 이미지 복구에 실패해서 대체 이미지를 적용했어요.", "warning");
        }

        updateMeta('defaultMapImage', finalImage);
        updateMeta('mapImage', finalImage);
        renderItinerary();
        autoSave();

        console.info("[TripImage] 복구 적용 완료", {
            finalImage,
            selectedSource,
            queryCandidates
        });
    } catch (error) {
        console.error("[TripImage] 복구 처리 중 오류:", error);
        showToast("이미지 복구 중 오류가 발생했습니다.", "error");
    } finally {
        hideLoading();
    }
}

/**
 * Delete hero image
 * @param {Function} updateMeta - Function to update metadata
 * @param {Function} renderItinerary - Function to re-render itinerary
 * @param {Function} autoSave - Function to auto-save data
 */
export function deleteHeroImage(updateMeta, renderItinerary, autoSave) {
    if (confirm("배경 이미지를 삭제하고 기본 배경으로 돌아가시겠습니까?")) {
        updateMeta('mapImage', "");
        renderItinerary();
        autoSave();
    }
}

/**
 * Upload custom hero image
 * @param {File} file - Image file to upload
 * @param {Function} updateMeta - Function to update metadata
 * @param {Function} renderItinerary - Function to re-render itinerary
 * @param {Function} autoSave - Function to auto-save data
 */
export function uploadHeroImage(file, updateMeta, renderItinerary, autoSave) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageData = e.target.result;
        updateMeta('mapImage', imageData);
        renderItinerary();
        autoSave();
    };
    reader.readAsDataURL(file);
}

/**
 * Save all day data to Firestore
 * Used for syncing guest data after login or force full sync
 * @param {string|null} tripId - Target trip ID (null if new)
 * @param {Object} data - Full travel data to save
 */
export async function saveAllDayData(tripId, data) {
    try {
        showLoading();
        const user = auth.currentUser;
        if (!user) throw new Error("계정이 확인되지 않습니다.");

        const cleanData = JSON.parse(JSON.stringify(data)); // Deep copy to avoid reference issues

        if (tripId) {
            await fetchBackendJson(`/plans/${encodeURIComponent(tripId)}/content`, {
                method: 'PUT',
                body: {
                    trip: cleanData,
                    sourceClient: 'web'
                }
            });
            showToast("데이터가 성공적으로 동기화되었습니다! ☁️");
        } else {
            await fetchBackendJson('/plans/import', {
                method: 'POST',
                body: {
                    trip: cleanData
                }
            });
            showToast("새 여행 계획이 저장되었습니다! 🎉");

            // 메인 화면으로 이동하거나 해당 여행 로드
            setTimeout(() => {
                window.location.href = window.location.origin + window.location.pathname;
            }, 1500);
        }
    } catch (e) {
        console.error("Error saving all day data:", e);
        showToast("저장 중 오류가 발생했습니다 😢", 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Select a day by index
 * @param {number} index - Day index
 */
export function selectDay(index, planType = null) {
    if (Array.isArray(window.travelData?.days)) {
        window.travelData.days.forEach(ensureDayPlanBranchState);
    }

    if (index !== -1 && Array.isArray(window.travelData?.days)) {
        const day = window.travelData.days[index];
        if (day) {
            ensureDayPlanBranchState(day);
            if (typeof planType === 'string') {
                switchDayPlan(day, planType);
            }
        }
    }

    window.setCurrentDayIndex?.(index);
    if (index !== -1) {
        window.setTargetDayIndex?.(index);
    }

    // 날짜에 맞는 날씨 업데이트
    const day = index !== -1 ? window.travelData?.days[index] : window.travelData?.days[0];
    if (day && day.date && window.travelData?.meta.lat && window.travelData?.meta.lng) {
        window.fetchWeather?.(window.travelData.meta.lat, window.travelData.meta.lng, day.date);
    }

    // [Fix] 단순 렌더링 대신 재계산을 통해 데이터 정합성 보장 (오염된 필드 자동 제거)
    // recalculateTimeline 내부에서 renderItinerary와 autoSave가 호출됨
    if (index !== -1) {
        window.recalculateTimeline?.(index);
    } else {
        window.renderItinerary?.();
    }
}

/**
 * Update trip metadata
 * @param {string} key - Metadata key
 * @param {*} value - Metadata value
 */
export function updateMeta(key, value) {
    window.updateMetaState?.(key, value);
    window.renderItinerary?.();
    window.autoSave?.();
}

/**
 * Update trip date for a specific day
 * @param {number} dayIndex - Day index
 * @param {string} newDate - New date
 */
export function updateTripDate(dayIndex, newDate) {
    window.updateTripDateState?.(dayIndex, newDate);
    // 날씨 업데이트 (map.js의 fetchWeather가 window에 있다면 호출)
    if (window.fetchWeather && window.travelData?.meta.lat && window.travelData?.meta.lng) {
        window.fetchWeather(window.travelData.meta.lat, window.travelData.meta.lng, newDate);
    }
    window.renderItinerary?.();
    window.autoSave?.();
}

/**
 * Update date range (start and end dates)
 */
export function updateDateRange() {
    return updateDateRangeFlow({
        travelData: window.travelData,
        updateMetaState: window.updateMetaState,
        renderItinerary: window.renderItinerary,
        autoSave: window.autoSave,
        confirmShrink: (message) => confirm(message),
        alertFn: (message) => alert(message),
        showToast,
        persistTripInfo: window.currentTripId && auth.currentUser ? persistTripInfoViaBackend : null,
        applyPersistedTrip: applyPersistedTripState
    });
}

/**
 * Open location search for setting trip location
 */
export function openLocationSearch() {
    closeTripInfoModal();
    try {
        window.setSearchMode?.('trip');
    } catch (e) {
        console.debug('setSearchMode not available yet');
    }
    const modal = document.getElementById('item-modal');

    // 위치 설정 모드: 검색창 외 다른 입력 필드 숨기기
    const gridChildren = modal.querySelectorAll('.grid > div');
    gridChildren.forEach((el, index) => {
        if (index > 0) el.classList.add('hidden');
    });
    document.getElementById('save-item-btn').classList.add('hidden');
    modal.querySelector('h3').innerText = "여행지 위치 설정";

    modal.classList.remove('hidden');
    document.getElementById('place-search').value = "";
    document.getElementById('place-search').focus();
    setupItemAutocomplete();
}

/**
 * Setup Google Maps autocomplete for location search
 * @private
 */
let itemAutocompleteInstance = null;
export const tempItemCoords = { lat: null, lng: null };

export function setupItemAutocomplete() {
    const input = document.getElementById('place-search');
    if (!input || !window.google) return;

    if (itemAutocompleteInstance) {
        google.maps.event.clearInstanceListeners(itemAutocompleteInstance);
    }

    const options = {
        fields: ["formatted_address", "geometry", "name"],
        strictBounds: false,
    };

    // 장소명 입력란에 엔터 키 이벤트 리스너 추가
    const itemTitleInput = document.getElementById('item-title');
    if (itemTitleInput && !itemTitleInput.dataset.hasEnterListener) {
        itemTitleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.saveNewItem?.();
            }
        });
        itemTitleInput.dataset.hasEnterListener = 'true';
    }

    itemAutocompleteInstance = new google.maps.places.Autocomplete(input, options);
    itemAutocompleteInstance.addListener("place_changed", () => {
        const place = itemAutocompleteInstance.getPlace();

        if (!place.geometry || !place.geometry.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        if (window.searchMode === 'trip') {
            updateMeta('title', place.name);
            updateMeta('subInfo', place.formatted_address);
            updateMeta('lat', lat);
            updateMeta('lng', lng);

            if (window.travelData?.days && window.travelData.days.length > 0) {
                window.fetchWeather?.(lat, lng, window.travelData.days[0].date);
            }
            window.renderItinerary?.();
            window.closeModal?.();
        } else {
            tempItemCoords.lat = lat;
            tempItemCoords.lng = lng;
            document.getElementById('item-title').value = place.name;
            document.getElementById('item-location').value = place.formatted_address;
            document.getElementById('item-title').focus();
        }
    });
}

/**
 * Toggle global edit mode (for all memories/items)
 */
export function updateGlobalEditModeButton(isEditMode) {
    const buttons = document.querySelectorAll('[data-role="global-edit-toggle"]');
    buttons.forEach((btn) => {
        btn.innerHTML = isEditMode
            ? '<span class="material-symbols-outlined text-xl">edit</span>'
            : '<span class="material-symbols-outlined text-xl">check</span>';
        btn.setAttribute('aria-label', isEditMode ? '수정 완료' : '수정 모드');
        btn.setAttribute('title', isEditMode ? '수정 완료' : '수정 모드');

        // Base(primary) style and active(completed) style are toggled explicitly.
        // Avoid relying on `.btn-active` because CSS bundle mismatch can make it transparent.
        btn.classList.remove(
            'bg-primary',
            'hover:bg-orange-500',
            'bg-gray-900',
            'hover:bg-gray-800',
            'bg-transparent',
            'border',
            'border-gray-400',
            'text-white',
            'text-gray-700',
            'hover:bg-gray-100',
            'dark:border-gray-600',
            'dark:text-gray-300',
            'dark:hover:bg-gray-800',
            'btn-active'
        );
        if (isEditMode) {
            btn.classList.add('bg-primary', 'text-white', 'hover:bg-orange-500');
        } else {
            btn.classList.add(
                'bg-transparent',
                'border',
                'border-gray-400',
                'text-gray-700',
                'hover:bg-gray-100',
                'dark:border-gray-600',
                'dark:text-gray-300',
                'dark:hover:bg-gray-800'
            );
        }
    });

    updateEditModeVisualCues(isEditMode);
}

function updateEditModeVisualCues(isEditMode) {
    const hero = document.getElementById('trip-hero');
    const heroOverlay = document.getElementById('trip-hero-edit-overlay');
    const heroEditIcon = document.getElementById('trip-hero-edit-icon');
    const tripInfoContainer = document.getElementById('trip-info-container');

    if (hero) {
        hero.classList.toggle('cursor-pointer', isEditMode);
    }

    if (heroOverlay) {
        heroOverlay.classList.remove('bg-black/20', 'bg-black/45');
        heroOverlay.classList.add(isEditMode ? 'bg-black/45' : 'bg-black/20');
    }

    if (heroEditIcon) {
        heroEditIcon.classList.toggle('hidden', !isEditMode);
        heroEditIcon.classList.toggle('flex', isEditMode);
    }

    if (tripInfoContainer) {
        tripInfoContainer.classList.toggle('cursor-pointer', isEditMode);
        tripInfoContainer.classList.toggle('rounded-2xl', isEditMode);
        tripInfoContainer.classList.toggle('ring-2', isEditMode);
        tripInfoContainer.classList.toggle('ring-primary/40', isEditMode);
        tripInfoContainer.classList.toggle('bg-primary/5', isEditMode);
        tripInfoContainer.classList.toggle('shadow-sm', isEditMode);
    }
}

export function toggleGlobalEditMode() {
    window.isGlobalEditMode = !window.isGlobalEditMode;

    const dbBtnStr = document.getElementById('dashboard-btn-text');

    if (window.isGlobalEditMode) {
        updateGlobalEditModeButton(true);
        showToast("수정 모드가 켜졌습니다. 일정을 편집할 수 있습니다.", "info");
    } else {
        updateGlobalEditModeButton(false);
        showToast("수정 모드가 꺼졌습니다.", "success");
    }

    window.renderItinerary?.();
    // [Fix] 모달이나 다른 UI도 갱신 필요시 여기서 호출
}

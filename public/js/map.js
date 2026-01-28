import { travelData, newTripDataTemp, currentDayIndex } from './state.js';
import { BACKEND_URL } from './config.js';
import logger from './logger.js';

export let map;
export let mapMarker;
export let isMapInitialized = false; // [Added] 지도 초기화 상태 플래그
let autocomplete;
let wizardAutocomplete;
let tripInfoAutocomplete;

// [Mapbox Configuration]
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간 캐시 유지

async function fetchUnsplashImage(query) {
    const cacheKey = `unsplash_img_${query}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const { url, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
                return url; // 캐시된 이미지 반환 (API 호출 안 함)
            }
        } catch (e) {
            localStorage.removeItem(cacheKey);
        }
    }

    try {
        // 백엔드 프록시 서버 호출 (API 키 노출 방지)
        const res = await fetch(`${BACKEND_URL}/unsplash-proxy?query=${encodeURIComponent(query)}`);

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: res.statusText }));
            console.error("Unsplash Proxy Error:", errorData);
            return null;
        }

        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const url = data.results[0].urls.regular;
            try {
                localStorage.setItem(cacheKey, JSON.stringify({ url, timestamp: Date.now() }));
            } catch (e) { console.warn('LocalStorage full', e); }
            return url;
        }
    } catch (e) {
        console.error("Unsplash Image Fetch Error:", e);
    }
    return null;
}

export let searchMode = 'item'; // 'item' or 'trip'

export function setSearchMode(mode) {
    searchMode = mode;
}

// Google Maps 인증 실패 처리
export function gm_authFailure() {
    console.error("Google Maps API Authentication Error. Please check your API Key settings in Google Cloud Console.");
    alert("Google 지도 로드 실패: API 키 설정을 확인하세요. (자세한 내용은 콘솔 확인)");
}

// 엔터 키 입력 시 첫 번째 검색 결과 자동 선택
function handleEnterKey(e) {
    if (e.key === 'Enter') {
        const containers = document.querySelectorAll('.pac-container');
        let visibleContainer = null;
        for (const c of containers) {
            // [Fix] offsetParent can be null if hidden
            if (c.offsetParent && c.querySelector('.pac-item')) {
                visibleContainer = c;
                break;
            }
        }

        if (visibleContainer) {
            // 이미 선택된 항목이 있으면 패스
            if (visibleContainer.querySelector('.pac-item-selected')) return;

            // 선택된 항목이 없으면 첫 번째 항목 자동 선택 시도 (ArrowDown -> Enter 시뮬레이션)
            e.preventDefault();
            e.stopPropagation();
            const input = e.target;

            // 1. ArrowDown 이벤트 발송 (첫 번째 항목 선택 유도)
            const arrowDownEvent = new KeyboardEvent('keydown', {
                key: 'ArrowDown',
                code: 'ArrowDown',
                bubbles: true,
                cancelable: true
            });
            Object.defineProperty(arrowDownEvent, 'keyCode', { get: () => 40 });
            Object.defineProperty(arrowDownEvent, 'which', { get: () => 40 });
            input.dispatchEvent(arrowDownEvent);

            // 2. Enter 이벤트 발송 (선택된 항목 확정)
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true
            });
            Object.defineProperty(enterEvent, 'keyCode', { get: () => 13 });
            Object.defineProperty(enterEvent, 'which', { get: () => 13 });
            input.dispatchEvent(enterEvent);
        }
    }
}

export function setupAutocomplete() {
    const input = document.getElementById("place-search");
    if (!input || !window.google || !window.google.maps || !window.google.maps.places) return;

    if (!input.dataset.hasEnterListener) {
        input.addEventListener('keydown', handleEnterKey);
        input.dataset.hasEnterListener = "true";
    }

    if (autocomplete) return; // 이미 초기화됨

    const options = {
        fields: ["formatted_address", "geometry", "name", "formatted_phone_number", "photos", "address_components"],
        strictBounds: false,
    };

    try {
        // [Migration] google.maps.places.Autocomplete 경고 해결 - 최신 방식 시도
        // PlaceAutocompleteElement는 웹 컴포넌트 방식이나, 기존 인스턴스 방식의 경고를 최소화하기 위해 
        // options와 필드를 최신 가이드에 맞게 조정
        autocomplete = new google.maps.places.Autocomplete(input, options);
        autocomplete.addListener("place_changed", fillInAddress);
    } catch (e) {
        logger.error("Autocomplete setup failed:", e);
    }
}

export function setupWizardAutocomplete() {
    const input = document.getElementById("new-trip-location");
    if (!input || !window.google || !window.google.maps || !window.google.maps.places) return;

    if (!input.dataset.hasEnterListener) {
        input.addEventListener('keydown', handleEnterKey);
        input.dataset.hasEnterListener = "true";
    }

    if (wizardAutocomplete) return;

    const options = {
        fields: ["formatted_address", "geometry", "name", "photos", "address_components"],
        strictBounds: false
    };

    wizardAutocomplete = new google.maps.places.Autocomplete(input, options);
    wizardAutocomplete.addListener("place_changed", () => {
        const place = wizardAutocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        newTripDataTemp.locationName = place.name;
        newTripDataTemp.address = place.formatted_address;
        newTripDataTemp.lat = place.geometry.location.lat();
        newTripDataTemp.lng = place.geometry.location.lng();

        if (place.photos && place.photos.length > 0) {
            newTripDataTemp.mapImage = place.photos[0].getUrl({ maxWidth: 4000, maxHeight: 3000 });
        }

        // 랜드마크 검색으로 더 좋은 사진 찾기
        let searchQuery = place.name;

        // [Modified] 장소가 도시/국가 등 지역 그 자체라면 굳이 세부 행정구역명으로 덮어쓰지 않음
        const isRegion = place.types && (
            place.types.includes('locality') ||
            place.types.includes('administrative_area_level_1') ||
            place.types.includes('country')
        );

        if (!isRegion && place.address_components) {
            const locality = place.address_components.find(c => c.types.includes('locality'));
            const admin = place.address_components.find(c => c.types.includes('administrative_area_level_1'));
            if (locality) {
                searchQuery = locality.long_name;
            } else if (admin) {
                searchQuery = admin.long_name;
            }
        }

        // 한국어 행정구역 접미사 제거 (Unsplash 검색 정확도 향상)
        // 예: "도쿄도" -> "도쿄", "오사카부" -> "오사카", "후쿠오카현" -> "후쿠오카"
        searchQuery = searchQuery.replace(/([가-힣]{2,})(특별시|광역시|특별자치시|특별자치도|도|시|군|구|부|현)$/, '$1');

        logger.debug(`Unsplash Search Query: ${searchQuery}`);

        // Unsplash에서 고화질 배경 검색
        fetchUnsplashImage(searchQuery).then(url => {
            if (url) {
                newTripDataTemp.mapImage = url;
            }
        });
    });
}

export function setupTripInfoAutocomplete() {
    const input = document.getElementById("edit-trip-location");
    if (!input || !window.google || !window.google.maps || !window.google.maps.places) return;

    if (!input.dataset.hasEnterListener) {
        input.addEventListener('keydown', handleEnterKey);
        input.dataset.hasEnterListener = "true";
    }

    if (tripInfoAutocomplete) return;

    const options = {
        fields: ["formatted_address", "geometry", "name", "photos", "address_components"],
        strictBounds: false
    };

    tripInfoAutocomplete = new google.maps.places.Autocomplete(input, options);
    tripInfoAutocomplete.addListener("place_changed", () => {
        const place = tripInfoAutocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        // [Modified] 제목이 비어있을 때만 추천 장소명으로 채움
        const titleInput = document.getElementById('edit-trip-title');
        if (titleInput && !titleInput.value.trim()) {
            titleInput.value = place.name;
            if (window.updateMeta) window.updateMeta('title', place.name);
        }

        // 장소 필드 및 subInfo 업데이트 (UI 반응용)
        if (input) input.value = place.formatted_address;
        if (window.updateMeta) {
            // subInfo 재조합 로직 (장소 + 날짜)
            const dateStr = travelData.meta.subInfo && travelData.meta.subInfo.includes('•')
                ? travelData.meta.subInfo.split('•')[1].trim()
                : travelData.meta.subInfo;
            window.updateMeta('subInfo', `${place.formatted_address} • ${dateStr}`);
        }

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        // 좌표 저장
        travelData.meta.lat = lat;
        travelData.meta.lng = lng;

        // 대표 이미지 업데이트
        if (place.photos && place.photos.length > 0) {
            const photoUrl = place.photos[0].getUrl({ maxWidth: 4000, maxHeight: 3000 });
            if (window.updateMeta) {
                window.updateMeta('mapImage', photoUrl);
                window.updateMeta('defaultMapImage', photoUrl);
            }
        }

        // Unsplash 고화질 배경 검색 (기존 로직 재활용)
        let searchQuery = place.name;
        const isRegion = place.types && (
            place.types.includes('locality') ||
            place.types.includes('administrative_area_level_1') ||
            place.types.includes('country')
        );

        if (!isRegion && place.address_components) {
            const locality = place.address_components.find(c => c.types.includes('locality'));
            const admin = place.address_components.find(c => c.types.includes('administrative_area_level_1'));
            if (locality) searchQuery = locality.long_name;
            else if (admin) searchQuery = admin.long_name;
        }
        searchQuery = searchQuery.replace(/([가-힣]{2,})(특별시|광역시|특별자치시|특별자치도|도|시|군|구|부|현)$/, '$1');

        fetchUnsplashImage(searchQuery).then(url => {
            if (url && window.updateMeta) {
                window.updateMeta('mapImage', url);
                window.updateMeta('defaultMapImage', url);

                // 히로 및 배경 업데이트
                const mapBg = document.getElementById('map-bg');
                if (mapBg) mapBg.style.backgroundImage = `url('${url}')`;
                const heroEl = document.getElementById('trip-hero');
                if (heroEl) heroEl.style.backgroundImage = `url('${url}')`;
            }
        });

        // 지도 및 날씨 업데이트
        if (map) map.setCenter({ lat, lng });
        if (mapMarker) mapMarker.setPosition({ lat, lng });

        const currentDate = travelData.days && travelData.days[currentDayIndex] ? travelData.days[currentDayIndex].date : null;
        fetchWeather(lat, lng, currentDate);

        if (window.renderItinerary) window.renderItinerary();
    });
}

// [Sync Warning] 이 로직은 viewer.js의 initViewerMap과 동일하게 유지되어야 합니다. (지도 미리보기 -> 모달 이동)
export let mapEl; // Export mapEl to check current container

export async function initMap() {
    // 1. Try to render in the card background first (Preview Mode)
    let container = document.getElementById("map-bg");
    let isPreview = true;

    // If map-bg doesn't exist, check modal container
    if (!container) {
        container = document.getElementById("route-map-container");
        isPreview = false;
    }

    if (container && window.google) {
        const lat = Number(travelData.meta.lat) || 37.5665;
        const lng = Number(travelData.meta.lng) || 126.9780;

        // [Fix] HierarchyRequestError 방지: 컨테이너에 직접 초기화하지 않고 내부 div 생성
        let mapDiv = container.querySelector('.google-map-instance');
        if (!mapDiv) {
            mapDiv = document.createElement('div');
            mapDiv.className = 'google-map-instance';
            mapDiv.style.width = '100%';
            mapDiv.style.height = '100%';
            container.appendChild(mapDiv);
        }

        // Remove background image if map is being loaded
        container.style.backgroundImage = 'none';

        const mapOptions = {
            center: { lat, lng },
            zoom: 13,
            mapId: "4504f8b37365c3d0",
            disableDefaultUI: isPreview,
            gestureHandling: isPreview ? 'none' : 'cooperative',
            keyboardShortcuts: !isPreview,
            fullscreenControl: !isPreview,
        };

        map = new google.maps.Map(mapDiv, mapOptions);
        mapEl = container; // Track current container slot

        try {
            const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
            mapMarker = new AdvancedMarkerElement({
                map: map,
                position: { lat, lng },
            });
        } catch (e) {
            console.warn("AdvancedMarkerElement load failed", e);
            mapMarker = new google.maps.Marker({
                position: { lat, lng },
                map: map
            });
        }
    }
    setupAutocomplete();
    isMapInitialized = true;

    // [Added] 초기화 시 경로 렌더링 (프리뷰용)
    renderRouteOnMap();
}

// [Added] 경로 렌더링 (Preview & Modal 공용)
export async function renderRouteOnMap() {
    if (!map || !travelData.days) return;

    // [Fix] 메인 여행지 마커(Arashiyama 등) 숨기기 - 사용자 등록 장소만 표시하기 위함
    if (mapMarker) {
        if (typeof mapMarker.setMap === 'function') mapMarker.setMap(null);
        else mapMarker.map = null;
    }

    // 기존 마커/폴리라인 제거
    if (window.routeMarkers) {
        window.routeMarkers.forEach(m => m.setMap(null));
    }
    window.routeMarkers = [];

    if (window.routePolylines) {
        window.routePolylines.forEach(p => p.setMap(null));
        window.routePolylines = [];
    }
    if (window.routePolyline) {
        window.routePolyline.setMap(null);
        window.routePolyline = null;
    }

    const bounds = new google.maps.LatLngBounds();
    const totalPath = [];
    const geocoder = new google.maps.Geocoder();

    // InfoWindow (재사용)
    if (!window.sharedInfoWindow) {
        window.sharedInfoWindow = new google.maps.InfoWindow();
    }

    const getPoint = async (item) => {
        if (item.lat && item.lng) {
            return { lat: Number(item.lat), lng: Number(item.lng) };
        }
        return null;
    };

    // 렌더링할 대상 날짜 결정
    const dayIndices = currentDayIndex === -1
        ? travelData.days.map((_, i) => i)
        : [currentDayIndex];

    let markerCount = 0;

    for (const dIdx of dayIndices) {
        const day = travelData.days[dIdx];
        if (!day || !day.timeline) continue;

        const dayPath = [];

        for (let i = 0; i < day.timeline.length; i++) {
            const item = day.timeline[i];
            if (item.isTransit || item.tag === '메모') continue;

            const pos = await getPoint(item);
            if (pos) {
                markerCount++;
                dayPath.push(pos);
                totalPath.push(pos);
                bounds.extend(pos);

                // 마커 생성
                let marker;
                try {
                    // [Enhanced] 꾹꾹체 적용 및 중첩 시 가독성 개선
                    const markerElement = document.createElement('div');
                    const bgColor = currentDayIndex === -1 ? (dIdx % 2 === 0 ? "#ee8700" : "#ff9f1c") : "#ee8700";

                    markerElement.innerHTML = `
                        <div style="
                            background: ${bgColor};
                            color: white;
                            width: 28px;
                            height: 28px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-family: 'MemomentKkukkukk', sans-serif;
                            font-size: 15px;
                            border: 2px solid #ffffff;
                            box-shadow: 0 3px 8px rgba(0,0,0,0.4);
                            font-weight: bold;
                            transform: translateY(-50%);
                            cursor: pointer;
                        ">
                            ${markerCount}
                        </div>
                    `;

                    marker = new AdvancedMarkerElement({
                        map: map,
                        position: pos,
                        title: item.title,
                        content: markerElement,
                        zIndex: 1000 + markerCount, // [Fix] 큰 숫자가 위로 오도록 설정
                        collisionBehavior: google.maps.CollisionBehavior.REQUIRED // [Fix] 겹쳐도 숨기지 않음
                    });
                } catch (e) {
                    marker = new google.maps.Marker({
                        position: pos,
                        map: map,
                        zIndex: 1000 + markerCount,
                        label: {
                            text: markerCount.toString(),
                            color: 'white',
                            fontFamily: 'MemomentKkukkukk',
                            fontSize: '15px',
                            fontWeight: 'bold'
                        }
                    });
                }

                // [Added] 마커용 이미지 캐시 및 획득 함수
                if (!window.itemImageCache) window.itemImageCache = new Map();

                const getItemImage = async (targetItem) => {
                    const cacheKey = targetItem.id || `${targetItem.title}_${targetItem.location}`;
                    if (window.itemImageCache.has(cacheKey)) return window.itemImageCache.get(cacheKey);

                    // 1. 추억 사진 확인
                    if (targetItem.memories && targetItem.memories.length > 0) {
                        const photo = targetItem.memories.find(m => m.photoUrl);
                        if (photo) {
                            window.itemImageCache.set(cacheKey, photo.photoUrl);
                            return photo.photoUrl;
                        }
                    }

                    // 2. 구글 장소 사진 검색 (Places API)
                    if (window.google && targetItem.location && targetItem.location.length > 1) {
                        try {
                            const service = new google.maps.places.PlacesService(map);
                            const request = { query: `${targetItem.title} ${targetItem.location}`, fields: ['photos'] };

                            const photoUrl = await new Promise((resolve) => {
                                service.findPlaceFromQuery(request, (results, status) => {
                                    if (status === google.maps.places.PlacesServiceStatus.OK && results[0].photos) {
                                        resolve(results[0].photos[0].getUrl({ maxWidth: 400 }));
                                    } else {
                                        resolve(null);
                                    }
                                });
                            });

                            if (photoUrl) {
                                window.itemImageCache.set(cacheKey, photoUrl);
                                return photoUrl;
                            }
                        } catch (e) {
                            console.warn("Places photo fetch failed", e);
                        }
                    }

                    // 3. Fallback: 기본 이미지
                    const fallback = targetItem.image || "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&h=400&fit=crop";
                    window.itemImageCache.set(cacheKey, fallback);
                    return fallback;
                };

                marker.addListener('click', async () => {
                    // [Added] 마커 재클릭 시 상세 모달 오픈 (Double-click like behavior)
                    if (window.lastClickedMarker === marker) {
                        if (window.viewTimelineItem) {
                            window.viewTimelineItem(i, dIdx);
                        }
                        window.lastClickedMarker = null; // 초기화
                        return;
                    }
                    window.lastClickedMarker = marker;

                    // 이미지 먼저 확보 (캐싱 활용)
                    const imgUrl = await getItemImage(item);

                    window.sharedInfoWindow.setContent(`
                        <div style="display: flex; min-width: 280px; max-width: 350px; cursor: pointer; overflow: hidden; font-family: 'MemomentKkukkukk', sans-serif; background: white;" onclick="window.viewTimelineItem(${i}, ${dIdx})">
                            <div style="flex: 1; padding: 12px; display: flex; flex-direction: column; justify-content: center; min-width: 150px;">
                                <div style="font-size: 11px; font-weight: bold; color: #ee8700; margin-bottom: 2px;">${dIdx + 1}일차</div>
                                <h4 style="margin: 0 0 4px 0; font-size: 16px; font-weight: bold; color: #333; line-height: 1.3;">${item.title}</h4>
                                <p style="margin: 0; font-size: 12px; color: #888; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">${item.location || ''}</p>
                                <div style="margin-top: 10px; font-size: 11px; color: #4285f4; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                                    <span class="material-symbols-outlined" style="font-size: 14px;">info</span> 한 번 더 누르면 상세보기
                                </div>
                            </div>
                            <div style="width: 100px; height: 100px; flex-shrink: 0; background-color: #f8f8f8;">
                                <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.3s;" />
                            </div>
                        </div>
                    `);
                    window.sharedInfoWindow.open(map, marker);

                    // 정보창 닫힐 때 클릭 상태 초기화
                    google.maps.event.addListenerOnce(window.sharedInfoWindow, 'closeclick', () => {
                        window.lastClickedMarker = null;
                    });
                });
                window.routeMarkers.push(marker);
            }
        }

        // 각 날짜별로 폴리라인 그리기 (점선 스타일 적용)
        if (dayPath.length > 1) {
            const lineSymbol = {
                path: 'M 0,-1 0,1',
                strokeOpacity: 1,
                scale: 2
            };

            const polyline = new google.maps.Polyline({
                path: dayPath,
                geodesic: true,
                strokeColor: currentDayIndex === -1 ? (dIdx % 2 === 0 ? '#774b00' : '#a36200') : '#774b00',
                strokeOpacity: 0, // 실선을 숨기고
                icons: [{ // 점선 아이콘 반복 적용
                    icon: lineSymbol,
                    offset: '0',
                    repeat: '8px'
                }],
                map: map
            });

            if (!window.routePolylines) window.routePolylines = [];
            window.routePolylines.push(polyline);
        }
    }

    // 기존 단일 routePolyline 참조 호환성 유지
    if (window.routePolylines && window.routePolylines.length > 0) {
        window.routePolyline = window.routePolylines[0];
    }

    // 지도 범위 조정
    if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
        // 패딩 추가하여 마커가 가장자리에 붙지 않게 함
        const listener = google.maps.event.addListener(map, "idle", () => {
            google.maps.event.removeListener(listener);
            if (map.getZoom() > 16) map.setZoom(16);
        });
    }
}

// [Sync Warning] 이 함수는 viewer.js와 로직이 유사해야 합니다.
export function transferMapToModal() {
    if (map) {
        // 배경 이미지 제거 (혹시 남아있다면)
        const mapBg = document.getElementById("map-bg");
        if (mapBg) mapBg.style.backgroundImage = 'none';

        const modalContainer = document.getElementById("route-map-container");
        if (modalContainer && mapEl !== modalContainer) {
            modalContainer.appendChild(map.getDiv());
            mapEl = modalContainer;

            map.setOptions({
                disableDefaultUI: false,
                gestureHandling: 'cooperative',
                keyboardShortcuts: true,
                fullscreenControl: true
            });

            google.maps.event.trigger(map, 'resize');
            // Re-center logic if needed
            const lat = Number(travelData.meta.lat) || 37.5665;
            const lng = Number(travelData.meta.lng) || 126.9780;
            map.setCenter({ lat, lng });
        }
    }
}

export function transferMapToPreview() {
    if (map) {
        const previewContainer = document.getElementById("map-bg");
        if (previewContainer && mapEl !== previewContainer) {
            previewContainer.appendChild(map.getDiv());
            mapEl = previewContainer;

            map.setOptions({
                disableDefaultUI: true,
                gestureHandling: 'none',
                keyboardShortcuts: false,
                fullscreenControl: false
            });

            // [Fix] 프리뷰 모드로 복구 시 메인 마커 다시 표시
            if (mapMarker) {
                if (typeof mapMarker.setMap === 'function') mapMarker.setMap(map);
                else mapMarker.map = map;
            }

            const lat = Number(travelData.meta.lat) || 37.5665;
            const lng = Number(travelData.meta.lng) || 126.9780;
            map.setCenter({ lat, lng });
            map.setZoom(13);
        }
    }
}

function fillInAddress() {
    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) return;

    if (searchMode === 'trip') {
        // 메인 여행지 설정
        if (window.updateMeta) window.updateMeta('title', place.name);
        if (window.updateMeta) window.updateMeta('subInfo', place.formatted_address);
        if (place.photos && place.photos.length > 0) {
            const photoUrl = place.photos[0].getUrl({ maxWidth: 4000, maxHeight: 3000 });
            if (window.updateMeta) window.updateMeta('mapImage', photoUrl);
            if (window.updateMeta) window.updateMeta('defaultMapImage', photoUrl);
        }

        // 랜드마크 검색으로 더 좋은 사진 찾기
        let searchQuery = place.name;

        const isRegion = place.types && (
            place.types.includes('locality') ||
            place.types.includes('administrative_area_level_1') ||
            place.types.includes('country')
        );

        if (!isRegion && place.address_components) {
            const locality = place.address_components.find(c => c.types.includes('locality'));
            const admin = place.address_components.find(c => c.types.includes('administrative_area_level_1'));
            if (locality) {
                searchQuery = locality.long_name;
            } else if (admin) {
                searchQuery = admin.long_name;
            }
        }

        // 한국어 행정구역 접미사 제거
        searchQuery = searchQuery.replace(/([가-힣]{2,})(특별시|광역시|특별자치시|특별자치도|도|시|군|구|부|현)$/, '$1');
        logger.debug(`Unsplash Search Query:${searchQuery}`);

        // Unsplash에서 고화질 배경 검색
        fetchUnsplashImage(searchQuery).then(url => {
            if (url) {
                if (window.updateMeta) window.updateMeta('mapImage', url);
                if (window.updateMeta) window.updateMeta('defaultMapImage', url);
                // UI 업데이트
                const mapBg = document.getElementById('map-bg');
                if (mapBg) mapBg.style.backgroundImage = `url('${url}')`;
                const heroEl = document.getElementById('trip-hero');
                if (heroEl) heroEl.style.backgroundImage = `url('${url}')`;
            }
        });

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        travelData.meta.lat = lat;
        travelData.meta.lng = lng;

        // Google Maps 지도 이동 및 마커 업데이트
        if (map) map.setCenter({ lat, lng });
        if (mapMarker) mapMarker.setPosition({ lat, lng });

        const currentDate = travelData.days && travelData.days[currentDayIndex] ? travelData.days[currentDayIndex].date : null;
        fetchWeather(lat, lng, currentDate);
        if (window.renderItinerary) window.renderItinerary();
        if (window.closeModal) window.closeModal();
    } else {
        // 타임라인 아이템 설정
        document.getElementById('item-title').value = place.name;
        document.getElementById('item-location').value = place.formatted_address;

        let notes = "";
        if (place.formatted_phone_number) notes += `전화: ${place.formatted_phone_number}\n`;
        document.getElementById('item-notes').value = notes;

        // 일본 장소인 경우 일본어 주소도 함께 저장
        const countryComponent = place.address_components?.find(c => c.types.includes('country'));
        if (countryComponent && countryComponent.short_name === 'JP') {
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();

            // Geocoding API로 일본어 주소 가져오기
            if (window.getMapsApiKey) {
                window.getMapsApiKey().then(key => {
                    fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ja&key=${key}`)
                        .then(response => response.json())
                        .then(data => {
                            if (data.results && data.results[0]) {
                                const japaneseAddress = data.results[0].formatted_address;
                                let jaField = document.getElementById('item-location-ja');
                                if (!jaField) {
                                    jaField = document.createElement('input');
                                    jaField.type = 'hidden';
                                    jaField.id = 'item-location-ja';
                                    document.getElementById('item-location').parentNode.appendChild(jaField);
                                }
                                jaField.value = japaneseAddress;
                                logger.debug('Japanese address saved:', japaneseAddress);
                            }
                        })
                        .catch(error => console.warn('Failed to fetch Japanese address:', error));
                });
            }
        }
    }
}

export async function fetchWeather(lat, lng, date = null) {
    if (!lat || !lng) return;
    try {
        // 날짜 유효성 검증
        if (date) {
            const requestDate = new Date(date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // 과거 날짜 확인
            if (requestDate < today) {
                // [Modified] Suppress warning for past dates (keeps logs clean)
                // console.debug(`Past date ${date} not supported, skipping request`);
                return;
            }

            // 16일 이상 미래 확인
            const diffDays = Math.floor((requestDate - today) / (1000 * 60 * 60 * 24));
            if (diffDays > 16) {
                console.warn(`Date ${date} is too far in future (${diffDays} days, max 16), skipping weather fetch`);
                return;
            }
        }

        // Open-Meteo API 사용 (무료, API 키 불필요)
        let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;

        if (date) {
            // 특정 날짜 예보
            url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${date}&end_date=${date}`;
        }

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();

        // 타임존 정보 업데이트
        if (data.timezone) {
            if (window.updateMeta) window.updateMeta('timezone', data.timezone);
        }

        let temp, minTemp, maxTemp, desc;

        if (date && data.daily) {
            // 특정 날짜 예보
            if (data.daily.temperature_2m_max && data.daily.temperature_2m_max.length > 0) {
                const maxT = data.daily.temperature_2m_max[0];
                const minT = data.daily.temperature_2m_min[0];
                maxTemp = `${Math.round(maxT)}°C`;
                minTemp = `${Math.round(minT)}°C`;
                temp = `${Math.round((maxT + minT) / 2)}°C`;

                const code = data.daily.weather_code[0];
                desc = translateWeatherCode(code);
            }
        } else if (data.current) {
            // 현재 날씨
            temp = `${Math.round(data.current.temperature_2m)}°C`;
            desc = translateWeatherCode(data.current.weather_code);

            if (data.daily && data.daily.temperature_2m_max) {
                maxTemp = `${Math.round(data.daily.temperature_2m_max[0])}°C`;
                minTemp = `${Math.round(data.daily.temperature_2m_min[0])}°C`;
            }
        }

        // 데이터 업데이트
        if (temp && window.updateMeta) window.updateMeta('weather.temp', temp);
        if (minTemp && window.updateMeta) window.updateMeta('weather.minTemp', minTemp);
        if (maxTemp && window.updateMeta) window.updateMeta('weather.maxTemp', maxTemp);
        if (desc && window.updateMeta) window.updateMeta('weather.desc', desc);

        if (window.renderItinerary) window.renderItinerary();
    } catch (e) {
        console.warn("Weather fetch failed for date", date, ":", e.message);
    }
}

// Open-Meteo 날씨 코드를 한국어로 변환
function translateWeatherCode(code) {
    const translations = {
        0: '맑음',
        1: '대체로 맑음',
        2: '구름 조금',
        3: '흐림',
        45: '안개',
        48: '안개',
        51: '가랑비',
        53: '가랑비',
        55: '가랑비',
        56: '차가운 이슬비',
        57: '차가운 이슬비',
        61: '약한 비',
        63: '비',
        65: '폭우',
        66: '차가운 비',
        67: '차가운 비',
        71: '약한 눈',
        73: '눈',
        75: '폭설',
        77: '진눈깨비',
        80: '소나기',
        81: '소나기',
        82: '강한 소나기',
        85: '눈',
        86: '폭설',
        95: '뇌우',
        96: '뇌우',
        99: '강한 뇌우'
    };
    return translations[code] || '맑음';
}


// 전역 객체 할당 (HTML 콜백용)
window.initMap = initMap;
window.gm_authFailure = gm_authFailure;
window.fetchWeather = fetchWeather;

// Google Maps API 동적 로드 (서버에서 키를 가져온 후 실행)
async function loadGoogleMapsAPI() {
    try {
        const response = await fetch(`${BACKEND_URL}/config`);
        const config = await response.json();
        const mapsApiKey = config.googleMapsApiKey;

        if (!window.google || !window.google.maps) {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places,geometry&loading=async&language=ko&callback=initMap`;
            script.async = true;
            document.head.appendChild(script);
        } else {
            console.warn('Google Maps API already loaded. Skipping additional load.');
        }
    } catch (error) {
        console.error("Failed to load Google Maps API:", error);
    }
}

// 시간별 날씨 예보 가져오기 (Open-Meteo API)
export async function fetchHourlyWeather(lat, lng, hours = 24) {
    if (!lat || !lng) return null;

    try {
        // Open-Meteo API - 시간별 예보
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code&timezone=auto&forecast_hours=${hours}`;

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();

        if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
            const hourlyData = [];

            for (let i = 0; i < Math.min(hours, data.hourly.time.length); i++) {
                const timeStr = data.hourly.time[i];
                const temp = data.hourly.temperature_2m[i];
                const feelsLike = data.hourly.apparent_temperature[i];
                const humidity = data.hourly.relative_humidity_2m[i];
                const precipitation = data.hourly.precipitation_probability[i];
                const weatherCode = data.hourly.weather_code[i];

                hourlyData.push({
                    time: formatHourlyTime(timeStr),
                    temp: temp !== null ? Math.round(temp) : null,
                    feelsLike: feelsLike !== null ? Math.round(feelsLike) : null,
                    humidity: humidity || null,
                    precipitation: precipitation || 0,
                    weatherCode: weatherCode,
                    weatherDesc: translateWeatherCode(weatherCode),
                    icon: getWeatherIconFromCode(weatherCode),
                    isDaytime: isDaytime(timeStr)
                });
            }

            return hourlyData;
        }

        return null;
    } catch (e) {
        console.warn("Hourly weather fetch failed:", e.message);
        return null;
    }
}

// 시간 포맷 헬퍼 (ISO 8601 형식에서 시간 추출)
function formatHourlyTime(isoTimeStr) {
    if (!isoTimeStr) return '--:--';

    try {
        const date = new Date(isoTimeStr);
        const hours = date.getHours();
        const ampm = hours < 12 ? '오전' : '오후';
        const displayHour = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);

        return `${ampm} ${displayHour}시`;
    } catch (e) {
        return '--:--';
    }
}

// 낮/밤 판별
function isDaytime(isoTimeStr) {
    try {
        const date = new Date(isoTimeStr);
        const hours = date.getHours();
        return hours >= 6 && hours < 18;
    } catch (e) {
        return true;
    }
}

// 날씨 코드에 따른 아이콘 반환
function getWeatherIconFromCode(code) {
    if (code === 0) return 'wb_sunny';
    if (code >= 1 && code <= 3) return 'partly_cloudy_day';
    if (code >= 45 && code <= 48) return 'foggy';
    if (code >= 51 && code <= 57) return 'rainy_light';
    if (code >= 61 && code <= 67) return 'rainy';
    if (code >= 71 && code <= 77) return 'ac_unit';
    if (code >= 80 && code <= 82) return 'rainy';
    if (code >= 85 && code <= 86) return 'ac_unit';
    if (code >= 95 && code <= 99) return 'thunderstorm';
    return 'wb_sunny';
}

// 주간 날씨 데이터 가져오기 (7일)
export async function fetchWeeklyWeather(lat, lng, weekStartDate) {
    if (!lat || !lng) return null;

    try {
        const startDate = new Date(weekStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);

        const startStr = formatDateStr(startDate);
        const endStr = formatDateStr(endDate);

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${startStr}&end_date=${endStr}`;

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const weeklyData = [];

        if (data.daily && data.daily.time && data.daily.time.length > 0) {
            for (let i = 0; i < data.daily.time.length; i++) {
                const date = data.daily.time[i];
                const dateObj = new Date(date);
                const maxTemp = data.daily.temperature_2m_max[i];
                const minTemp = data.daily.temperature_2m_min[i];
                const weatherCode = data.daily.weather_code[i];

                // 1. API 데이터로 객체 생성
                const dayData = {
                    date: date,
                    maxTemp: maxTemp !== null ? Math.round(maxTemp) : null,
                    minTemp: minTemp !== null ? Math.round(minTemp) : null,
                    weatherCode: weatherCode,
                    weatherDesc: translateWeatherCode(weatherCode),
                    icon: getWeatherIconFromCode(weatherCode),
                    available: dateObj >= today
                };

                // 2. 여행 데이터(travelData)에 동기화 및 캐싱
                const tripDay = travelData.days && travelData.days.find(d => d.date === date);
                if (tripDay) {
                    if (dateObj >= today) {
                        // 오늘/미래 날짜면 최신 정보로 업데이트
                        tripDay.weatherSummary = { ...dayData, available: true };
                        if (window.autoSave) window.autoSave();
                    } else if (tripDay.weatherSummary) {
                        // 과거 날짜지만 캐시된 정보가 있으면 사용
                        Object.assign(dayData, tripDay.weatherSummary);
                        dayData.available = true;
                    }
                }

                weeklyData.push(dayData);
            }
        } else if (travelData.days) {
            // API 호출 실패 시 캐시된 정보라도 반환 (과거 날짜 등)
            for (let i = 0; i < 7; i++) {
                const date = new Date(startDate);
                date.setDate(date.getDate() + i);
                const dateStr = formatDateStr(date);
                const tripDay = travelData.days.find(d => d.date === dateStr);
                if (tripDay && tripDay.weatherSummary) {
                    weeklyData.push({ ...tripDay.weatherSummary, available: true });
                }
            }
        }

        return weeklyData;
    } catch (e) {
        console.warn("Weekly weather fetch failed:", e.message);
        return null;
    }
}

// 특정 날짜의 시간별 날씨 가져오기
export async function fetchHourlyWeatherForDate(lat, lng, dateStr) {
    if (!lat || !lng) return null;

    try {
        const targetDate = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tripDay = travelData.days && travelData.days.find(d => d.date === dateStr);

        // 과거 날짜는 데이터 없음 (단, 캐시된 데이터가 있으면 반환)
        if (targetDate < today) {
            return (tripDay && tripDay.hourlyWeather) || null;
        }

        // Open-Meteo API - 특정 날짜의 시간별 예보
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;

        const res = await fetch(url);
        if (!res.ok) {
            // API 실패 시 캐시 반환
            return (tripDay && tripDay.hourlyWeather) || null;
        }

        const data = await res.json();

        if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
            const hourlyData = [];

            for (let i = 0; i < data.hourly.time.length; i++) {
                const timeStr = data.hourly.time[i];
                const temp = data.hourly.temperature_2m[i];
                const feelsLike = data.hourly.apparent_temperature[i];
                const humidity = data.hourly.relative_humidity_2m[i];
                const precipitation = data.hourly.precipitation_probability[i];
                const weatherCode = data.hourly.weather_code[i];

                hourlyData.push({
                    time: formatHourlyTime(timeStr),
                    temp: temp !== null ? Math.round(temp) : null,
                    feelsLike: feelsLike !== null ? Math.round(feelsLike) : null,
                    humidity: humidity || 0,
                    precipitation: precipitation || 0,
                    weatherCode: weatherCode,
                    weatherDesc: translateWeatherCode(weatherCode),
                    icon: getWeatherIconFromCode(weatherCode),
                    isDaytime: isDaytime(timeStr)
                });
            }

            // 캐싱 및 저장
            if (tripDay) {
                tripDay.hourlyWeather = hourlyData;
                if (window.autoSave) window.autoSave();
            }

            return hourlyData;
        }

        return (tripDay && tripDay.hourlyWeather) || null;
    } catch (e) {
        console.warn("Hourly weather for date fetch failed:", e.message);
        return null;
    }
}

function formatDateStr(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// API 로드 시작
loadGoogleMapsAPI();

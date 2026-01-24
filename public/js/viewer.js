import { db, firebaseReady } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { setTravelData, travelData, setCurrentTripId, setCurrentDayIndex, setIsReadOnlyMode } from './state.js';
import { renderItinerary, renderLists, renderWeeklyWeather } from './ui/renderers.js';
import { formatTime } from './ui/time-helpers.js';
import { updateTotalBudget } from './ui/expense-manager.js'; // [Added] Import Budget Manager
import { escapeHtml } from './ui-utils.js';

import { BACKEND_URL } from './config.js';

// Global context for renderers (simulating ui.js environment)
// Global context for renderers (simulating ui.js environment)
window.renderLists = renderLists;
window.updateLocalTimeWidget = () => { };

// [Fix] Implement Stub functions for Viewer Interaction
window.viewTimelineItem = (index, dayIndex) => {
    // Open Item Detail Modal
    if (window.openItemModal) window.openItemModal(dayIndex, index);
};
window.viewRouteDetail = (index, dayIndex) => {
    // Open Transit Detail Modal
    if (window.openTransitModal) window.openTransitModal(dayIndex, index);
};
window.openAddModal = () => { }; // Prevent action in viewer
window.deleteTimelineItem = () => { }; // Prevent action in viewer
window.addMemoryItem = () => { }; // Prevent action in viewer
window.deleteListItem = () => { }; // Prevent action in viewer
window.toggleListCheck = () => { }; // Prevent action in viewer

// Map State
let map;
let mapEl; // Current map container
let mapMarkers = [];
let mapPolyline = null;
let isMapInitialized = false;

const MAP_CANVAS_ID = 'viewer-map-canvas';

function initViewerMap() {
    // [Sync Warning] 이 로직은 map.js의 initMap과 동일하게 유지되어야 합니다. (지도 미리보기 -> 모달 이동)
    // 1. Try to render in the card background first (Preview Mode)
    let container = document.getElementById("map-bg");
    let isPreview = true;

    // If map-bg doesn't exist (e.g., hidden), fallback to modal container immediately
    if (!container) {
        container = document.getElementById("route-map-container");
        isPreview = false;
    }

    if (!container) return;

    mapEl = container; // Track current parent container

    // Create a dedicated map div
    let mapDiv = document.getElementById(MAP_CANVAS_ID);
    if (!mapDiv) {
        mapDiv = document.createElement("div");
        mapDiv.id = MAP_CANVAS_ID;
        mapDiv.style.width = "100%";
        mapDiv.style.height = "100%";
        container.appendChild(mapDiv);
    }
    // If it exists but is elsewhere, move it here (though init usually only happens once)
    if (mapDiv.parentElement !== container) {
        container.appendChild(mapDiv);
    }

    const lat = Number(travelData.meta.lat) || 37.5665;
    const lng = Number(travelData.meta.lng) || 126.9780;

    const mapOptions = {
        center: { lat, lng },
        zoom: 13,
        mapId: "4504f8b37365c3d0",
        disableDefaultUI: isPreview, // Disable UI in preview
        gestureHandling: isPreview ? 'none' : 'cooperative', // No interaction in preview
        keyboardShortcuts: !isPreview,
        fullscreenControl: !isPreview,
    };

    map = new google.maps.Map(mapDiv, mapOptions);

    renderMapMarkers();
    isMapInitialized = true;
}

// Google Maps API 동적 로드
async function loadGoogleMapsAPI() {
    try {
        if (window.google && window.google.maps) {
            initViewerMap();
            return;
        }

        const response = await fetch(`${BACKEND_URL}/config`);
        const config = await response.json();
        const mapsApiKey = config.googleMapsApiKey;

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places,marker&loading=async&language=ko&callback=initViewerMap`;
        script.async = true;
        window.initViewerMap = initViewerMap; // Global callback
        document.head.appendChild(script);

    } catch (error) {
        console.error("Failed to load Google Maps API:", error);
        alert("지도를 불러오는 데 실패했습니다.");
    }
}

// Move map between containers
window.openRouteModal = async () => {
    const modal = document.getElementById('route-modal');
    if (modal) modal.classList.remove('hidden');

    if (!isMapInitialized) {
        await loadGoogleMapsAPI();
    }

    // Move map to modal container if it exists and is initialized
    if (map) {
        const modalContainer = document.getElementById("route-map-container");
        // Check if map is already in the modal container
        // mapEl tracks the current parent. 
        if (modalContainer && mapEl !== modalContainer) {
            modalContainer.appendChild(map.getDiv());
            mapEl = modalContainer;

            // Enable interactions for modal view
            map.setOptions({
                disableDefaultUI: false,
                gestureHandling: 'cooperative',
                keyboardShortcuts: true,
                fullscreenControl: true
            });

            // Trigger resize
            google.maps.event.trigger(map, 'resize');
            fitMapToBounds(); // Fit bounds when opening modal
        }
    }
};

window.closeRouteModal = () => {
    const modal = document.getElementById('route-modal');
    if (modal) modal.classList.add('hidden');

    // Move map back to preview container
    if (map) {
        const previewContainer = document.getElementById("map-bg");
        if (previewContainer && mapEl !== previewContainer) {
            previewContainer.appendChild(map.getDiv());
            mapEl = previewContainer;

            // Disable interactions for preview view
            map.setOptions({
                disableDefaultUI: true,
                gestureHandling: 'none',
                keyboardShortcuts: false,
                fullscreenControl: false
            });

            // Reset center/zoom to initial or fit bounds?
            // Usually preview fits bounds too.
            setTimeout(() => fitMapToBounds(), 100);
        }
    }
};

async function renderMapMarkers() {
    if (!map || !travelData.days) return;

    // Clear existing
    mapMarkers.forEach(marker => marker.map = null);
    mapMarkers = [];
    if (mapPolyline) mapPolyline.setMap(null);

    const bounds = new google.maps.LatLngBounds();
    const pathCoordinates = [];

    // Import AdvancedMarker if available
    let AdvancedMarkerElement;
    let PinElement;
    try {
        const markerLib = await google.maps.importLibrary("marker");
        AdvancedMarkerElement = markerLib.AdvancedMarkerElement;
        PinElement = markerLib.PinElement;
    } catch (e) {
        console.warn("Advanced Marker not supported");
    }

    // Iterate all days and items
    travelData.days.forEach((day, dIdx) => {
        if (!day.timeline) return;

        day.timeline.forEach((item, iIdx) => {
            // Check if item has location data (exclude plain notes or transits without coords if unmapped)
            // Note: Current data structure might not explicitly store lat/lng in timeline items individually unless added.
            // Assuming simplified viewer logic: If we want to show ALL points, we need lat/lng on items.
            // If items don't have lat/lng stored (only text location), we can't map them without geocoding.
            // BUT: travelData.meta has lat/lng for the main destination.

            // Checking if timeline items have lat/lng is crucial. 
            // If the user's data doesn't have lat/lng on items, we can only show the main trip location.
            // Let's assume for now we plot what we have, or maybe just the main location if items lack coords.

            // However, looking at map.js, it seems new items get lat/lng saved? 
            // Let's check state.js default data... it doesn't show lat/lng on timeline items example.
            // If items lack lat/lng, this feature is limited. 
            // BUT, usually map integration implies items HAVE coords.

            // Let's implement robust checking.
            if (item.lat && item.lng) {
                const position = { lat: Number(item.lat), lng: Number(item.lng) };
                pathCoordinates.push(position);
                bounds.extend(position);

                // Create Marker
                if (AdvancedMarkerElement) {
                    const pin = new PinElement({
                        glyph: `${iIdx + 1}`,
                        background: "#774b00",
                        borderColor: "#ffffff",
                        glyphColor: "#ffffff",
                    });

                    const marker = new AdvancedMarkerElement({
                        map: map,
                        position: position,
                        title: item.title,
                        content: pin.element
                    });
                    mapMarkers.push(marker);
                } else {
                    const marker = new google.maps.Marker({
                        map: map,
                        position: position,
                        title: item.title,
                        label: { text: `${iIdx + 1}`, color: 'white' }
                    });
                    mapMarkers.push(marker);
                }
            }
        });
    });

    // If no specific item markers, show main trip location
    if (pathCoordinates.length === 0 && travelData.meta.lat && travelData.meta.lng) {
        const position = { lat: Number(travelData.meta.lat), lng: Number(travelData.meta.lng) };
        bounds.extend(position);

        if (AdvancedMarkerElement) {
            new AdvancedMarkerElement({
                map: map,
                position: position,
                title: "Main Location"
            });
        } else {
            new google.maps.Marker({
                map: map,
                position: position
            });
        }
    }

    // Draw Polyline
    if (pathCoordinates.length > 1) {
        mapPolyline = new google.maps.Polyline({
            path: pathCoordinates,
            geodesic: true,
            strokeColor: "#774b00",
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map: map
        });
    }

    // Fit Bounds
    if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
        // Avoid too much zoom if only 1 point
        if (pathCoordinates.length <= 1) {
            const listener = google.maps.event.addListener(map, "idle", () => {
                map.setZoom(13);
                google.maps.event.removeListener(listener);
            });
        }
    }
}

function fitMapToBounds() {
    if (!map || mapMarkers.length === 0) return;
    const bounds = new google.maps.LatLngBounds();

    // Add marker positions
    mapMarkers.forEach(m => {
        if (m.position) bounds.extend(m.position); // Legacy
        if (m.position) bounds.extend(m.position); // Advanced (requires access, usually position property works)
    });

    // Add meta location if needed
    if (mapMarkers.length === 0 && travelData.meta.lat) {
        bounds.extend({ lat: Number(travelData.meta.lat), lng: Number(travelData.meta.lng) });
    }

    if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
    }
}

async function initViewer() {
    try {
        await firebaseReady;

        // URL Parameter Check
        const urlParams = new URLSearchParams(window.location.search);
        // Supports ?share=ID, ?id=ID, ?invite=ID (all treated as read-only view)
        let tripId = urlParams.get('id') || urlParams.get('share') || urlParams.get('invite');

        // [Modified] SSR 주소 형식(/v/:id) 지원
        if (!tripId && window.location.pathname.startsWith('/v/')) {
            const parts = window.location.pathname.split('/');
            tripId = parts[parts.length - 1];
        }

        if (!tripId) {
            showError("잘못된 접근입니다.");
            return;
        }

        // Load Trip Data
        await loadTrip(tripId);

    } catch (e) {
        console.error("Viewer initialization failed:", e);
        showError("초기화 중 오류가 발생했습니다.");
    }
}

async function loadTrip(tripId) {
    try {
        const docRef = doc(db, 'plans', tripId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            // Public Check (Client-side validation, Security rule handles server-side)
            // If the rule allows read, we allow view.

            setTravelData(data);
            setCurrentTripId(tripId);
            setCurrentDayIndex(-1); // Default to 'All' view

            // Force Read-Only State
            setIsReadOnlyMode(true); // [Added] 뷰어 모드 활성화 (UI 버튼 숨김)
            document.body.classList.add('viewer-mode'); // [Added] CSS 터치 이벤트 제어를 위한 클래스
            // state.js의 isEditing은 초기값이 false이므로 별도 설정 불필요하지만 명시적으로
            // (state.js에 export가 없다면 직접 수정 불가, 하지만 renderers는 readonly 상태로 동작함)

            // UI Update
            document.getElementById('loading-overlay').classList.add('opacity-0');
            setTimeout(() => {
                document.getElementById('loading-overlay').classList.add('hidden');
                document.getElementById('detail-view').classList.remove('opacity-0');
            }, 300);

            // Initial Render
            renderItinerary();
            renderLists();

            // [Fix] Update Map with loaded data (Load API for preview)
            loadGoogleMapsAPI();

            // [Added] Calculate and Display Budget
            updateViewerBudget(travelData);

            // [Fix] Re-attach interaction handlers (Inline onclick might be blocked or invalid context)
            setTimeout(() => attachInteractionHandlers(), 500);

            // Weather (Optional)
            if (data.days && data.days.length > 0) {
                // Weather loading logic can be added here if needed
            }

        } else {
            showError("여행 계획을 찾을 수 없습니다.");
        }
    } catch (e) {
        console.error("Error loading trip:", e);
        showError("데이터를 불러오는 데 실패했습니다.");
    }
}

// [Fix] Manually attach click handlers to cards
function attachInteractionHandlers() {
    // 1. Timeline Items (Place)
    // viewTimelineItem(index, dayIndex)
    const items = document.querySelectorAll('[onclick^="viewTimelineItem"]');
    items.forEach(el => {
        const onclickAttr = el.getAttribute('onclick');
        const match = onclickAttr.match(/viewTimelineItem\((\d+),\s*(\d+)\)/);
        if (match) {
            const index = parseInt(match[1]);
            const dayIndex = parseInt(match[2]);

            // Remove inline handler
            el.removeAttribute('onclick');

            // Attach direct handler
            el.onclick = (e) => {
                e.stopPropagation();
                openItemModal(dayIndex, index);
            };

            // Mobile touch support
            el.addEventListener('touchend', (e) => {
                // Prevent ghost clicks if needed, but usually onclick is enough.
                // If scrolling, touchend shouldn't trigger. 
                // Let's rely on standard click for now, but ensure cursor pointer.
            });

            el.style.cursor = 'pointer';
        }
    });

    // 2. Transit Items
    // viewRouteDetail(index, dayIndex)
    const transitItems = document.querySelectorAll('[onclick^="viewRouteDetail"]');
    transitItems.forEach(el => {
        const onclickAttr = el.getAttribute('onclick');
        const match = onclickAttr.match(/viewRouteDetail\((\d+),\s*(\d+)\)/);
        if (match) {
            const index = parseInt(match[1]);
            const dayIndex = parseInt(match[2]);

            el.removeAttribute('onclick');

            el.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                openTransitModal(dayIndex, index);
            };

            el.style.cursor = 'pointer';
        }
    });
}

// [Added] Budget Calculation for Viewer
function updateViewerBudget(travelData) {
    let total = 0;
    if (travelData.days) {
        travelData.days.forEach(day => {
            if (day.timeline) {
                day.timeline.forEach(item => {
                    if (item.expenses && Array.isArray(item.expenses) && item.expenses.length > 0) {
                        const sum = item.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
                        total += sum;
                    } else if (item.budget) {
                        total += Number(item.budget);
                    }
                });
            }
        });
    }

    const budgetEl = document.getElementById('budget-amount');
    if (budgetEl) {
        budgetEl.textContent = `₩${total.toLocaleString()}`;

        // Click Event for Detail Modal
        // 카드 컨테이너 찾기 (budgetEl -> div -> div(card))
        const budgetCard = budgetEl.closest('.cursor-pointer') || budgetEl.parentElement.parentElement;

        if (budgetCard) {
            budgetCard.onclick = openExpenseModal;
            budgetCard.classList.add('cursor-pointer', 'hover:shadow-lg', 'transition-all', 'hover:-translate-y-1');

            // "클릭하여 상세 보기" 텍스트 업데이트
            const descEl = budgetCard.querySelector('p.text-xs');
            if (descEl) descEl.textContent = "클릭하여 상세 보기";
        }
    }
}

// [Added] Item Detail Modal (Read-Only)
function openItemModal(dayIndex, itemIndex) {
    if (!travelData.days || !travelData.days[dayIndex] || !travelData.days[dayIndex].timeline[itemIndex]) return;

    renderItemModal(dayIndex, itemIndex);
    const modal = document.getElementById('item-detail-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}
window.openItemModal = openItemModal;

function closeItemModal() {
    const modal = document.getElementById('item-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        // Reset Map Frame
        const frame = document.getElementById('item-detail-map-frame');
        if (frame) frame.src = "";
    }
}
window.closeItemModal = closeItemModal;

async function renderItemModal(dayIndex, itemIndex) {
    const item = travelData.days[dayIndex].timeline[itemIndex];
    const contentEl = document.getElementById('item-detail-content');
    if (!contentEl) return;

    // Load Maps API key for embed
    let mapsApiKey = "";
    try {
        if (window.googleMapsApiKey) mapsApiKey = window.googleMapsApiKey;
        else {
            const response = await fetch(`${BACKEND_URL}/config`);
            const config = await response.json();
            mapsApiKey = config.googleMapsApiKey;
            window.googleMapsApiKey = mapsApiKey;
        }
    } catch (e) { console.error("Maps Key Load Error", e); }

    // Map Embed URL
    let mapEmbedUrl = "";
    if (item.location && item.location.length > 1 && item.location !== "위치" && mapsApiKey) {
        const query = encodeURIComponent(`${item.title},${item.location}`);
        mapEmbedUrl = `https://www.google.com/maps/embed/v1/place?key=${mapsApiKey}&q=${query}`;
    }

    // Memories
    let memoriesHtml = "";
    if (item.memories && item.memories.length > 0) {
        memoriesHtml = `<div class="mb-6"><h4 class="text-xs font-bold text-gray-500 uppercase mb-3">추억</h4><div class="flex flex-col gap-3">`;
        item.memories.forEach(mem => {
            memoriesHtml += `
            <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                ${mem.photoUrl ? `<div class="w-full h-48 bg-gray-200 rounded-lg mb-3 bg-cover bg-center" style="background-image: url('${mem.photoUrl}')"></div>` : ''}
                <p class="text-sm text-gray-700 dark:text-gray-300 font-hand">${escapeHtml(mem.comment || '')}</p>
                <p class="text-[10px] text-gray-400 mt-1 text-right">${mem.timestamp ? new Date(mem.timestamp).toLocaleTimeString() : ''}</p>
            </div>`;
        });
        memoriesHtml += `</div></div>`;
    }

    // Expenses
    let expensesHtml = "";
    let expenseTotal = 0;
    if (item.expenses && item.expenses.length > 0) {
        expensesHtml = `<div class="mb-6"><h4 class="text-xs font-bold text-gray-500 uppercase mb-3">지출 내역</h4><div class="flex flex-col gap-2">`;
        item.expenses.forEach(exp => {
            expenseTotal += Number(exp.amount || 0);
            expensesHtml += `
            <div class="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                <span class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(exp.description || '내역 없음')}</span>
                <span class="text-sm font-bold text-text-main dark:text-white">₩${Number(exp.amount || 0).toLocaleString()}</span>
            </div>`;
        });
        expensesHtml += `<div class="flex justify-between items-center border-t border-gray-200 dark:border-gray-700 pt-2 mt-2"><span class="font-bold text-sm">총계</span><span class="font-bold text-lg text-primary">₩${expenseTotal.toLocaleString()}</span></div></div></div>`;
    }

    // Attachments
    let attachmentsHtml = "";
    if (item.attachments && item.attachments.length > 0) {
        attachmentsHtml = `<div class="mb-6"><h4 class="text-xs font-bold text-gray-500 uppercase mb-3">첨부 파일</h4><div class="grid grid-cols-2 gap-3">`;
        item.attachments.forEach(att => {
            const isImage = att.type.startsWith('image/');
            attachmentsHtml += `
             <a href="${att.url}" target="_blank" class="block bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 hover:bg-gray-100 transition-colors">
                <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-outlined text-primary">${isImage ? 'image' : 'description'}</span>
                    <span class="text-xs font-bold text-gray-600 truncate flex-1">${escapeHtml(att.name)}</span>
                </div>
                ${isImage ? `<div class="w-full h-20 bg-gray-200 rounded-lg bg-cover bg-center" style="background-image: url('${att.url}')"></div>` : ''}
             </a>`;
        });
        attachmentsHtml += `</div></div>`;
    }

    // Note (URL Linking)
    let noteHtml = "";
    if (item.note) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        // Escape HTML first, then linkify
        const linkedNote = escapeHtml(item.note).replace(urlRegex, (url) => `<a href="${url}" target="_blank" class="text-blue-500 hover:underline">${url}</a>`);
        noteHtml = `
         <div class="bg-yellow-50 dark:bg-yellow-900/20 p-5 rounded-xl border border-yellow-100 dark:border-yellow-700/50 mb-6">
            <h4 class="text-xs font-bold text-yellow-600 dark:text-yellow-500 uppercase mb-2">메모</h4>
            <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">${linkedNote}</div>
         </div>`;
    }


    // Directions URL
    let directionsUrl = "";
    if (item.title) {
        // Query: Title + Location 
        // If location has coords, use coords for more precision if available, but search query is safer for general user intent
        const query = encodeURIComponent(`${item.title} ${item.location || ''}`);
        directionsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    }

    contentEl.innerHTML = `
        <!-- Sticky Header -->
        <div class="sticky top-0 bg-white dark:bg-card-dark z-20 border-b border-gray-100 dark:border-gray-700 p-6 pb-4 shrink-0 shadow-sm modal-slide-in">
            <div class="flex justify-between items-start">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2 py-1 rounded text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">${item.category || '장소'}</span>
                        <span class="text-sm text-gray-500 font-medium">${item.time || ''}</span>
                    </div>
                    <h2 class="text-2xl font-bold text-text-main dark:text-white leading-tight mb-1 truncate">${item.title}</h2>
                    <div class="text-sm text-primary flex items-center gap-1 mb-3">
                        <span class="material-symbols-outlined text-sm shrink-0">location_on</span>
                        <span class="truncate">${item.location || '위치 정보 없음'}</span>
                    </div>
                    
                    ${directionsUrl ? `
                    <a href="${directionsUrl}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-full transition-colors shadow-sm">
                        <span class="material-symbols-outlined text-lg">directions</span>
                        길찾기
                    </a>` : ''}
                </div>
                <button type="button" onclick="closeItemModal()" class="ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 rounded-full hover:bg-gray-100 transition-colors">
                    <span class="material-symbols-outlined text-2xl">close</span>
                </button>
            </div>
        </div>

        <!-- Content Split -->
        <div class="flex-1 overflow-hidden flex flex-col md:flex-row-reverse">
             <!-- Right: Details (Scrollable) -->
             <div class="flex-1 p-6 overflow-y-auto bg-white dark:bg-card-dark">
                ${noteHtml}
                ${memoriesHtml}
                ${expensesHtml}
                ${attachmentsHtml}
                
                ${!noteHtml && !memoriesHtml && !expensesHtml && !attachmentsHtml ?
            '<div class="flex flex-col items-center justify-center h-40 text-gray-400"><span class="material-symbols-outlined text-4xl mb-2">description</span><p>추가 상세 정보가 없습니다.</p></div>'
            : ''}
             </div>

             <!-- Left: Map (Fixed if Desktop) -->
             ${mapEmbedUrl ? `
             <div class="w-full md:w-1/2 h-64 md:h-auto bg-gray-100 dark:bg-gray-800 relative border-t md:border-t-0 md:border-r border-gray-200 dark:border-gray-700 shrink-0">
                 <iframe id="item-detail-map-frame" class="w-full h-full border-0 absolute inset-0" src="${mapEmbedUrl}" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
             </div>` : `
             <div class="hidden md:flex w-full md:w-1/2 h-full bg-gray-50 dark:bg-gray-800/50 items-center justify-center border-r border-gray-200 dark:border-gray-700 text-gray-400">
                <div class="text-center">
                    <span class="material-symbols-outlined text-4xl mb-2">map_off</span>
                    <p class="text-sm">지도 정보가 없거나<br>위치를 특정할 수 없습니다.</p>
                </div>
             </div>
             `}
        </div>
    `;
}

// [Added] Transit Detail Modal (Read-Only)
function openTransitModal(dayIndex, itemIndex) {
    if (!travelData.days || !travelData.days[dayIndex] || !travelData.days[dayIndex].timeline[itemIndex]) return;

    renderTransitModal(dayIndex, itemIndex);
    const modal = document.getElementById('transit-detail-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}
window.openTransitModal = openTransitModal;

function closeTransitModal() {
    const modal = document.getElementById('transit-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}
window.closeTransitModal = closeTransitModal;

function renderTransitModal(dayIndex, itemIndex) {
    const item = travelData.days[dayIndex].timeline[itemIndex];
    const contentEl = document.getElementById('transit-detail-content');
    if (!contentEl) return;

    contentEl.innerHTML = `
        <div class="p-6 text-center modal-slide-in">
            <div class="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                <span class="material-symbols-outlined text-4xl text-blue-500">${item.icon || 'commute'}</span>
            </div>
            <h3 class="text-xl font-bold text-text-main dark:text-white mb-1">${item.title}</h3>
            <p class="text-sm text-gray-500 mb-6">${item.time || ''} 소요</p>
            
            <div class="flex flex-col gap-3 text-left">
                ${item.budget ? `
                <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span class="text-sm font-bold text-gray-600 dark:text-gray-400">비용</span>
                    <span class="text-sm font-bold text-primary">₩${Number(item.budget).toLocaleString()}</span>
                </div>` : ''}
                
                ${item.note ? `
                <div class="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-100 dark:border-yellow-700/50">
                     <h4 class="text-xs font-bold text-yellow-600 dark:text-yellow-500 uppercase mb-2">메모</h4>
                     <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${item.note}</p>
                </div>` : ''}
                
                ${!item.budget && !item.note ? '<p class="text-sm text-gray-400 text-center py-2">추가 정보가 없습니다.</p>' : ''}
            </div>

            <div class="mt-8">
                <button type="button" onclick="closeTransitModal()" class="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">닫기</button>
            </div>
        </div>
    `;
}

function showError(msg) {
    document.getElementById('loading-overlay').classList.add('hidden');
    const errorView = document.getElementById('error-view');
    if (errorView) {
        errorView.classList.remove('hidden');
        errorView.querySelector('p').textContent = msg;
    }
}

// Day Selection (Global for onclick)
window.selectDay = (index) => {
    setCurrentDayIndex(index);
    renderItinerary();
    // [Fix] Re-attach handlers after day change
    setTimeout(() => attachInteractionHandlers(), 100);
};

// Lightbox (Memories)
// Lightbox (Memories)
let currentLightboxImages = []; // { url, comment, index }
let currentLightboxIndex = 0;

window.openLightbox = (dayIndex, itemIndex, memIndex) => {
    // Collect all images from the current trip for navigation
    currentLightboxImages = [];

    // Iterate through all days and items to build a flat list of images
    if (travelData.days) {
        travelData.days.forEach((day, dIdx) => {
            if (day.timeline) {
                day.timeline.forEach((item, iIdx) => {
                    if (item.memories) {
                        item.memories.forEach((mem, mIdx) => {
                            if (mem.photoUrl) {
                                currentLightboxImages.push({
                                    url: mem.photoUrl,
                                    comment: mem.comment,
                                    date: day.date,
                                    originalIndices: { d: dIdx, i: iIdx, m: mIdx }
                                });
                            }
                        });
                    }
                });
            }
        });
    }

    // Find the starting index matching the clicked memory
    currentLightboxIndex = currentLightboxImages.findIndex(img =>
        img.originalIndices.d === dayIndex &&
        img.originalIndices.i === itemIndex &&
        img.originalIndices.m === memIndex
    );

    if (currentLightboxIndex === -1 && currentLightboxImages.length > 0) {
        currentLightboxIndex = 0; // Fallback
    }

    if (currentLightboxImages.length > 0) {
        updateLightboxUI();
        const modal = document.getElementById('lightbox-modal');
        if (modal) {
            modal.classList.remove('hidden');
            // [Added] Touch Event Listeners for Swipe
            modal.addEventListener('touchstart', handleLightboxTouchStart, { passive: false });
            modal.addEventListener('touchend', handleLightboxTouchEnd, { passive: false });
        }
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
};

window.closeLightbox = () => {
    const modal = document.getElementById('lightbox-modal');
    if (modal) {
        modal.classList.add('hidden');
        // [Added] Remove Event Listeners
        modal.removeEventListener('touchstart', handleLightboxTouchStart);
        modal.removeEventListener('touchend', handleLightboxTouchEnd);
    }
    document.body.style.overflow = '';
};

// [Added] Lightbox Swipe Logic
let lbTouchStartX = 0;
let lbTouchStartY = 0;

function handleLightboxTouchStart(e) {
    lbTouchStartX = e.changedTouches[0].screenX;
    lbTouchStartY = e.changedTouches[0].screenY;
}

function handleLightboxTouchEnd(e) {
    const lbTouchEndX = e.changedTouches[0].screenX;
    const lbTouchEndY = e.changedTouches[0].screenY;

    handleLightboxSwipeGesture(lbTouchStartX, lbTouchStartY, lbTouchEndX, lbTouchEndY);
}

function handleLightboxSwipeGesture(startX, startY, endX, endY) {
    const xDiff = endX - startX;
    const yDiff = endY - startY;

    // 가로 이동이 세로 이동보다 크고, 일정 거리(50px) 이상 이동했을 때만 스와이프로 인정
    if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > 50) {
        if (xDiff > 0) {
            // Right swipe -> Previous image
            window.navigateLightbox(-1);
        } else {
            // Left swipe -> Next image
            window.navigateLightbox(1);
        }
    }
}

window.navigateLightbox = (direction) => {
    const newIndex = currentLightboxIndex + direction;
    if (newIndex >= 0 && newIndex < currentLightboxImages.length) {
        currentLightboxIndex = newIndex;
        updateLightboxUI(direction);
    }
};

function updateLightboxUI(direction = 0) {
    const imgData = currentLightboxImages[currentLightboxIndex];
    if (!imgData) return;

    const imgEl = document.getElementById('lightbox-image');
    const captionEl = document.getElementById('lightbox-caption');
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');

    // Apply Animation Class
    if (imgEl) {
        imgEl.classList.remove('animate-lightbox-next', 'animate-lightbox-prev', 'animate-lightbox-fade');
        void imgEl.offsetWidth; // Trigger reflow

        if (direction > 0) imgEl.classList.add('animate-lightbox-next');
        else if (direction < 0) imgEl.classList.add('animate-lightbox-prev');
        else imgEl.classList.add('animate-lightbox-fade');

        imgEl.src = imgData.url;
    }

    if (captionEl) captionEl.textContent = imgData.comment || '';

    // Navigation buttons visibility
    if (prevBtn) {
        if (currentLightboxIndex > 0) prevBtn.classList.remove('hidden');
        else prevBtn.classList.add('hidden');
    }

    if (nextBtn) {
        if (currentLightboxIndex < currentLightboxImages.length - 1) nextBtn.classList.remove('hidden');
        else nextBtn.classList.add('hidden');
    }
}

// Keyboard navigation support
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('lightbox-modal');
    if (!modal || modal.classList.contains('hidden')) return;

    if (e.key === 'Escape') window.closeLightbox();
    if (e.key === 'ArrowLeft') window.navigateLightbox(-1);
    if (e.key === 'ArrowRight') window.navigateLightbox(1);
});

// [Added] Expense Detail Modal
function openExpenseModal() {
    renderExpenseModal();
    const modal = document.getElementById('expense-detail-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}
window.openExpenseModal = openExpenseModal;

function closeExpenseModal() {
    const modal = document.getElementById('expense-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}
window.closeExpenseModal = closeExpenseModal;

function renderExpenseModal() {
    const listContainer = document.getElementById('modal-expense-list');
    const totalEl = document.getElementById('modal-total-budget');
    if (!listContainer || !totalEl) return;

    listContainer.innerHTML = '';
    let grandTotal = 0;
    let hasExpenses = false;

    if (travelData.days) {
        travelData.days.forEach((day, dIdx) => {
            const dayExpenses = [];

            if (day.timeline) {
                day.timeline.forEach(item => {
                    if (item.expenses && item.expenses.length > 0) {
                        item.expenses.forEach(exp => {
                            dayExpenses.push({
                                title: item.title,
                                icon: item.icon,
                                desc: exp.description || exp.desc || '내역 없음',
                                amount: Number(exp.amount || exp.cost || 0)
                            });
                            grandTotal += Number(exp.amount || exp.cost || 0);
                        });
                    } else if (item.budget && Number(item.budget) > 0) {
                        // 레거시 호환
                        dayExpenses.push({
                            title: item.title,
                            icon: item.icon,
                            desc: '예상 지출',
                            amount: Number(item.budget)
                        });
                        grandTotal += Number(item.budget);
                    }
                });
            }

            if (dayExpenses.length > 0) {
                hasExpenses = true;
                const dateHeader = document.createElement('div');
                dateHeader.className = "flex items-center gap-2 mb-2 mt-4 first:mt-0";
                dateHeader.innerHTML = `
                    <div class="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                    <span class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">${dIdx + 1}일차 (${day.date})</span>
                `;
                listContainer.appendChild(dateHeader);

                dayExpenses.forEach(exp => {
                    const el = document.createElement('div');
                    el.className = "flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50";
                    el.innerHTML = `
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div class="w-8 h-8 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-gray-400 shrink-0 shadow-sm">
                                <span class="material-symbols-outlined text-base">${exp.icon || 'payments'}</span>
                            </div>
                            <div class="flex flex-col min-w-0">
                                <span class="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">${exp.desc}</span>
                                <span class="text-xs text-gray-400 truncate">${exp.title}</span>
                            </div>
                        </div>
                        <span class="font-bold text-text-main dark:text-white shrink-0 ml-2">₩${exp.amount.toLocaleString()}</span>
                    `;
                    listContainer.appendChild(el);
                });
            }
        });
    }

    if (!hasExpenses) {
        listContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2 opacity-50">money_off</span>
                <p class="text-sm">등록된 지출 내역이 없습니다.</p>
            </div>
        `;
    }

    totalEl.textContent = `₩${grandTotal.toLocaleString()}`;
}

// Start
initViewer();

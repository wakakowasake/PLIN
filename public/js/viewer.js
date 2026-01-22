import { db, firebaseReady } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { setTravelData, travelData, setCurrentTripId, setCurrentDayIndex, setIsReadOnlyMode } from './state.js'; // setReadOnlyMode might need to be added or simulated
import { renderItinerary, renderLists, renderWeeklyWeather } from './ui/renderers.js';
import { formatTime } from './ui/time-helpers.js';
import { updateTotalBudget } from './ui/expense-manager.js'; // [Added] Import Budget Manager

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
            budgetCard.onclick = window.openExpenseModal;
            budgetCard.classList.add('cursor-pointer', 'hover:shadow-lg', 'transition-all', 'hover:-translate-y-1');

            // "클릭하여 상세 보기" 텍스트 업데이트
            const descEl = budgetCard.querySelector('p.text-xs');
            if (descEl) descEl.textContent = "클릭하여 상세 보기";
        }
    }
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
window.openExpenseModal = () => {
    renderExpenseModal();
    const modal = document.getElementById('expense-detail-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
};

window.closeExpenseModal = () => {
    const modal = document.getElementById('expense-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
};

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

import { db, firebaseReady } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { setTravelData, travelData, setCurrentTripId, setCurrentDayIndex, setIsReadOnlyMode } from './state.js'; // setReadOnlyMode might need to be added or simulated
import { renderItinerary, renderLists, renderWeeklyWeather } from './ui/renderers.js';
import { formatTime } from './ui/time-helpers.js';

import { BACKEND_URL } from './config.js';

// Global context for renderers (simulating ui.js environment)
// Global context for renderers (simulating ui.js environment)
window.renderLists = renderLists;
window.updateLocalTimeWidget = () => { };

// [Fix] Stub functions to prevent ReferenceError in Viewer
window.viewTimelineItem = (index, dayIndex) => { console.log("View item:", index, dayIndex); };
window.viewRouteDetail = (index, dayIndex) => { console.log("View route:", index, dayIndex); }; // TODO: Implement route detail view if needed
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
        if (modal) modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
};

window.closeLightbox = () => {
    const modal = document.getElementById('lightbox-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
};

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

// Start
initViewer();

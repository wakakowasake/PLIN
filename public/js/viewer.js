import { initFirebase, db, firebaseReady } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { setTravelData, travelData, setCurrentTripId, setCurrentDayIndex, setReadOnlyMode } from './state.js'; // setReadOnlyMode might need to be added or simulated
import { renderItinerary, renderLists, renderWeeklyWeather } from './ui/renderers.js';
import { loadWeather } from './ui/weather.js'; // Optional: if we want weather
import { formatTime } from './ui/time-helpers.js';

// Global context for renderers (simulating ui.js environment)
window.renderLists = renderLists;
window.updateLocalTimeWidget = () => { }; // Viewer doesn't need complex local time widget updates for now or can implement simple one
window.viewTimelineItem = (index, dayIndex) => {
    // Basic view wrapper - maybe show simple modal or just nothing for now
    console.log("View item:", index, dayIndex);
    // In viewer, maybe we don't open modals, or we implement a read-only modal later.
    // For now, let's keep it simple.
};
window.openRouteModal = () => {
    const modal = document.getElementById('route-modal');
    if (modal) modal.classList.remove('hidden');
    // Map init logic would go here if needed, or simple static map
};
window.closeRouteModal = () => {
    const modal = document.getElementById('route-modal');
    if (modal) modal.classList.add('hidden');
};

async function initViewer() {
    try {
        await firebaseReady;

        // URL Parameter Check
        const urlParams = new URLSearchParams(window.location.search);
        // Supports ?share=ID, ?id=ID, ?invite=ID (all treated as read-only view)
        const tripId = urlParams.get('id') || urlParams.get('share') || urlParams.get('invite');

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

            // Weather (Optional)
            if (data.days && data.days.length > 0) {
                // loadWeather(data.days[0].date); // weather.js might need adaptation
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
window.openLightbox = (dayIndex, itemIndex, memIndex) => {
    // Simple alert or implement simple lightbox if needed
    // For MVP viewer, maybe just ignore or open image in new tab
    const item = travelData.days[dayIndex].timeline[itemIndex];
    const mem = item.memories[memIndex];
    if (mem && mem.photoUrl) {
        window.open(mem.photoUrl, '_blank');
    }
};

// Start
initViewer();

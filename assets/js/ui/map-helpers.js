import { travelData, setTravelData } from '../state.js';
import logger from '../logger.js';

export function openRouteModal(routeInfo) {
    const el = document.getElementById('route-modal');
    if (!el) return;
    el.classList.remove('hidden');
    // minimal display
    const content = el.querySelector('.content');
    if (content) content.innerText = routeInfo ? JSON.stringify(routeInfo) : '경로 정보가 없습니다.';
}

export async function fetchTransitTime(origin, destination) {
    // Placeholder: real implementation should call Google Maps Directions API
    logger.log('fetchTransitTime', origin, destination);
    return { durationText: '약 15분', duration: 15 };
}

export function setupItemAutocomplete(inputEl, onSelect) {
    if (!inputEl) return;
    inputEl.addEventListener('change', (e) => {
        onSelect && onSelect(e.target.value);
    });
}

export default {
    openRouteModal,
    fetchTransitTime,
    setupItemAutocomplete
};

import { travelData, setTravelData, currentTripId } from '../state.js';
import logger from '../logger.js';

export async function saveNewItem(dayIndex, item) {
    if (!travelData.days[dayIndex]) travelData.days[dayIndex] = { date: '', timeline: [] };
    travelData.days[dayIndex].timeline.push(item);
    setTravelData(travelData);
    logger.debug('saveNewItem saved locally', item);

    // Firestore sync is handled elsewhere; keep this function focused on state mutation
}

export function deleteTimelineItem(dayIndex, itemIndex) {
    if (!travelData.days[dayIndex] || !travelData.days[dayIndex].timeline[itemIndex]) return;
    travelData.days[dayIndex].timeline.splice(itemIndex, 1);
    setTravelData(travelData);
}

export function addTimelineItem(dayIndex, index, item) {
    const timeline = travelData.days[dayIndex].timeline;
    timeline.splice(index, 0, item);
    setTravelData(travelData);
}

/**
 * 로그인 (Placeholder)
 * @todo Firebase Auth UI 또는 연동 로직을 여기에 구현해야 합니다.
 * 현재는 기능 없이 로그만 출력합니다.
 */
export async function login() {
    logger.debug('[Auth] login called - Not implemented yet.');
    alert('로그인 기능은 아직 구현되지 않았습니다. Firebase Auth 연동이 필요합니다.');
}

/**
 * 로그아웃 (Placeholder)
 * @todo Firebase signOut 로직을 여기에 구현해야 합니다.
 */
export async function logout() {
    logger.debug('[Auth] logout called - Not implemented yet.');
    // firebase.auth().signOut()...
}

export function saveProfileChanges(profile) {
    if (!travelData.meta) travelData.meta = {};
    travelData.meta = { ...travelData.meta, ...profile };
    setTravelData(travelData);
}

export default {
    saveNewItem,
    deleteTimelineItem,
    addTimelineItem,
    login,
    logout,
    saveProfileChanges
};

import { travelData, setTravelData, currentTripId } from '../state.js';

export async function saveNewItem(dayIndex, item) {
    if (!travelData.days[dayIndex]) travelData.days[dayIndex] = { date: '', timeline: [] };
    travelData.days[dayIndex].timeline.push(item);
    setTravelData(travelData);
    console.log('saveNewItem saved locally', item);

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

export async function login() {
    console.log('login placeholder - use firebase auth in main ui module');
}

export async function logout() {
    console.log('logout placeholder - use firebase auth in main ui module');
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

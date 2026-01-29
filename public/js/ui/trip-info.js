// Trip Info Editor Module
// Handles editing trip metadata (title, dates, hero image)
import { db, auth } from '../firebase.js';
import { collection, doc, addDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { showToast, showLoading, hideLoading } from './modals.js';

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
    const title = document.getElementById('edit-trip-title').value.trim();
    const location = document.getElementById('edit-trip-location') ? document.getElementById('edit-trip-location').value.trim() : "";
    const startStr = document.getElementById('edit-trip-start').value;
    const endStr = document.getElementById('edit-trip-end').value;

    if (!title) return showToast("여행 제목을 입력해주세요! 🏝️", 'warning');
    if (!startStr || !endStr) return showToast("여행 날짜를 선택해주세요! 📅", 'warning');

    const start = new Date(startStr);
    const end = new Date(endStr);

    if (end < start) return showToast("종료일이 시작일보다 빠를 수 없어요 😅", 'warning');

    // Update title
    updateMeta('title', title);

    // Calculate and update dates and duration
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const durationText = (diffDays === 0) ? "당일치기" : `${diffDays}박 ${diffDays + 1}일`;
    updateMeta('dayCount', durationText);

    // Update sub info (date text)
    const format = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    let dateStr = format(start);
    if (durationText !== "당일치기") {
        dateStr += ` - ${end.getMonth() + 1}월 ${end.getDate()}일`;
    }
    updateMeta('subInfo', location ? `${location} • ${dateStr}` : dateStr);

    // Rebuild days array
    const totalDays = diffDays + 1;
    const currentTotalDays = travelData.days.length;

    // If days increased
    if (totalDays > currentTotalDays) {
        for (let i = currentTotalDays; i < totalDays; i++) {
            travelData.days.push({ date: "", timeline: [] });
        }
    } else if (totalDays < currentTotalDays) {
        // If days decreased, remove from the end
        travelData.days.splice(totalDays);
    }

    // Update date values
    travelData.days.forEach((day, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        day.date = d.toISOString().split('T')[0];
    });

    // Ensure current index is within bounds
    if (currentDayIndex >= travelData.days.length) {
        selectDay(travelData.days.length - 1);
    }

    renderItinerary();
    autoSave();
    closeTripInfoModal();
}

/**
 * Reset hero image to default
 * @param {Object} travelData - Travel data object
 * @param {Function} updateMeta - Function to update metadata
 * @param {Function} renderItinerary - Function to re-render itinerary
 * @param {Function} autoSave - Function to auto-save data
 */
export function resetHeroImage(travelData, updateMeta, renderItinerary, autoSave) {
    if (confirm("배경 이미지를 초기 설정된 이미지로 되돌리시겠습니까?")) {
        const defaultImg = travelData.meta.defaultMapImage || "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop";
        updateMeta('mapImage', defaultImg);
        renderItinerary();
        autoSave();
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

        // Ensure members and ownership
        if (!cleanData.members) cleanData.members = {};
        cleanData.members[user.uid] = 'owner';
        cleanData.createdBy = user.uid;
        cleanData.createdAt = cleanData.createdAt || new Date().toISOString();

        if (tripId) {
            const docRef = doc(db, "plans", tripId);
            await updateDoc(docRef, cleanData);
            showToast("데이터가 성공적으로 동기화되었습니다! ☁️");
        } else {
            console.log("[Guest Mode] Creating new document for guest data...");
            const docRef = await addDoc(collection(db, "plans"), cleanData);
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

// Trip Info Editor Module
// Handles editing trip metadata (title, dates, hero image)

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
    const startStr = document.getElementById('edit-trip-start').value;
    const endStr = document.getElementById('edit-trip-end').value;

    if (!title) return alert("여행 제목을 입력해주세요.");
    if (!startStr || !endStr) return alert("날짜를 선택해주세요.");

    const start = new Date(startStr);
    const end = new Date(endStr);

    if (end < start) return alert("종료일은 시작일보다 빠를 수 없습니다.");

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
    let prefix = travelData.meta.subInfo && travelData.meta.subInfo.includes('•') ? travelData.meta.subInfo.split('•')[0].trim() : "";
    updateMeta('subInfo', prefix ? `${prefix} • ${dateStr}` : dateStr);

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
        const defaultImg = travelData.meta.defaultMapImage || "https://placehold.co/600x400";
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
    if (confirm("배경 이미지를 삭제하시겠습니까?")) {
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

/**
 * Time Helper Utilities
 * 시간 계산 및 포맷팅 유틸리티
 */

/**
 * 아이템의 종료 시간 계산
 * @param {string} startTime - "09:00" 또는 "9:00" 형식
 * @param {number} duration - 분 단위 (기본값: 30분)
 * @returns {string} "10:30" 형식 (항상 2자리)
 */
export function calculateEndTime(startTime, duration = 30) {
    if (!startTime || typeof startTime !== 'string') {
        return '--:--';
    }

    try {
        const [hours, minutes] = startTime.split(':').map(Number);

        if (isNaN(hours) || isNaN(minutes)) {
            return '--:--';
        }

        const totalMinutes = hours * 60 + minutes + duration;
        const endHours = Math.floor(totalMinutes / 60) % 24;
        const endMinutes = totalMinutes % 60;

        return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
    } catch (error) {
        console.error('Error calculating end time:', error);
        return '--:--';
    }
}

/**
 * 시간 포맷팅 (항상 2자리)
 * @param {string} time - "09:00" 또는 "9:00" 형식
 * @returns {string} "09:00" (항상 2자리)
 */
export function formatTime(time) {
    if (!time || typeof time !== 'string') {
        return '--:--';
    }

    try {
        const [hours, minutes] = time.split(':').map(Number);

        if (isNaN(hours) || isNaN(minutes)) {
            return '--:--';
        }

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    } catch (error) {
        return time; // 파싱 실패 시 원본 반환
    }
}

/**
 * 두 시간 사이의 분 차이 계산
 * @param {string} startTime - "09:00" 형식
 * @param {string} endTime - "10:30" 형식
 * @returns {number} 분 단위 차이
 */
export function getTimeDifference(startTime, endTime) {
    try {
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);

        const startTotal = startHours * 60 + startMinutes;
        const endTotal = endHours * 60 + endMinutes;

        return endTotal - startTotal;
    } catch (error) {
        console.error('Error calculating time difference:', error);
        return 0;
    }
}

export default {
    calculateEndTime,
    formatTime,
    getTimeDifference
};

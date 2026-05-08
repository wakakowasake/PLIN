/**
 * Time Helper Utilities
 * Phase 1.5 canonical source for core/utils.
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
        return time;
    }
}

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

export {
    formatAirportSelectionValue,
    getAirportSuggestions
} from './airports-data.js';
export {
    calculateFlightDurationDetails,
    calculateArrivalTimeValue,
    calculateFlightDurationValue,
    formatTimeZoneOffsetLabel
} from '../../../../shared/features/transit/flight-time-helpers.js';

export function createAirportSuggestionState() {
    return {
        departure: { results: [], selectedIndex: 0 },
        arrival: { results: [], selectedIndex: 0 }
    };
}

export function getAirportSelectionIndex(currentIndex, key, resultCount) {
    if (!resultCount) return 0;

    if (key === 'ArrowDown') {
        return Math.min(currentIndex + 1, resultCount - 1);
    }

    if (key === 'ArrowUp') {
        return Math.max(currentIndex - 1, 0);
    }

    return currentIndex;
}

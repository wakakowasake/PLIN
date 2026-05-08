import AsyncStorage from '@react-native-async-storage/async-storage';

export type PersistedTripListViewMode = 'card' | 'feed';
export type PersistedCommunityViewMode = 'card' | 'feed';

const TRIP_LIST_VIEW_MODE_STORAGE_KEY = 'plin:trip-list:view-mode';
const COMMUNITY_VIEW_MODE_STORAGE_KEY = 'plin:community:view-mode';

function normalizeTripListViewMode(value: string | null): PersistedTripListViewMode | null {
    if (value === 'card' || value === 'feed') {
        return value;
    }

    if (value === 'list') {
        return 'feed';
    }

    return null;
}

function normalizeCommunityViewMode(value: string | null): PersistedCommunityViewMode | null {
    if (value === 'card' || value === 'feed') {
        return value;
    }

    if (value === 'list') {
        return 'feed';
    }

    return null;
}

async function readViewMode<T extends string>(
    storageKey: string,
    normalize: (value: string | null) => T | null
): Promise<T | null> {
    try {
        const storedValue = await AsyncStorage.getItem(storageKey);
        return normalize(storedValue);
    } catch {
        return null;
    }
}

async function writeViewMode(storageKey: string, value: string) {
    try {
        await AsyncStorage.setItem(storageKey, value);
    } catch {
        // Ignore persistence failures and keep the in-memory selection.
    }
}

export function readTripListViewMode() {
    return readViewMode(TRIP_LIST_VIEW_MODE_STORAGE_KEY, normalizeTripListViewMode);
}

export function writeTripListViewMode(value: PersistedTripListViewMode) {
    return writeViewMode(TRIP_LIST_VIEW_MODE_STORAGE_KEY, value);
}

export function readCommunityViewMode() {
    return readViewMode(COMMUNITY_VIEW_MODE_STORAGE_KEY, normalizeCommunityViewMode);
}

export function writeCommunityViewMode(value: PersistedCommunityViewMode) {
    return writeViewMode(COMMUNITY_VIEW_MODE_STORAGE_KEY, value);
}

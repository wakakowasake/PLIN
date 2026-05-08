import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchBackendJson } from '@/services/backend-client';

export type FlightLookupDirection = 'any' | 'departure' | 'arrival';

export type FlightLookupInput = {
    airportCode?: string;
    direction?: FlightLookupDirection;
    flightDate?: string;
    flightNumber: string;
};

export type FlightStatusItem = {
    airlineName?: string;
    baggageClaimLabel?: string;
    checkInCounterLabel?: string;
    destinationCode?: string;
    destinationName?: string;
    direction?: Exclude<FlightLookupDirection, 'any'>;
    estimatedTimeLabel?: string;
    flightNumber: string;
    gateLabel?: string;
    id: string;
    originCode?: string;
    originName?: string;
    providerLabel: string;
    scheduledTimeLabel?: string;
    sourceLabel?: string;
    statusLabel?: string;
    terminalLabel?: string;
};

export type FlightStatusLookupResponse = {
    flights: FlightStatusItem[];
    isConfigured: boolean;
    message?: string;
    sourceLabels: string[];
};

export type SavedFlightCard = FlightStatusItem & {
    savedAt: string;
};

const SAVED_FLIGHT_CARDS_STORAGE_KEY = 'plin:flight-cards:v1';

function normalizeText(value: string | null | undefined) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeFlightNumber(value: string) {
    return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeSavedFlightCard(value: unknown): SavedFlightCard | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Partial<SavedFlightCard>;
    const id = normalizeText(source.id);
    const flightNumber = normalizeFlightNumber(source.flightNumber || '');
    const savedAt = normalizeText(source.savedAt);
    const providerLabel = normalizeText(source.providerLabel) || 'PLIN';

    if (!id || !flightNumber || !savedAt) {
        return null;
    }

    return {
        id,
        flightNumber,
        savedAt,
        providerLabel,
        airlineName: normalizeText(source.airlineName) || undefined,
        baggageClaimLabel: normalizeText(source.baggageClaimLabel) || undefined,
        checkInCounterLabel: normalizeText(source.checkInCounterLabel) || undefined,
        destinationCode: normalizeText(source.destinationCode) || undefined,
        destinationName: normalizeText(source.destinationName) || undefined,
        direction: source.direction === 'departure' || source.direction === 'arrival'
            ? source.direction
            : undefined,
        estimatedTimeLabel: normalizeText(source.estimatedTimeLabel) || undefined,
        gateLabel: normalizeText(source.gateLabel) || undefined,
        originCode: normalizeText(source.originCode) || undefined,
        originName: normalizeText(source.originName) || undefined,
        scheduledTimeLabel: normalizeText(source.scheduledTimeLabel) || undefined,
        sourceLabel: normalizeText(source.sourceLabel) || undefined,
        statusLabel: normalizeText(source.statusLabel) || undefined,
        terminalLabel: normalizeText(source.terminalLabel) || undefined
    };
}

export function buildManualFlightCard(input: FlightLookupInput): FlightStatusItem {
    const flightNumber = normalizeFlightNumber(input.flightNumber);
    const airportCode = normalizeText(input.airportCode).toUpperCase();
    const direction = input.direction === 'departure' || input.direction === 'arrival'
        ? input.direction
        : undefined;

    return {
        id: `manual:${flightNumber}:${normalizeText(input.flightDate) || 'date-unknown'}:${airportCode || 'airport-unknown'}:${direction || 'any'}`,
        flightNumber,
        providerLabel: '직접 입력',
        sourceLabel: '공개 운항 데이터 연결 전 임시 카드',
        statusLabel: '등록됨',
        direction,
        originCode: direction === 'departure' ? airportCode || undefined : undefined,
        destinationCode: direction === 'arrival' ? airportCode || undefined : undefined,
        scheduledTimeLabel: normalizeText(input.flightDate) || undefined
    };
}

export async function lookupFlightStatus(
    input: FlightLookupInput,
    signal?: AbortSignal
): Promise<FlightStatusLookupResponse> {
    const flightNumber = normalizeFlightNumber(input.flightNumber);
    if (!flightNumber) {
        return {
            flights: [],
            isConfigured: false,
            message: '항공편 번호를 입력해 주세요.',
            sourceLabels: []
        };
    }

    const searchParams = new URLSearchParams({
        flightNumber
    });
    const flightDate = normalizeText(input.flightDate);
    const airportCode = normalizeText(input.airportCode).toUpperCase();
    const direction = input.direction || 'any';

    if (flightDate) {
        searchParams.set('date', flightDate);
    }
    if (airportCode) {
        searchParams.set('airportCode', airportCode);
    }
    if (direction !== 'any') {
        searchParams.set('direction', direction);
    }

    return fetchBackendJson<FlightStatusLookupResponse>(
        `/flights/status?${searchParams.toString()}`,
        { signal }
    );
}

export async function readSavedFlightCards(): Promise<SavedFlightCard[]> {
    try {
        const rawValue = await AsyncStorage.getItem(SAVED_FLIGHT_CARDS_STORAGE_KEY);
        const parsedValue = rawValue ? JSON.parse(rawValue) : [];
        if (!Array.isArray(parsedValue)) {
            return [];
        }

        return parsedValue
            .map((entry) => normalizeSavedFlightCard(entry))
            .filter((entry): entry is SavedFlightCard => Boolean(entry));
    } catch {
        return [];
    }
}

export async function saveFlightCard(card: FlightStatusItem): Promise<SavedFlightCard[]> {
    const normalizedCard = normalizeSavedFlightCard({
        ...card,
        savedAt: new Date().toISOString()
    });
    if (!normalizedCard) {
        return readSavedFlightCards();
    }

    const currentCards = await readSavedFlightCards();
    const nextCards = [
        normalizedCard,
        ...currentCards.filter((entry) => entry.id !== normalizedCard.id)
    ].slice(0, 12);

    await AsyncStorage.setItem(SAVED_FLIGHT_CARDS_STORAGE_KEY, JSON.stringify(nextCards));
    return nextCards;
}

export async function removeSavedFlightCard(cardId: string): Promise<SavedFlightCard[]> {
    const safeCardId = normalizeText(cardId);
    const currentCards = await readSavedFlightCards();
    const nextCards = currentCards.filter((entry) => entry.id !== safeCardId);

    await AsyncStorage.setItem(SAVED_FLIGHT_CARDS_STORAGE_KEY, JSON.stringify(nextCards));
    return nextCards;
}

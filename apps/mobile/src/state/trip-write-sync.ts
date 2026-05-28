import { useSyncExternalStore } from 'react';

import type { MobileTripDetail, MobileTripSummary } from '@/types/trip';

type Snapshot = {
    listVersion: number;
    writeVersionsByTripId: Record<string, number>;
    writtenDetailsByTripId: Record<string, MobileTripDetail>;
    writtenSummariesByTripId: Record<string, MobileTripSummary>;
    deletedTripIds: Record<string, boolean>;
};

let snapshot: Snapshot = {
    listVersion: 0,
    writeVersionsByTripId: {},
    writtenDetailsByTripId: {},
    writtenSummariesByTripId: {},
    deletedTripIds: {}
};

const listeners = new Set<() => void>();

function emitChange() {
    listeners.forEach((listener) => {
        listener();
    });
}

function subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot() {
    return snapshot;
}

function buildTripSummary(
    detail: MobileTripDetail,
    previousSummary?: MobileTripSummary | null
): MobileTripSummary {
    const safeEditInfo = detail?.editInfo || {
        startDate: '',
        endDate: ''
    };
    const safePermissions = detail?.permissions || {
        role: '',
        canEditContent: false,
        canManageShare: false,
        canSendAnnouncement: false,
        canDeleteTrip: false,
        canPublishCommunity: false,
        canDuplicateTrip: false
    };
    const nowIso = new Date().toISOString();
    const createdAt = detail.createdAt || previousSummary?.createdAt || detail.updatedAt || nowIso;
    const updatedAt = detail.updatedAt || nowIso;

    return {
        id: detail.id,
        title: detail.title,
        subInfo: detail.subInfo,
        dayCount: detail.dayCount,
        purpose: detail.purpose,
        startDate: safeEditInfo.startDate,
        endDate: safeEditInfo.endDate,
        createdAt,
        updatedAt,
        contentVersion: detail.contentVersion,
        coverImage: detail.coverImage,
        status: detail.status,
        permissions: safePermissions
    };
}

export function publishTripDetailUpdated(detail: MobileTripDetail) {
    const nextTripVersion = (snapshot.writeVersionsByTripId[detail.id] || 0) + 1;
    const nextSummary = buildTripSummary(detail, snapshot.writtenSummariesByTripId[detail.id] || null);
    const { [detail.id]: _deletedTripId, ...remainingDeletedTripIds } = snapshot.deletedTripIds;

    snapshot = {
        listVersion: snapshot.listVersion + 1,
        writeVersionsByTripId: {
            ...snapshot.writeVersionsByTripId,
            [detail.id]: nextTripVersion
        },
        writtenDetailsByTripId: {
            ...snapshot.writtenDetailsByTripId,
            [detail.id]: detail
        },
        writtenSummariesByTripId: {
            ...snapshot.writtenSummariesByTripId,
            [detail.id]: nextSummary
        },
        deletedTripIds: remainingDeletedTripIds
    };
    emitChange();
}

export function publishTripInfoUpdated(detail: MobileTripDetail) {
    publishTripDetailUpdated(detail);
}

export function publishTripCreated(detail: MobileTripDetail) {
    publishTripDetailUpdated(detail);
}

export function publishTripDeleted(tripId: string) {
    const nextTripVersion = (snapshot.writeVersionsByTripId[tripId] || 0) + 1;
    const { [tripId]: _removedDetail, ...remainingDetails } = snapshot.writtenDetailsByTripId;
    const { [tripId]: _removedSummary, ...remainingSummaries } = snapshot.writtenSummariesByTripId;

    snapshot = {
        listVersion: snapshot.listVersion + 1,
        writeVersionsByTripId: {
            ...snapshot.writeVersionsByTripId,
            [tripId]: nextTripVersion
        },
        writtenDetailsByTripId: remainingDetails,
        writtenSummariesByTripId: remainingSummaries,
        deletedTripIds: {
            ...snapshot.deletedTripIds,
            [tripId]: true
        }
    };
    emitChange();
}

export function resetTripWriteSync() {
    if (
        snapshot.listVersion === 0
        && Object.keys(snapshot.writeVersionsByTripId).length === 0
        && Object.keys(snapshot.writtenDetailsByTripId).length === 0
        && Object.keys(snapshot.writtenSummariesByTripId).length === 0
        && Object.keys(snapshot.deletedTripIds).length === 0
    ) {
        return;
    }

    snapshot = {
        listVersion: 0,
        writeVersionsByTripId: {},
        writtenDetailsByTripId: {},
        writtenSummariesByTripId: {},
        deletedTripIds: {}
    };
    emitChange();
}

export function useTripWriteSync(tripId?: string) {
    const currentSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    return {
        listVersion: currentSnapshot.listVersion,
        tripVersion: tripId ? currentSnapshot.writeVersionsByTripId[tripId] || 0 : 0,
        writtenDetail: tripId ? currentSnapshot.writtenDetailsByTripId[tripId] || null : null,
        writtenSummary: tripId ? currentSnapshot.writtenSummariesByTripId[tripId] || null : null,
        writtenSummariesByTripId: currentSnapshot.writtenSummariesByTripId,
        deletedTripIds: currentSnapshot.deletedTripIds
    };
}

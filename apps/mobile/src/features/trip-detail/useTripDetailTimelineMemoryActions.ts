import React from 'react';

import type { TripRepository } from '@/adapters/trips/TripRepository';
import {
    isTripMemoryPhotoLimitMessage,
    uploadTripMemoryAssets,
    type PickedTripMemoryAsset
} from '@/services/trip-memory-upload';
import type { MobileTripDetail } from '@/types/trip';
import { promptSubscriptionUpgradeForMemoryLimit } from '@/utils/subscription-upgrade-prompt';

type TimelineMemoryComposerTarget = {
    dayId: string;
    dayIndex: number;
    dayLabel: string;
    dayDate: string;
    itemId: string;
    itemIndex: number;
    itemTitle: string;
} | null;

type RecoverTripWriteConflict = (
    message: string,
    options: { inlineError: React.Dispatch<React.SetStateAction<string | null>> }
) => Promise<boolean>;

type Options = {
    userId: string | null | undefined;
    tripId: string;
    target: TimelineMemoryComposerTarget;
    isSaving: boolean;
    setSaving: React.Dispatch<React.SetStateAction<boolean>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
    setTarget: React.Dispatch<React.SetStateAction<TimelineMemoryComposerTarget>>;
    tripRepository: Pick<TripRepository, 'appendTimelineItemMemories'>;
    publishTripDetailUpdatedWithFeedback(detail: MobileTripDetail): void;
    recoverTripWriteConflict: RecoverTripWriteConflict;
};

export function useTripDetailTimelineMemoryActions({
    userId,
    tripId,
    target,
    isSaving,
    setSaving,
    setError,
    setTarget,
    tripRepository,
    publishTripDetailUpdatedWithFeedback,
    recoverTripWriteConflict
}: Options) {
    const handleSubmitTimelineMemory = React.useCallback(async (input: { assets: PickedTripMemoryAsset[] }) => {
        if (!userId || !target || isSaving) {
            return;
        }

        try {
            setSaving(true);
            setError(null);

            const uploadedMemoryEntries = await uploadTripMemoryAssets({
                tripId,
                dayIndex: target.dayIndex,
                itemIndex: target.itemIndex,
                assets: input.assets
            });
            const createdAt = new Date().toISOString();
            const updatedTrip = await tripRepository.appendTimelineItemMemories(
                userId,
                tripId,
                target.dayId,
                target.itemId,
                target.itemIndex,
                {
                    uploadedPhotoUrls: uploadedMemoryEntries.map((entry) => entry.photoUrl),
                    uploadedMemoryEntries,
                    createdAt
                }
            );

            if (!updatedTrip) {
                throw new Error('추억을 추가하지 못했어요.');
            }

            publishTripDetailUpdatedWithFeedback(updatedTrip);
            setTarget(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : '추억을 추가하지 못했어요.';
            if (await recoverTripWriteConflict(message, { inlineError: setError })) {
                return;
            }
            if (isTripMemoryPhotoLimitMessage(message)) {
                promptSubscriptionUpgradeForMemoryLimit({
                    userId,
                    message,
                    onError: setError
                });
            }
            setError(message);
        } finally {
            setSaving(false);
        }
    }, [
        isSaving,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        setError,
        setSaving,
        setTarget,
        target,
        tripId,
        tripRepository,
        userId
    ]);

    return {
        handleSubmitTimelineMemory
    };
}

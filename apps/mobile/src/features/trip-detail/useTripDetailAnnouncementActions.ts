import React from 'react';
import { Alert } from 'react-native';

import type { MobileTripDetail } from '@/types/trip';

function getTripAnnouncementService() {
    return require('../../services/trip-announcements') as typeof import('../../services/trip-announcements');
}

type Options = {
    detail: MobileTripDetail | null;
    canSendAnnouncement: boolean;
    isOfflineMode: boolean;
    onRequestOpenAnnouncementSheet(): void;
    onRequestCloseAnnouncementSheet(): void;
};

export function useTripDetailAnnouncementActions({
    detail,
    canSendAnnouncement,
    isOfflineMode,
    onRequestOpenAnnouncementSheet,
    onRequestCloseAnnouncementSheet
}: Options) {
    const [tripAnnouncementError, setTripAnnouncementError] = React.useState<string | null>(null);
    const [isTripAnnouncementSending, setTripAnnouncementSending] = React.useState(false);

    const canCloseTripAnnouncementSheet = !isTripAnnouncementSending;

    const handleOpenTripAnnouncementSheet = React.useCallback(() => {
        if (!detail || !canSendAnnouncement || isTripAnnouncementSending || isOfflineMode) {
            return;
        }

        setTripAnnouncementError(null);
        onRequestOpenAnnouncementSheet();
    }, [
        canSendAnnouncement,
        detail,
        isOfflineMode,
        isTripAnnouncementSending,
        onRequestOpenAnnouncementSheet
    ]);

    const closeTripAnnouncementSheet = React.useCallback(() => {
        if (!canCloseTripAnnouncementSheet) {
            return;
        }

        onRequestCloseAnnouncementSheet();
        setTripAnnouncementError(null);
    }, [canCloseTripAnnouncementSheet, onRequestCloseAnnouncementSheet]);

    const handleSubmitTripAnnouncement = React.useCallback(async (input: { title: string; body: string }) => {
        if (!detail || isTripAnnouncementSending) {
            return;
        }

        setTripAnnouncementSending(true);
        setTripAnnouncementError(null);

        try {
            const { buildTripAnnouncementResultMessage, sendTripAnnouncement } = getTripAnnouncementService();
            const result = await sendTripAnnouncement(detail.id, input);
            onRequestCloseAnnouncementSheet();
            Alert.alert('잘 전송했어요', buildTripAnnouncementResultMessage(result));
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : '참가자 공지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.';
            setTripAnnouncementError(message);
            Alert.alert('공지 발송 실패', message);
        } finally {
            setTripAnnouncementSending(false);
        }
    }, [detail, isTripAnnouncementSending, onRequestCloseAnnouncementSheet]);

    return {
        tripAnnouncementError,
        isTripAnnouncementSending,
        canCloseTripAnnouncementSheet,
        handleOpenTripAnnouncementSheet,
        closeTripAnnouncementSheet,
        handleSubmitTripAnnouncement
    };
}

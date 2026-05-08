import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { getMobileFirestore } from '@/adapters/firebase/mobile-firebase';
import { isIosDevCapabilityWorkaroundEnabled } from '@/config/mobile-runtime-config';
import { fetchBackendJson } from '@/services/backend-client';
import { configureTripReminderNotifications } from '@/services/trip-reminders';

const PUSH_INSTALLATION_ID_STORAGE_KEY = 'plin:push-installation-id:v1';

export type TripAnnouncementSendInput = {
    title?: string;
    body: string;
};

export type TripAnnouncementSendResponse = {
    tripId: string;
    title: string;
    body: string;
    memberCount: number;
    deliveryMemberCount: number;
    membersWithoutPushCount: number;
    deviceCount: number;
    sentCount: number;
    failedCount: number;
    invalidInstallationCount: number;
};

function isNotificationGranted(settings: Notifications.NotificationPermissionsStatus) {
    return settings.granted
        || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

function readExpoProjectId() {
    const constants = Constants as unknown as {
        easConfig?: { projectId?: string | null };
        expoConfig?: {
            extra?: {
                eas?: { projectId?: string | null };
            };
        };
    };

    const easProjectId = typeof constants.easConfig?.projectId === 'string'
        ? constants.easConfig.projectId.trim()
        : '';
    const extraProjectId = typeof constants.expoConfig?.extra?.eas?.projectId === 'string'
        ? constants.expoConfig.extra.eas.projectId.trim()
        : '';
    const publicEnvProjectId = typeof process.env.EXPO_PUBLIC_PLIN_EAS_PROJECT_ID === 'string'
        ? process.env.EXPO_PUBLIC_PLIN_EAS_PROJECT_ID.trim()
        : '';

    return easProjectId || extraProjectId || publicEnvProjectId;
}

function buildMissingPushProjectIdMessage() {
    return '푸시 설정이 누락되어 알림을 준비하지 못했어요. EXPO_PUBLIC_PLIN_EAS_PROJECT_ID를 설정한 뒤 앱을 다시 빌드해 주세요.';
}

async function getPushInstallationId() {
    const existingId = String(await AsyncStorage.getItem(PUSH_INSTALLATION_ID_STORAGE_KEY) || '').trim();
    if (existingId) {
        return existingId;
    }

    const generatedId = typeof Crypto.randomUUID === 'function'
        ? Crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    await AsyncStorage.setItem(PUSH_INSTALLATION_ID_STORAGE_KEY, generatedId);
    return generatedId;
}

export async function clearTripAnnouncementPushInstallation(userId?: string | null) {
    const safeUserId = String(userId || '').trim();
    if (Platform.OS === 'web' || !safeUserId) {
        return;
    }

    const installationId = String(await AsyncStorage.getItem(PUSH_INSTALLATION_ID_STORAGE_KEY) || '').trim();
    if (!installationId) {
        return;
    }

    await deleteDoc(doc(getMobileFirestore(), 'push_installations', installationId));
}

export async function syncTripAnnouncementPushInstallation(userId?: string | null) {
    const safeUserId = String(userId || '').trim();
    if (Platform.OS === 'web' || !safeUserId) {
        return;
    }

    if (isIosDevCapabilityWorkaroundEnabled()) {
        await clearTripAnnouncementPushInstallation(safeUserId).catch(() => {});
        return;
    }

    await configureTripReminderNotifications();

    let permissionSettings = await Notifications.getPermissionsAsync();
    if (!isNotificationGranted(permissionSettings) && permissionSettings.status === 'undetermined') {
        permissionSettings = await Notifications.requestPermissionsAsync();
    }

    if (!isNotificationGranted(permissionSettings)) {
        await clearTripAnnouncementPushInstallation(safeUserId).catch(() => {});
        return;
    }

    const projectId = readExpoProjectId();
    if (!projectId) {
        await clearTripAnnouncementPushInstallation(safeUserId).catch(() => {});
        throw new Error(buildMissingPushProjectIdMessage());
    }

    const expoPushTokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = String(expoPushTokenResponse.data || '').trim();

    if (!expoPushToken) {
        await clearTripAnnouncementPushInstallation(safeUserId).catch(() => {});
        return;
    }

    const installationId = await getPushInstallationId();
    await setDoc(doc(getMobileFirestore(), 'push_installations', installationId), {
        userId: safeUserId,
        expoPushToken,
        platform: Platform.OS,
        app: 'mobile',
        notificationsEnabled: true,
        updatedAt: new Date().toISOString()
    }, { merge: true });
}

export async function sendTripAnnouncement(tripId: string, input: TripAnnouncementSendInput) {
    return fetchBackendJson<TripAnnouncementSendResponse>(
        `/plans/${encodeURIComponent(tripId)}/announcement-push`,
        {
            method: 'POST',
            body: {
                title: String(input.title || '').trim(),
                body: String(input.body || '').trim()
            }
        }
    );
}

export function buildTripAnnouncementResultMessage(result: TripAnnouncementSendResponse) {
    const parts: string[] = [];

    if (result.sentCount > 0) {
        parts.push(
            result.deliveryMemberCount > 0
                ? `참가자 ${result.deliveryMemberCount}명에게 잘 전송했어요.`
                : '잘 전송했어요.'
        );
    } else if (result.deviceCount > 0) {
        parts.push('이번 전송은 완료되지 않았어요. 잠시 후 다시 시도해 주세요.');
    } else if (result.memberCount > 0) {
        parts.push('알림을 받을 수 있는 참가자를 아직 찾지 못했어요.');
        parts.push('참가자에게 앱을 열고 알림 권한을 확인해 달라고 안내해 주세요.');
    } else {
        parts.push('알림을 보낼 다른 참가자가 아직 없어요.');
    }

    if (result.membersWithoutPushCount > 0) {
        parts.push(`${result.membersWithoutPushCount}명은 아직 알림을 받을 수 없어요.`);
    }

    if (result.failedCount > 0) {
        parts.push('일부 참가자에게는 전송되지 않았어요.');
    }

    return parts.join('\n\n');
}

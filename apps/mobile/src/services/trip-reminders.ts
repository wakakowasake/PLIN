import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { formatTimeStr, parseTimeStr } from '@shared/core/utils/time-value-helpers.js';
import { Platform } from 'react-native';

import type { MobileTimelineDisplayItem, MobileTripDaySection, MobileTripDetail } from '@/types/trip';

const TRIP_REMINDER_STORAGE_KEY = 'plin:trip-reminders';
const TRIP_REMINDER_CHANNEL_ID = 'trip-reminders';
const TRIP_REMINDER_LEAD_MINUTES = 10;

export type TripReminderRecord = {
    notificationId: string;
    tripId: string;
    dayId: string;
    itemId: string;
    itemTitle: string;
    reminderAtIso: string;
    startAtIso: string;
    leadMinutes: number;
};

type StoredTripReminderMap = Record<string, TripReminderRecord>;

export type TripReminderSchedule = {
    startAt: Date;
    reminderAt: Date;
    startTimeLabel: string;
    reminderTimeLabel: string;
    leadMinutes: number;
};

let notificationsConfigured = false;

function buildReminderStorageKey(tripId: string, dayId: string, itemId: string) {
    return `${tripId}:${dayId}:${itemId}`;
}

function isRecordShape(value: unknown): value is StoredTripReminderMap {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readStoredTripReminderMap() {
    try {
        const raw = await AsyncStorage.getItem(TRIP_REMINDER_STORAGE_KEY);
        if (!raw) {
            return {} as StoredTripReminderMap;
        }

        const parsed = JSON.parse(raw) as unknown;
        return isRecordShape(parsed) ? parsed as StoredTripReminderMap : {};
    } catch {
        return {} as StoredTripReminderMap;
    }
}

async function writeStoredTripReminderMap(value: StoredTripReminderMap) {
    await AsyncStorage.setItem(TRIP_REMINDER_STORAGE_KEY, JSON.stringify(value));
}

function parseDayDateParts(dayDate: string) {
    const match = String(dayDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
    }

    return { year, month, day };
}

function resolveTimelineItemStartTime(item: MobileTimelineDisplayItem) {
    const transitWindow = String(item.transitWindowLabel || '').trim();
    if (transitWindow.includes('-')) {
        return transitWindow.split(/\s*-\s*/)[0]?.trim() || '';
    }

    return String(item.timeLabel || '').trim();
}

function formatReminderDateTime(date: Date) {
    return new Intl.DateTimeFormat('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

export function buildTimelineReminderSchedule(
    day: MobileTripDaySection,
    item: MobileTimelineDisplayItem,
    leadMinutes = TRIP_REMINDER_LEAD_MINUTES
): TripReminderSchedule | null {
    const dayParts = parseDayDateParts(day.date);
    const parsedStartTime = parseTimeStr(resolveTimelineItemStartTime(item));

    if (!dayParts || parsedStartTime === null) {
        return null;
    }

    const startHour = Math.floor(parsedStartTime / 60);
    const startMinute = parsedStartTime % 60;
    const startAt = new Date(
        dayParts.year,
        dayParts.month - 1,
        dayParts.day,
        startHour,
        startMinute,
        0,
        0
    );

    if (Number.isNaN(startAt.getTime())) {
        return null;
    }

    const reminderAt = new Date(startAt.getTime() - leadMinutes * 60 * 1000);

    return {
        startAt,
        reminderAt,
        startTimeLabel: formatTimeStr(parsedStartTime),
        reminderTimeLabel: formatReminderDateTime(reminderAt),
        leadMinutes
    };
}

export async function configureTripReminderNotifications() {
    if (notificationsConfigured) {
        return;
    }

    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false
        })
    });

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(TRIP_REMINDER_CHANNEL_ID, {
            name: '일정 알림',
            description: '일정 시작 전에 알려드리는 알림',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF6600'
        });
    }

    notificationsConfigured = true;
}

export async function ensureTripReminderPermissions() {
    await configureTripReminderNotifications();

    const currentStatus = await Notifications.getPermissionsAsync();
    if (currentStatus.granted || currentStatus.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
        return true;
    }

    const requestedStatus = await Notifications.requestPermissionsAsync();
    return requestedStatus.granted || requestedStatus.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function getTimelineReminderRecord(tripId: string, dayId: string, itemId: string) {
    const reminderMap = await readStoredTripReminderMap();
    return reminderMap[buildReminderStorageKey(tripId, dayId, itemId)] || null;
}

export async function getTripReminderRecordMap(tripId: string) {
    const reminderMap = await readStoredTripReminderMap();
    const nextMap: Record<string, TripReminderRecord> = {};

    for (const record of Object.values(reminderMap)) {
        if (record.tripId !== tripId) {
            continue;
        }

        nextMap[`${record.dayId}:${record.itemId}`] = record;
    }

    return nextMap;
}

export async function scheduleTimelineReminder(params: {
    tripId: string;
    tripTitle: string;
    day: MobileTripDaySection;
    item: MobileTimelineDisplayItem;
    leadMinutes?: number;
}) {
    const leadMinutes = params.leadMinutes ?? TRIP_REMINDER_LEAD_MINUTES;
    const schedule = buildTimelineReminderSchedule(params.day, params.item, leadMinutes);

    if (!schedule) {
        return {
            ok: false as const,
            reason: 'invalid-schedule' as const
        };
    }

    if (schedule.reminderAt.getTime() <= Date.now()) {
        return {
            ok: false as const,
            reason: 'past' as const,
            schedule
        };
    }

    const hasPermission = await ensureTripReminderPermissions();
    if (!hasPermission) {
        return {
            ok: false as const,
            reason: 'permission-denied' as const,
            schedule
        };
    }

    const storageKey = buildReminderStorageKey(params.tripId, params.day.id, params.item.id);
    const reminderMap = await readStoredTripReminderMap();
    const existingRecord = reminderMap[storageKey];

    if (existingRecord?.notificationId) {
        try {
            await Notifications.cancelScheduledNotificationAsync(existingRecord.notificationId);
        } catch {}
    }

    const itemTitle = String(params.item.title || params.item.badgeLabel || '일정').trim() || '일정';
    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title: `곧 ${itemTitle} 일정이에요`,
            body: `${params.tripTitle} · ${params.day.label} ${schedule.startTimeLabel} 일정이 ${leadMinutes}분 뒤 시작돼요.`,
            sound: true,
            data: {
                tripId: params.tripId,
                dayId: params.day.id,
                itemId: params.item.id,
                leadMinutes,
                kind: 'trip-timeline-reminder'
            }
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: schedule.reminderAt,
            channelId: Platform.OS === 'android' ? TRIP_REMINDER_CHANNEL_ID : undefined
        }
    });

    reminderMap[storageKey] = {
        notificationId,
        tripId: params.tripId,
        dayId: params.day.id,
        itemId: params.item.id,
        itemTitle,
        reminderAtIso: schedule.reminderAt.toISOString(),
        startAtIso: schedule.startAt.toISOString(),
        leadMinutes
    };
    await writeStoredTripReminderMap(reminderMap);

    return {
        ok: true as const,
        schedule,
        record: reminderMap[storageKey]
    };
}

export async function cancelTimelineReminder(tripId: string, dayId: string, itemId: string) {
    const storageKey = buildReminderStorageKey(tripId, dayId, itemId);
    const reminderMap = await readStoredTripReminderMap();
    const existingRecord = reminderMap[storageKey];

    if (!existingRecord) {
        return false;
    }

    if (existingRecord.notificationId) {
        try {
            await Notifications.cancelScheduledNotificationAsync(existingRecord.notificationId);
        } catch {}
    }

    delete reminderMap[storageKey];
    await writeStoredTripReminderMap(reminderMap);
    return true;
}

export async function cancelTimelineDayReminders(tripId: string, dayId: string) {
    const reminderMap = await readStoredTripReminderMap();
    const entries = Object.entries(reminderMap).filter(([, record]) => (
        record.tripId === tripId && record.dayId === dayId
    ));

    if (entries.length === 0) {
        return 0;
    }

    await Promise.all(entries.map(async ([key, record]) => {
        if (record.notificationId) {
            try {
                await Notifications.cancelScheduledNotificationAsync(record.notificationId);
            } catch {}
        }

        delete reminderMap[key];
    }));

    await writeStoredTripReminderMap(reminderMap);
    return entries.length;
}

export async function cancelTripReminders(tripId: string) {
    const reminderMap = await readStoredTripReminderMap();
    const entries = Object.entries(reminderMap).filter(([, record]) => record.tripId === tripId);

    if (entries.length === 0) {
        return 0;
    }

    await Promise.all(entries.map(async ([key, record]) => {
        if (record.notificationId) {
            try {
                await Notifications.cancelScheduledNotificationAsync(record.notificationId);
            } catch {}
        }

        delete reminderMap[key];
    }));

    await writeStoredTripReminderMap(reminderMap);
    return entries.length;
}

export async function syncTripRemindersForDetail(detail: MobileTripDetail) {
    const tripId = String(detail?.id || '').trim();
    if (!tripId) {
        return {
            rescheduledCount: 0,
            removedCount: 0
        };
    }

    const reminderMap = await readStoredTripReminderMap();
    const targetEntries = Object.entries(reminderMap).filter(([, record]) => record.tripId === tripId);

    if (targetEntries.length === 0) {
        return {
            rescheduledCount: 0,
            removedCount: 0
        };
    }

    let rescheduledCount = 0;
    let removedCount = 0;

    for (const [storageKey, record] of targetEntries) {
        const nextDay = detail.days.find((day) => day.id === record.dayId);
        const nextItem = nextDay?.items.find((item) => item.id === record.itemId) || null;

        if (!nextDay || !nextItem) {
            if (record.notificationId) {
                try {
                    await Notifications.cancelScheduledNotificationAsync(record.notificationId);
                } catch {}
            }
            delete reminderMap[storageKey];
            removedCount += 1;
            continue;
        }

        const nextSchedule = buildTimelineReminderSchedule(nextDay, nextItem, record.leadMinutes);
        if (!nextSchedule || nextSchedule.reminderAt.getTime() <= Date.now()) {
            if (record.notificationId) {
                try {
                    await Notifications.cancelScheduledNotificationAsync(record.notificationId);
                } catch {}
            }
            delete reminderMap[storageKey];
            removedCount += 1;
            continue;
        }

        const nextItemTitle = String(nextItem.title || nextItem.badgeLabel || '일정').trim() || '일정';

        if (record.notificationId) {
            try {
                await Notifications.cancelScheduledNotificationAsync(record.notificationId);
            } catch {}
        }

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: `곧 ${nextItemTitle} 일정이에요`,
                body: `${detail.title} · ${nextDay.label} ${nextSchedule.startTimeLabel} 일정이 ${record.leadMinutes}분 뒤 시작돼요.`,
                sound: true,
                data: {
                    tripId,
                    dayId: nextDay.id,
                    itemId: nextItem.id,
                    leadMinutes: record.leadMinutes,
                    kind: 'trip-timeline-reminder'
                }
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: nextSchedule.reminderAt,
                channelId: Platform.OS === 'android' ? TRIP_REMINDER_CHANNEL_ID : undefined
            }
        });

        reminderMap[storageKey] = {
            ...record,
            notificationId,
            dayId: nextDay.id,
            itemId: nextItem.id,
            itemTitle: nextItemTitle,
            reminderAtIso: nextSchedule.reminderAt.toISOString(),
            startAtIso: nextSchedule.startAt.toISOString()
        };
        rescheduledCount += 1;
    }

    await writeStoredTripReminderMap(reminderMap);

    return {
        rescheduledCount,
        removedCount
    };
}

export function describeTimelineReminder(record: TripReminderRecord | null | undefined) {
    if (!record?.reminderAtIso) {
        return '';
    }

    const parsedDate = new Date(record.reminderAtIso);
    if (Number.isNaN(parsedDate.getTime())) {
        return '';
    }

    return `${formatReminderDateTime(parsedDate)}에 ${record.leadMinutes}분 전 알림`;
}

import React from 'react';

import { useForegroundResumeRefresh } from '@/hooks/useForegroundResumeRefresh';
import { useTripDetail } from '@/hooks/useTripDetail';
import type { AuthSessionUser } from '@/types/auth';
import type {
    MobileTripDetail,
    MobileTripListItem,
    MobileTripListType
} from '@/types/trip';

type PendingTimelineDayOrders = Record<string, string[]>;
type OptimisticTripLists = Record<MobileTripListType, MobileTripListItem[] | null>;
type TripDetailFilterChip = {
    key: 'extras' | string;
    label: string;
};

type Options = {
    tripId: string;
    userId: string | null;
    isFocused: boolean;
    refreshSession: () => Promise<AuthSessionUser | null>;
    pendingTimelineDayOrders: PendingTimelineDayOrders;
    optimisticTripLists: OptimisticTripLists;
};

function formatBudgetAmount(amount: number) {
    return `₩${Math.round(amount).toLocaleString()}`;
}

function applyTimelineDayItemOrder<
    TItem extends {
        id: string;
    }
>(items: TItem[], orderedItemIds: string[]) {
    if (!Array.isArray(orderedItemIds) || orderedItemIds.length === 0 || items.length === 0) {
        return items;
    }

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const consumedIds = new Set<string>();
    const nextItems: TItem[] = [];

    orderedItemIds.forEach((itemId) => {
        const targetItem = itemMap.get(itemId);
        if (!targetItem || consumedIds.has(itemId)) {
            return;
        }

        consumedIds.add(itemId);
        nextItems.push(targetItem);
    });

    items.forEach((item) => {
        if (consumedIds.has(item.id)) {
            return;
        }

        nextItems.push(item);
    });

    if (nextItems.length !== items.length || !nextItems.some((item, index) => item.id !== items[index]?.id)) {
        return items;
    }

    return nextItems;
}

function applyPendingTimelineDayOrders(
    detail: MobileTripDetail | null,
    pendingTimelineDayOrders: PendingTimelineDayOrders
) {
    if (!detail || Object.keys(pendingTimelineDayOrders).length === 0) {
        return detail;
    }

    let didChange = false;
    const nextDays = detail.days.map((day) => {
        const pendingOrder = pendingTimelineDayOrders[day.id];
        if (!pendingOrder || pendingOrder.length === 0) {
            return day;
        }

        const nextItems = applyTimelineDayItemOrder(day.items, pendingOrder);
        if (nextItems === day.items) {
            return day;
        }

        didChange = true;
        return {
            ...day,
            items: nextItems
        };
    });

    return didChange
        ? {
            ...detail,
            days: nextDays
        }
        : detail;
}

export function useTripDetailScreenController({
    tripId,
    userId,
    isFocused,
    refreshSession,
    pendingTimelineDayOrders,
    optimisticTripLists
}: Options) {
    const {
        detail,
        isRemoteReady,
        isUsingCachedDetail,
        loading,
        refreshing: isRefreshingRemote,
        error,
        errorKind,
        refreshError,
        isNotFound,
        retry,
        refresh: refreshTripDetail
    } = useTripDetail(userId, tripId);

    const refresh = React.useCallback(async () => {
        if (!userId || loading || isRefreshingRemote) {
            return;
        }

        const nextUser = await refreshSession();
        if (!nextUser || nextUser.uid !== userId) {
            return;
        }

        await refreshTripDetail();
    }, [isRefreshingRemote, loading, refreshSession, refreshTripDetail, userId]);

    useForegroundResumeRefresh({
        enabled: isFocused && Boolean(userId),
        onRefresh: refresh
    });

    const canEditContentByPermission = detail?.permissions.canEditContent === true;
    const canEditContent = canEditContentByPermission && isRemoteReady;
    const canManageShare = detail?.permissions.canManageShare === true;
    const canSendAnnouncement = detail?.permissions.canSendAnnouncement === true;
    const canPublishCommunity = detail?.permissions.canPublishCommunity === true;
    const isTripContentSyncing = isRefreshingRemote || (Boolean(detail) && !isRemoteReady);

    const timelineDetail = React.useMemo(
        () => applyPendingTimelineDayOrders(detail, pendingTimelineDayOrders),
        [detail, pendingTimelineDayOrders]
    );

    const budgetAveragePerDayLabel = React.useMemo(() => {
        if (!detail?.budgetSummary || detail.budgetSummary.daysWithExpenseCount < 1) {
            return null;
        }

        return formatBudgetAmount(detail.budgetSummary.totalAmount / detail.budgetSummary.daysWithExpenseCount);
    }, [detail]);

    const budgetDetailDays = React.useMemo(() => {
        if (!timelineDetail) {
            return [];
        }

        return timelineDetail.days.map((day) => {
            const expenseItems = day.items.reduce<Array<{
                id: string;
                itemId: string;
                itemIndex: number;
                title: string;
                location: string;
                countryCode?: string;
                expenseIndex: number;
                description: string;
                amount: number;
                amountLabel: string;
            }>>((entries, item, itemIndex) => {
                item.expenseItems.forEach((expense) => {
                    entries.push({
                        id: `${day.id}-${expense.id}`,
                        itemId: item.id,
                        itemIndex,
                        title: item.title,
                        location: item.location,
                        countryCode: item.countryCode,
                        expenseIndex: expense.expenseIndex,
                        description: expense.description,
                        amount: expense.amount,
                        amountLabel: expense.amountLabel
                    });
                });

                return entries;
            }, []);

            const itemOptions = day.items
                .map((item, itemIndex) => ({
                    itemId: item.id,
                    itemIndex,
                    title: item.title,
                    location: item.location,
                    countryCode: item.countryCode
                }))
                .filter((item) => Boolean(item.title.trim()));

            const totalAmount = expenseItems.reduce((sum, expense) => sum + expense.amount, 0);

            return {
                id: day.id,
                label: day.label,
                date: day.date,
                totalAmount,
                totalLabel: formatBudgetAmount(totalAmount),
                expenseItems,
                itemOptions
            };
        });
    }, [timelineDetail]);

    const tripListLocationOptions = React.useMemo(() => {
        if (!timelineDetail) {
            return [];
        }

        const seen = new Set<string>();
        const entries: Array<{ key: string; title: string; location: string }> = [];

        timelineDetail.days.forEach((day) => {
            day.items.forEach((item) => {
                if (item.isTransit || item.badgeLabel === '메모') {
                    return;
                }

                const title = String(item.title || '').trim();
                if (!title) {
                    return;
                }

                const location = String(item.location || '').trim();
                const key = `${title}::${location}`;
                if (seen.has(key)) {
                    return;
                }

                seen.add(key);
                entries.push({ key, title, location });
            });
        });

        return entries;
    }, [timelineDetail]);

    const openShoppingItems = React.useMemo(() => {
        return (optimisticTripLists.shopping ?? detail?.shoppingList ?? [])
            .map((item, index) => ({ ...item, index }))
            .filter((item) => !item.checked);
    }, [detail?.shoppingList, optimisticTripLists.shopping]);

    const displayedChecklist = React.useMemo(
        () => optimisticTripLists.checklist ?? detail?.checklist ?? [],
        [detail?.checklist, optimisticTripLists.checklist]
    );

    const displayedShoppingList = React.useMemo(
        () => optimisticTripLists.shopping ?? detail?.shoppingList ?? [],
        [detail?.shoppingList, optimisticTripLists.shopping]
    );

    const detailFilterChips = React.useMemo<TripDetailFilterChip[]>(() => {
        const dayChips = (timelineDetail?.days || []).map((day, index) => ({
            key: day.id,
            label: `${index + 1}일차`
        }));

        return [
            ...dayChips,
            { key: 'extras', label: '기타' }
        ];
    }, [timelineDetail?.days]);

    return {
        detail,
        isRemoteReady,
        isUsingCachedDetail,
        loading,
        isRefreshingRemote,
        error,
        errorKind,
        refreshError,
        isNotFound,
        retry,
        refresh,
        canEditContentByPermission,
        canEditContent,
        canManageShare,
        canSendAnnouncement,
        canPublishCommunity,
        isTripContentSyncing,
        timelineDetail,
        budgetAveragePerDayLabel,
        budgetDetailDays,
        tripListLocationOptions,
        openShoppingItems,
        displayedChecklist,
        displayedShoppingList,
        detailFilterChips
    };
}

import type {
    MobileTripExpenseCreateInput,
    MobileTripListItemCreateInput,
    MobileTripListType,
    MobileQuickRouteOption,
    MobileTripCreateInput,
    MobileTimelineItemCreateInput,
    MobileTimelineItemEditInput,
    MobileTimelineMemoryCreateInput,
    MobileTimelineMemoCreateInput,
    MobileTimelineTransitCreateInput,
    TripRevisionListResponse,
    MobileTripDetail,
    MobileTripInfoInput,
    MobileTripSummary
} from '@/types/trip';

export type OffsetPageRequest = {
    cursor?: number | null;
    limit?: number | null;
};

export type TripListPage = {
    items: MobileTripSummary[];
    nextCursor: number | null;
    hasMore: boolean;
};

export interface TripRepository {
    getCachedTripList(userId: string): Promise<MobileTripSummary[]>;
    getCachedTripDetail(userId: string, tripId: string): Promise<MobileTripDetail | null>;
    listTripsPage(userId: string, options?: OffsetPageRequest): Promise<TripListPage>;
    listTrips(userId: string): Promise<MobileTripSummary[]>;
    getTripDetail(userId: string, tripId: string): Promise<MobileTripDetail | null>;
    listTripRevisions(
        userId: string,
        tripId: string,
        options?: {
            cursor?: string | null;
            limit?: number | null;
        }
    ): Promise<TripRevisionListResponse>;
    restoreTripRevision(userId: string, tripId: string, revisionId: string): Promise<MobileTripDetail | null>;
    createTrip(userId: string, input: MobileTripCreateInput): Promise<MobileTripDetail | null>;
    duplicateTrip(userId: string, tripId: string): Promise<MobileTripDetail | null>;
    deleteTrip(userId: string, tripId: string, options?: { transferOwnerUid?: string | null }): Promise<void>;
    updateTripInfo(userId: string, tripId: string, input: MobileTripInfoInput): Promise<MobileTripDetail | null>;
    appendExpenseToTimelineItem(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number,
        input: MobileTripExpenseCreateInput
    ): Promise<MobileTripDetail | null>;
    addTripListItem(
        userId: string,
        tripId: string,
        listType: MobileTripListType,
        input: MobileTripListItemCreateInput
    ): Promise<MobileTripDetail | null>;
    toggleTripListItem(
        userId: string,
        tripId: string,
        listType: MobileTripListType,
        itemIndex: number
    ): Promise<MobileTripDetail | null>;
    insertTimelineItem(
        userId: string,
        tripId: string,
        dayId: string,
        insertAfterItemId: string | null,
        insertAfterItemIndex: number,
        input: MobileTimelineItemCreateInput
    ): Promise<MobileTripDetail | null>;
    insertTimelineMemoItem(
        userId: string,
        tripId: string,
        dayId: string,
        insertAfterItemId: string | null,
        insertAfterItemIndex: number,
        input: MobileTimelineMemoCreateInput
    ): Promise<MobileTripDetail | null>;
    appendTimelineItemMemories(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number,
        input: MobileTimelineMemoryCreateInput
    ): Promise<MobileTripDetail | null>;
    insertManualTransitItem(
        userId: string,
        tripId: string,
        dayId: string,
        insertAfterItemId: string | null,
        insertAfterItemIndex: number,
        input: MobileTimelineTransitCreateInput
    ): Promise<MobileTripDetail | null>;
    insertQuickRouteItem(
        userId: string,
        tripId: string,
        dayId: string,
        insertAfterItemId: string | null,
        insertAfterItemIndex: number,
        routeOption: MobileQuickRouteOption
    ): Promise<MobileTripDetail | null>;
    copyTimelineItem(
        userId: string,
        tripId: string,
        targetDayId: string,
        insertAfterItemId: string | null,
        insertAfterItemIndex: number,
        sourceDayId: string,
        sourceItemId: string,
        sourceItemIndex: number
    ): Promise<MobileTripDetail | null>;
    updateTimelineItem(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number,
        input: MobileTimelineItemEditInput
    ): Promise<MobileTripDetail | null>;
    moveTimelineItem(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number,
        direction: 'up' | 'down'
    ): Promise<MobileTripDetail | null>;
    moveTimelineItemToIndex(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number,
        targetIndex: number
    ): Promise<MobileTripDetail | null>;
    reorderTimelineDays(
        userId: string,
        tripId: string,
        dayOrders: Array<{
            dayId: string;
            orderedItemIds: string[];
        }>
    ): Promise<MobileTripDetail | null>;
    reorganizeTimelineDay(
        userId: string,
        tripId: string,
        dayId: string,
        mode: 'time' | 'recalc'
    ): Promise<MobileTripDetail | null>;
    deleteTimelineItem(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number
    ): Promise<MobileTripDetail | null>;
}

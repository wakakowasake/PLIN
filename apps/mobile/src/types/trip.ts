export type TripStatus = 'planning' | 'completed';
export type PlanPurpose = 'trip' | 'date';

export type MemoryEntry = {
    photoUrl?: string | null;
    previewUrl?: string | null;
    thumbnailUrl?: string | null;
    comment?: string;
    createdAt?: string;
    [key: string]: unknown;
};

export type ExpenseEntry = {
    description?: string;
    amount?: number | null;
    currency?: string | null;
    [key: string]: unknown;
};

export type RawTripListItem = {
    text?: string;
    checked?: boolean;
    location?: string;
    locationDetail?: string;
    [key: string]: unknown;
};

export type RawAttachmentEntry = {
    name?: string;
    type?: string | null;
    url?: string | null;
    previewUrl?: string | null;
    [key: string]: unknown;
};

export type MobileMemoryDisplayEntry = {
    id: string;
    photoUrl?: string | null;
    previewUrl?: string | null;
    comment: string;
    createdAt: string;
};

export type MobileExpenseDisplayEntry = {
    id: string;
    expenseIndex: number;
    title: string;
    description: string;
    amount: number;
    currency?: string | null;
    amountLabel: string;
};

export type MobileAttachmentDisplayEntry = {
    id: string;
    name: string;
    url: string;
    previewUrl?: string | null;
    mimeType: string;
    kind: 'image' | 'pdf' | 'file';
    typeLabel: string;
};

export type TransitInfo = {
    start?: string;
    end?: string;
    depTime?: string;
    arrTime?: string;
    [key: string]: unknown;
};

export type FlightInfo = {
    departure?: string;
    arrival?: string;
    departureLabel?: string;
    arrivalLabel?: string;
    departureTime?: string;
    arrivalTime?: string;
    duration?: string;
    flightNumber?: string;
    bookingRef?: string;
    terminal?: string;
    gate?: string;
    departureAirportCode?: string;
    arrivalAirportCode?: string;
    departureTimeZone?: string;
    arrivalTimeZone?: string;
    arrivalDayOffset?: number;
    [key: string]: unknown;
};

export type RawTimelineItem = {
    time?: string;
    duration?: string | number;
    title?: string;
    location?: string;
    icon?: string;
    tag?: string;
    image?: string | null;
    note?: string;
    isTransit?: boolean;
    transitType?: string;
    transitInfo?: TransitInfo | null;
    flightInfo?: FlightInfo | null;
    memories?: MemoryEntry[];
    attachments?: RawAttachmentEntry[];
    expenses?: ExpenseEntry[];
    budget?: number | null;
    [key: string]: unknown;
};

export type RawTripDay = {
    id?: string;
    date?: string;
    items?: RawTimelineItem[];
    timeline?: RawTimelineItem[];
    [key: string]: unknown;
};

export type RawTripMeta = {
    title?: string;
    subInfo?: string;
    dayCount?: string;
    location?: string;
    purpose?: PlanPurpose;
    coverImage?: string | null;
    mapImage?: string | null;
    budget?: number | null;
    [key: string]: unknown;
};

export type RawTrip = {
    id: string;
    meta: RawTripMeta;
    days: RawTripDay[];
    shoppingList?: RawTripListItem[];
    checklist?: RawTripListItem[];
    contentVersion?: number;
};

export type CanonicalTripMemberRole = 'owner' | 'editor' | 'member' | 'viewer';

export type CanonicalTripMembership = {
    ownerUid: string;
    membersByUid: Record<string, CanonicalTripMemberRole>;
};

export type CanonicalTripShareMode = 'private' | 'link';
export type CanonicalTripShareLinkRole = 'editor' | 'member' | 'viewer';

export type CanonicalTripShare = {
    mode: CanonicalTripShareMode;
    role: CanonicalTripShareLinkRole;
    tokenId: string;
};

export type CanonicalTripItemType = 'place' | 'transit' | 'memo' | 'generic';

export type CanonicalTransitDetails = {
    type: string;
    start: string;
    end: string;
    depTime: string;
    arrTime: string;
    windowLabel: string;
    durationLabel: string;
    flight: FlightInfo | null;
};

export type CanonicalTripItem = {
    id: string;
    type: CanonicalTripItemType;
    timeLabel: string;
    duration?: string | number;
    title: string;
    location: string;
    icon: string;
    tag: string;
    image?: string | null;
    note: string;
    isTransit: boolean;
    transitType: string;
    transitInfo?: TransitInfo | null;
    flightInfo?: FlightInfo | null;
    transit: CanonicalTransitDetails | null;
    memories: MemoryEntry[];
    attachments: RawAttachmentEntry[];
    expenses: ExpenseEntry[];
    budget: number | null;
};

export type CanonicalTripDay = {
    id: string;
    date: string;
    items: CanonicalTripItem[];
};

export type CanonicalTripMeta = {
    title: string;
    subInfo: string;
    dayCount: string;
    location: string;
    purpose: PlanPurpose;
    startDate: string;
    endDate: string;
    budget: number | null;
    coverImage?: string | null;
    mapImage?: string | null;
    status: TripStatus;
};

export type CanonicalTripDocument = {
    id: string;
    meta: CanonicalTripMeta;
    membership: CanonicalTripMembership;
    share: CanonicalTripShare;
    days: CanonicalTripDay[];
    legacyFallbacks: string[];
};

export type MobileTripPermissions = {
    role: CanonicalTripMemberRole | '';
    canEditContent: boolean;
    canManageShare: boolean;
    canSendAnnouncement: boolean;
    canDeleteTrip: boolean;
    canPublishCommunity: boolean;
    canDuplicateTrip: boolean;
};

export type MobileTripCollaboratorSummary = {
    uid: string;
    displayName: string;
    photoURL?: string | null;
    role: CanonicalTripMemberRole;
    isSelf: boolean;
};

export type MobileTripSummary = {
    id: string;
    title: string;
    subInfo: string;
    dayCount: string;
    purpose: PlanPurpose;
    startDate: string;
    endDate: string;
    createdAt?: string;
    updatedAt?: string;
    contentVersion: number;
    coverImage?: string | null;
    status: TripStatus;
    deletedAt?: string | null;
    deletedBy?: string | null;
    deletionReason?: string | null;
    purgeAfter?: string | null;
    permissions: MobileTripPermissions;
    collaborators?: MobileTripCollaboratorSummary[];
};

export type TripRevisionOperation = 'content_update' | 'meta_update' | 'restore';
export type TripRevisionSourceClient = 'mobile' | 'web' | 'server' | 'unknown';

export type TripRevisionActor = {
    uid: string;
    displayName: string;
    email: string;
    photoURL?: string | null;
};

export type TripRevisionSummary = {
    text: string;
};

export type TripRevisionSnapshot = {
    meta: Record<string, unknown>;
    days: RawTripDay[];
    shoppingList: RawTripListItem[];
    checklist: RawTripListItem[];
    contentVersion: number;
};

export type TripRevisionEntry = {
    id: string;
    createdAt: string;
    actor: TripRevisionActor;
    operation: TripRevisionOperation;
    sourceClient: TripRevisionSourceClient;
    contentVersionBefore: number;
    contentVersionAfter: number;
    summary: TripRevisionSummary;
    snapshot: TripRevisionSnapshot;
    restoredFromRevisionId?: string;
};

export type TripRevisionListResponse = {
    items: TripRevisionEntry[];
    nextCursor: string | null;
    hasMore: boolean;
};

export type TripRestoreResponse = {
    trip?: Record<string, unknown> | null;
};

export type MobileTripInfoInput = {
    title: string;
    location: string;
    purpose?: PlanPurpose;
    startDate: string;
    endDate: string;
    coverImage?: string | null;
};

export type MobileTripListType = 'shopping' | 'checklist';

export type MobileTripListItem = {
    id: string;
    text: string;
    checked: boolean;
    location?: string;
    locationDetail?: string;
};

export type MobileTripListItemCreateInput = {
    text: string;
    location?: string;
    locationDetail?: string;
};

export type MobileTripExpenseCreateInput = {
    description: string;
    amount: number;
    currency?: string | null;
    allowEmptyDescription?: boolean;
    linkedShoppingItemIndex?: number | null;
};

export type MobileTripCreatePlace = {
    placeId: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    countryCode?: string;
    mapImageUrl?: string | null;
    photoReference?: string | null;
    placeTypes?: string[];
};

export type MobileTripCreateInput = MobileTripInfoInput & {
    place?: MobileTripCreatePlace | null;
};

export type MobileTimelineItemEditInput = {
    title?: string;
    note: string;
    time?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    durationMinutes?: number;
    category?: MobileTimelineItemCategory;
    place?: MobileTripCreatePlace | null;
    clearPlace?: boolean;
    memories?: MemoryEntry[];
    expenses?: ExpenseEntry[];
    attachments?: RawAttachmentEntry[];
    transitType?: string;
    departure?: string;
    arrival?: string;
    departureAirportCode?: string;
    arrivalAirportCode?: string;
    departureTimeZone?: string;
    arrivalTimeZone?: string;
    arrivalDayOffset?: number;
    flightNumber?: string;
    bookingRef?: string;
    terminal?: string;
    gate?: string;
};

export type MobileTimelineItemCategory =
    | 'meal'
    | 'culture'
    | 'sightseeing'
    | 'shopping'
    | 'accommodation'
    | 'custom';

export type MobileTimelineManualTransitType =
    | 'airplane'
    | 'train'
    | 'subway'
    | 'bus'
    | 'taxi'
    | 'bike'
    | 'boat'
    | 'walk'
    | 'car';

export type MobileTimelineItemCreateInput = {
    title: string;
    location: string;
    time: string;
    durationMinutes: number;
    note: string;
    category: MobileTimelineItemCategory;
    place?: MobileTripCreatePlace | null;
};

export type MobileTimelineMemoCreateInput = {
    time: string;
    content: string;
};

export type MobileTimelineTransitCreateInput = {
    transitType: MobileTimelineManualTransitType;
    title?: string;
    startTime: string;
    endTime: string;
    durationMinutes?: number;
    note: string;
    departure?: string;
    arrival?: string;
    departureAirportCode?: string;
    arrivalAirportCode?: string;
    departureTimeZone?: string;
    arrivalTimeZone?: string;
    arrivalDayOffset?: number;
    flightNumber?: string;
    bookingRef?: string;
    terminal?: string;
    gate?: string;
};

export type MobileTimelineMemoryCreateInput = {
    uploadedPhotoUrls: string[];
    uploadedMemoryEntries?: MemoryEntry[];
    createdAt?: string;
};

export type MobileQuickRouteChip = {
    icon: string;
    label: string;
    color?: string | null;
};

export type MobileTransitRouteChip = {
    label: string;
    color?: string | null;
    textColor?: string | null;
    icon?: string;
    type?: string;
};

export type MobileTransitDetailedStep = {
    title: string;
    time: string;
    note: string;
    icon?: string;
    tag?: string;
    type?: string;
    color?: string | null;
    textColor?: string | null;
    transitInfo?: {
        depStop?: string;
        arrStop?: string;
        start?: string;
        end?: string;
        headsign?: string;
        lineName?: string;
        lineSymbol?: string;
        lineCode?: string;
        numStops?: number;
    };
};

export type MobileQuickRouteOption = {
    id: string;
    durationText: string;
    distanceText: string;
    durationMinutes: number;
    summaryTitle: string;
    summaryIcon: string;
    summaryTag: string;
    transitType: string;
    chips: MobileQuickRouteChip[];
    detailedSteps: Array<Record<string, unknown>>;
};

export type MobileTimelineDisplayItem = {
    id: string;
    timeLabel: string;
    title: string;
    location: string;
    badgeLabel: string;
    transitType?: string;
    durationLabel: string;
    transitWindowLabel: string;
    note: string;
    isTransit: boolean;
    memoriesCount: number;
    photoPreviewUrls: string[];
    memoryEntries: MobileMemoryDisplayEntry[];
    attachments: MobileAttachmentDisplayEntry[];
    expenseSummaryLabel: string;
    expenseTotalAmount: number;
    expenseItems: MobileExpenseDisplayEntry[];
    latitude?: number | null;
    longitude?: number | null;
    placeId?: string;
    countryCode?: string;
    flightInfo?: FlightInfo | null;
    transitRouteChips: MobileTransitRouteChip[];
    transitDetailedSteps: MobileTransitDetailedStep[];
};

export type MobileTimelineFocusTarget = {
    dayId: string;
    itemId: string;
    itemIndex?: number;
    requestId?: number;
};

export type MobileTripDaySection = {
    id: string;
    label: string;
    date: string;
    expenseTotalLabel?: string;
    expenseItemCount?: number;
    items: MobileTimelineDisplayItem[];
};

export type MobileBudgetSummary = {
    totalAmount: number;
    totalLabel: string;
    caption: string;
    entryCount: number;
    daysWithExpenseCount: number;
};

export type MobileTripDetail = {
    id: string;
    title: string;
    subInfo: string;
    locationLabel: string;
    dayCount: string;
    purpose: PlanPurpose;
    createdAt?: string;
    updatedAt?: string;
    contentVersion: number;
    coverImage?: string | null;
    status: TripStatus;
    photoPreviewUrls: string[];
    photoGalleryUrls: string[];
    photoCount: number;
    budgetSummary: MobileBudgetSummary | null;
    days: MobileTripDaySection[];
    shoppingList: MobileTripListItem[];
    checklist: MobileTripListItem[];
    editInfo: MobileTripInfoInput;
    permissions: MobileTripPermissions;
};

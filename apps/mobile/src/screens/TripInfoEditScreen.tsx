import React from 'react';
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { CommonActions, usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAdapters } from '@/adapters/useAdapters';
import {
    DateCalendarModal,
    formatCalendarDisplayDate,
    parseIsoDateInput
} from '@/components/DateCalendarModal';
import { Alert } from '@/feedback';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { pickTripCoverAsset, uploadTripCoverAsset } from '@/services/trip-cover-upload';
import { syncTripRemindersForDetail } from '@/services/trip-reminders';
import { publishTripInfoUpdated } from '@/state/trip-write-sync';
import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileTripInfoInput } from '@/types/trip';
import {
    canUseMobileWebSessionStorage,
    readMobileWebSessionJson,
    removeMobileWebSessionValue,
    writeMobileWebSessionJson
} from '@/utils/mobile-web-session';
import { buildTripInfoSavePlan } from '@shared/features/trip-info/trip-info-helpers.js';
import {
    countTripTitleLength,
    getTripTitleTooLongMessage,
    TRIP_TITLE_MAX_LENGTH,
    truncateTripTitle
} from '@shared/features/trips/trip-title.js';

type Props = NativeStackScreenProps<RootStackParamList, 'TripInfoEdit'>;
type TripInfoField = 'title' | 'location' | 'startDate' | 'endDate';
type ValidationState = {
    fieldErrors: Partial<Record<TripInfoField, string>>;
    formError: string | null;
};
type TouchedFields = Record<TripInfoField, boolean>;
type TripInfoEditDraftSnapshot = {
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    coverImage: string | null;
};

const TRIP_WRITE_CONFLICT_MESSAGE = '다른 기기에서 먼저 수정했어요. 최신 내용을 다시 불러온 뒤 변경사항을 다시 적용해 주세요.';

function buildTripInfoEditDraftStorageKey(tripId: string) {
    return `plin.mobileWeb.tripInfoEditDraft:${tripId}`;
}

function isIsoDateInput(value: string) {
    return Boolean(parseIsoDateInput(value));
}

function normalizeInput(input: MobileTripInfoInput): MobileTripInfoInput {
    return {
        title: input.title.trim(),
        location: input.location.trim(),
        startDate: input.startDate.trim(),
        endDate: input.endDate.trim(),
        coverImage: typeof input.coverImage === 'string' && input.coverImage.trim()
            ? input.coverImage.trim()
            : null
    };
}

function createTouchedFields(value = false): TouchedFields {
    return {
        title: value,
        location: value,
        startDate: value,
        endDate: value
    };
}

function getValidationState(input: MobileTripInfoInput): ValidationState {
    const fieldErrors: Partial<Record<TripInfoField, string>> = {};

    if (!input.title) {
        fieldErrors.title = '여행 제목을 입력해 주세요.';
    }

    if (!input.startDate) {
        fieldErrors.startDate = '시작일을 입력해 주세요.';
    } else if (!isIsoDateInput(input.startDate)) {
        fieldErrors.startDate = '시작일은 YYYY-MM-DD 형식으로 입력해 주세요.';
    }

    if (!input.endDate) {
        fieldErrors.endDate = '종료일을 입력해 주세요.';
    } else if (!isIsoDateInput(input.endDate)) {
        fieldErrors.endDate = '종료일은 YYYY-MM-DD 형식으로 입력해 주세요.';
    }

    if (fieldErrors.startDate || fieldErrors.endDate) {
        return {
            fieldErrors,
            formError: null
        };
    }

    const savePlan = buildTripInfoSavePlan({
        title: input.title,
        location: input.location,
        startStr: input.startDate,
        endStr: input.endDate,
        currentDayIndex: 0
    });

    if (savePlan.status === 'title_too_long') {
        fieldErrors.title = getTripTitleTooLongMessage();
    }

    return {
        fieldErrors,
        formError:
            savePlan.status === 'invalid_range'
                ? '종료일은 시작일보다 같거나 뒤여야 해요.'
                : null
    };
}

function isNetworkLikeMessage(message: string | null) {
    if (!message) {
        return false;
    }

    return message.includes('네트워크') || message.includes('연결');
}

function isSessionLikeMessage(message: string | null) {
    if (!message) {
        return false;
    }

    return message.includes('세션')
        || message.includes('로그인 상태')
        || message.includes('권한');
}

function isConfigLikeMessage(message: string | null) {
    if (!message) {
        return false;
    }

    return message.includes('환경 변수')
        || message.includes('OAuth')
        || message.includes('client ID')
        || message.includes('redirect')
        || message.includes('설정');
}

export function TripInfoEditScreen({ navigation, route }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { tripRepository } = useAdapters();
    const { user, refreshSession, isAuthActionLoading } = useAuthSession();
    const {
        scrollRef,
        createFocusHandler,
        keyboardAwareContentInsetStyle,
        scrollViewProps
    } = useKeyboardAwareInputScroll(120);
    const pendingNavigationActionRef = React.useRef<unknown>(null);
    const [title, setTitle] = React.useState(route.params.initialInput.title);
    const [location, setLocation] = React.useState(route.params.initialInput.location);
    const [startDate, setStartDate] = React.useState(route.params.initialInput.startDate);
    const [endDate, setEndDate] = React.useState(route.params.initialInput.endDate);
    const [coverImage, setCoverImage] = React.useState<string | null>(
        typeof route.params.initialInput.coverImage === 'string' && route.params.initialInput.coverImage.trim()
            ? route.params.initialInput.coverImage.trim()
            : null
    );
    const [saveError, setSaveError] = React.useState<string | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isCoverImageModalVisible, setIsCoverImageModalVisible] = React.useState(false);
    const [isUploadingCoverImage, setIsUploadingCoverImage] = React.useState(false);
    const [didAttemptSave, setDidAttemptSave] = React.useState(false);
    const [allowNextRemove, setAllowNextRemove] = React.useState(false);
    const [isDatePickerVisible, setIsDatePickerVisible] = React.useState(false);
    const [touchedFields, setTouchedFields] = React.useState<TouchedFields>(() => (
        createTouchedFields()
    ));
    const hasRestoredDraftRef = React.useRef(false);
    const draftStorageKey = React.useMemo(
        () => buildTripInfoEditDraftStorageKey(route.params.tripId),
        [route.params.tripId]
    );

    const initialInput = React.useMemo(
        () => normalizeInput(route.params.initialInput),
        [route.params.initialInput]
    );

    const draft = React.useMemo<MobileTripInfoInput>(() => ({
        title,
        location,
        startDate,
        endDate,
        coverImage
    }), [coverImage, endDate, location, startDate, title]);

    const normalizedDraft = React.useMemo(() => normalizeInput(draft), [draft]);
    const validationState = React.useMemo(
        () => getValidationState(normalizedDraft),
        [normalizedDraft]
    );
    const titleLength = React.useMemo(() => countTripTitleLength(title), [title]);

    const hasChanges = React.useMemo(() => (
        normalizedDraft.title !== initialInput.title
        || normalizedDraft.location !== initialInput.location
        || normalizedDraft.startDate !== initialInput.startDate
        || normalizedDraft.endDate !== initialInput.endDate
        || normalizedDraft.coverImage !== initialInput.coverImage
    ), [initialInput, normalizedDraft]);
    const clearPersistedDraft = React.useCallback(() => {
        removeMobileWebSessionValue(draftStorageKey);
    }, [draftStorageKey]);

    React.useEffect(() => {
        if (!canUseMobileWebSessionStorage() || hasRestoredDraftRef.current) {
            return;
        }

        hasRestoredDraftRef.current = true;
        const storedDraft = readMobileWebSessionJson<TripInfoEditDraftSnapshot>(draftStorageKey);
        if (!storedDraft) {
            return;
        }

        if (typeof storedDraft.title === 'string') {
            setTitle(storedDraft.title);
        }

        if (typeof storedDraft.location === 'string') {
            setLocation(storedDraft.location);
        }

        if (typeof storedDraft.startDate === 'string' && storedDraft.startDate.trim()) {
            setStartDate(storedDraft.startDate.trim());
        }

        if (typeof storedDraft.endDate === 'string' && storedDraft.endDate.trim()) {
            setEndDate(storedDraft.endDate.trim());
        }

        if (typeof storedDraft.coverImage === 'string') {
            setCoverImage(storedDraft.coverImage.trim() || null);
        } else if (storedDraft.coverImage === null) {
            setCoverImage(null);
        }
    }, [draftStorageKey]);

    React.useEffect(() => {
        if (!canUseMobileWebSessionStorage() || !hasRestoredDraftRef.current) {
            return;
        }

        if (!hasChanges) {
            clearPersistedDraft();
            return;
        }

        writeMobileWebSessionJson(draftStorageKey, {
            title,
            location,
            startDate,
            endDate,
            coverImage
        } satisfies TripInfoEditDraftSnapshot);
    }, [
        clearPersistedDraft,
        coverImage,
        draftStorageKey,
        endDate,
        hasChanges,
        location,
        startDate,
        title
    ]);

    const showFieldError = React.useCallback(
        (field: TripInfoField) => didAttemptSave || touchedFields[field],
        [didAttemptSave, touchedFields]
    );

    const visibleTitleError = showFieldError('title')
        ? validationState.fieldErrors.title ?? null
        : null;
    const visibleStartDateError = showFieldError('startDate')
        ? validationState.fieldErrors.startDate ?? null
        : null;
    const visibleEndDateError = showFieldError('endDate')
        ? validationState.fieldErrors.endDate ?? null
        : null;
    const visibleFormError = didAttemptSave
        || touchedFields.startDate
        || touchedFields.endDate
        ? validationState.formError
        : null;
    const hasValidationError = Boolean(
        validationState.formError
        || validationState.fieldErrors.title
        || validationState.fieldErrors.startDate
        || validationState.fieldErrors.endDate
    );
    const saveDisabled = isSaving || !hasChanges || hasValidationError;
    const defaultPreviewImage = typeof route.params.initialPreviewImage === 'string' && route.params.initialPreviewImage.trim()
        ? route.params.initialPreviewImage.trim()
        : null;
    const currentPreviewImage = coverImage || defaultPreviewImage;
    const photoGalleryUrls = React.useMemo(
        () => Array.isArray(route.params.photoGalleryUrls)
            ? route.params.photoGalleryUrls.filter((url): url is string => typeof url === 'string' && Boolean(url.trim()))
            : [],
        [route.params.photoGalleryUrls]
    );

    const setFieldTouched = React.useCallback((field: TripInfoField) => {
        setTouchedFields((current) => (
            current[field]
                ? current
                : {
                    ...current,
                    [field]: true
                }
        ));
    }, []);

    const handleDiscard = React.useCallback((onConfirm: () => void) => {
        if (isSaving) {
            return;
        }

        if (!hasChanges) {
            clearPersistedDraft();
            onConfirm();
            return;
        }

        Alert.alert(
            '변경을 취소할까요?',
            '저장하지 않은 변경사항이 있어요.',
            [
                {
                    text: '계속 편집',
                    style: 'cancel'
                },
                {
                    text: '버리기',
                    style: 'destructive',
                    onPress: () => {
                        clearPersistedDraft();
                        onConfirm();
                    }
                }
            ]
        );
    }, [clearPersistedDraft, hasChanges, isSaving]);

    usePreventRemove(hasChanges && !isSaving && !allowNextRemove, ({ data }) => {
        handleDiscard(() => {
            pendingNavigationActionRef.current = data.action;
            setAllowNextRemove(true);
        });
    });

    React.useEffect(() => {
        if (!allowNextRemove || !pendingNavigationActionRef.current) {
            return;
        }

        const action = pendingNavigationActionRef.current as never;
        pendingNavigationActionRef.current = null;
        navigation.dispatch(action);
        setAllowNextRemove(false);
    }, [allowNextRemove, navigation]);

    const handleSave = React.useCallback(async () => {
        if (isSaving) {
            return;
        }

        if (!user) {
            setSaveError('로그인 상태를 다시 확인한 뒤 저장해 주세요.');
            return;
        }

        if (!hasChanges) {
            return;
        }

        setDidAttemptSave(true);
        setTouchedFields(createTouchedFields(true));

        const nextValidationState = getValidationState(normalizedDraft);
        if (
            nextValidationState.formError
            || nextValidationState.fieldErrors.title
            || nextValidationState.fieldErrors.startDate
            || nextValidationState.fieldErrors.endDate
        ) {
            setSaveError(
                nextValidationState.formError ?? '입력한 여행 정보를 다시 확인해 주세요.'
            );
            return;
        }

        setIsSaving(true);
        setSaveError(null);

        try {
            const updatedTrip = await tripRepository.updateTripInfo(
                user.uid,
                route.params.tripId,
                normalizedDraft
            );

            if (!updatedTrip) {
                setSaveError('이 여행 정보를 찾을 수 없어요. 목록에서 다시 확인해 주세요.');
                return;
            }

            publishTripInfoUpdated(updatedTrip);
            try {
                await syncTripRemindersForDetail(updatedTrip);
            } catch (syncError) {
                console.warn('Failed to sync trip reminders after trip info update', syncError);
            }
            clearPersistedDraft();
            pendingNavigationActionRef.current = CommonActions.goBack();
            setAllowNextRemove(true);
        } catch (error) {
            console.error('Failed to save trip info', error);
            const message = error instanceof Error && error.message
                ? error.message
                : '여행 정보를 저장하지 못했어요.';

            if (message === TRIP_WRITE_CONFLICT_MESSAGE && user?.uid) {
                try {
                    const latestTrip = await tripRepository.getTripDetail(user.uid, route.params.tripId);

                    if (latestTrip) {
                        publishTripInfoUpdated(latestTrip);
                    }
                } catch (refreshError) {
                    console.warn('Failed to refresh latest trip info after conflict', refreshError);
                }
            }

            setSaveError(message);
        } finally {
            setIsSaving(false);
        }
    }, [
        hasChanges,
        isSaving,
        navigation,
        normalizedDraft,
        route.params.tripId,
        tripRepository,
        user,
        clearPersistedDraft
    ]);

    const statusMessage = saveError
        || visibleFormError
        || (isSaving
            ? '변경사항을 저장하고 있어요.'
            : !hasChanges
                ? '아직 바뀐 내용이 없어요.'
                : '변경한 내용을 확인한 뒤 저장할 수 있어요.');
    const statusIsWarning = Boolean(saveError || visibleFormError);
    const saveErrorLooksNetworkLike = isNetworkLikeMessage(saveError);
    const saveErrorLooksSessionLike = isSessionLikeMessage(saveError);
    const saveErrorLooksConfigLike = isConfigLikeMessage(saveError);
    const saveSupportText = saveErrorLooksConfigLike
        ? '실기기에서 같은 메시지가 반복되면 Firebase/Google 로그인 설정과 앱 scheme(plinmobile)을 함께 확인해 주세요.'
        : saveErrorLooksSessionLike
            ? '세션을 다시 확인한 뒤 같은 내용으로 바로 다시 저장할 수 있어요.'
            : saveErrorLooksNetworkLike
                ? '연결이 돌아오면 현재 입력값은 그대로 유지된 상태에서 다시 저장할 수 있어요.'
                : null;
    const showSessionRecoveryAction = Boolean(
        saveError && saveErrorLooksSessionLike && !isSaving && !isAuthActionLoading
    );

    const handleSessionRecovery = React.useCallback(async () => {
        const nextUser = await refreshSession();

        if (nextUser) {
            setSaveError(null);
            return;
        }

        setSaveError('로그인 상태가 만료되어 저장할 수 없어요. 다시 로그인한 뒤 시도해 주세요.');
    }, [refreshSession]);

    const handleOpenDatePicker = React.useCallback(() => {
        if (isSaving) {
            return;
        }

        setIsDatePickerVisible(true);
    }, [isSaving]);

    const handleCloseDatePicker = React.useCallback(() => {
        setIsDatePickerVisible(false);
    }, []);

    const handleSelectDateRange = React.useCallback((nextStartDate: string, nextEndDate: string) => {
        setStartDate(nextStartDate);
        setEndDate(nextEndDate);
        setFieldTouched('startDate');
        setFieldTouched('endDate');
        setSaveError(null);
        setIsDatePickerVisible(false);
    }, [setFieldTouched]);

    const closeCoverImageModal = React.useCallback(() => {
        if (isUploadingCoverImage || isSaving) {
            return;
        }

        setIsCoverImageModalVisible(false);
    }, [isSaving, isUploadingCoverImage]);

    const handlePickCoverFromLibrary = React.useCallback(async () => {
        if (isSaving || isUploadingCoverImage) {
            return;
        }

        try {
            setSaveError(null);
            setIsUploadingCoverImage(true);
            const pickedAsset = await pickTripCoverAsset();
            if (!pickedAsset) {
                return;
            }

            const uploadedUrl = await uploadTripCoverAsset({
                tripId: route.params.tripId,
                asset: pickedAsset
            });
            setCoverImage(uploadedUrl);
            setIsCoverImageModalVisible(false);
        } catch (error) {
            setSaveError(
                error instanceof Error && error.message
                    ? error.message
                    : '대표 사진을 업로드하지 못했어요.'
            );
        } finally {
            setIsUploadingCoverImage(false);
        }
    }, [isSaving, isUploadingCoverImage, route.params.tripId]);

    const handleSelectMemoryCover = React.useCallback((url: string) => {
        if (isSaving || isUploadingCoverImage) {
            return;
        }

        setCoverImage(url);
        setSaveError(null);
        setIsCoverImageModalVisible(false);
    }, [isSaving, isUploadingCoverImage]);

    const handleResetCoverImage = React.useCallback(() => {
        if (isSaving || isUploadingCoverImage) {
            return;
        }

        setCoverImage(null);
        setSaveError(null);
        setIsCoverImageModalVisible(false);
    }, [isSaving, isUploadingCoverImage]);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <ScrollView
                ref={scrollRef}
                style={styles.container}
                contentContainerStyle={[styles.content, keyboardAwareContentInsetStyle]}
                {...scrollViewProps}
            >
                <View style={styles.hero}>
                    <Text style={styles.title}>여행 정보 편집</Text>
                    <Text style={styles.description}>
                        여행 제목, 지역, 기간, 대표 사진을 한 번에 정리할 수 있어요.
                    </Text>
                </View>

                <View style={styles.formCard}>
                    <Text style={[styles.label, styles.labelFirst]}>대표 사진</Text>
                    <Pressable
                        accessibilityRole="button"
                        disabled={isSaving || isUploadingCoverImage}
                        onPress={() => {
                            setIsCoverImageModalVisible(true);
                        }}
                        style={({ pressed }) => [
                            styles.coverCard,
                            (isSaving || isUploadingCoverImage) ? styles.buttonDisabled : null,
                            pressed && !isSaving && !isUploadingCoverImage ? styles.buttonPressed : null
                        ]}
                    >
                        <View style={styles.coverPreviewFrame}>
                            {currentPreviewImage ? (
                                <Image source={{ uri: currentPreviewImage }} style={styles.coverPreviewImage} />
                            ) : (
                                <View style={styles.coverPreviewFallback}>
                                    <Text style={styles.coverPreviewFallbackText}>기본 사진</Text>
                                </View>
                            )}
                            <View pointerEvents="none" style={styles.coverPreviewOverlay}>
                                <View style={styles.coverPreviewEditBadge}>
                                    <MaterialCommunityIcons
                                        name="pencil"
                                        size={16}
                                        color="#ffffff"
                                    />
                                </View>
                            </View>
                        </View>
                        <View style={styles.coverCardBody}>
                            <Text style={styles.coverCardTitle}>대표 사진 변경</Text>
                            <Text style={styles.coverCardHint}>
                                사진 보관함에서 직접 올리거나, 추억 사진 중에서 고를 수 있어요.
                            </Text>
                            <View style={styles.coverCardActionRow}>
                                <Text style={styles.coverCardActionText}>
                                    {coverImage
                                        ? '직접 올린 사진 사용 중'
                                        : currentPreviewImage
                                            ? '기본 대표 사진 사용 중'
                                            : '사진 없음'}
                                </Text>
                                {isUploadingCoverImage ? (
                                    <ActivityIndicator size="small" color={theme.colors.accent} />
                                ) : (
                                    <Text style={styles.coverCardActionArrow}>›</Text>
                                )}
                            </View>
                        </View>
                    </Pressable>

                    <View style={styles.labelRow}>
                        <Text style={styles.label}>여행 제목</Text>
                        <Text style={styles.fieldCounter}>{titleLength}/{TRIP_TITLE_MAX_LENGTH}</Text>
                    </View>
                    <TextInput
                        autoCapitalize="sentences"
                        editable={!isSaving}
                        onFocus={createFocusHandler()}
                        onBlur={() => {
                            setFieldTouched('title');
                        }}
                        onChangeText={(value) => {
                            setTitle(truncateTripTitle(value, TRIP_TITLE_MAX_LENGTH));
                            setSaveError(null);
                        }}
                        placeholder="예: 도쿄 봄 여행"
                        placeholderTextColor={theme.colors.textSecondary}
                        style={[
                            styles.input,
                            visibleTitleError ? styles.inputError : null
                        ]}
                        value={title}
                    />
                    {visibleTitleError ? (
                        <Text style={styles.fieldError}>{visibleTitleError}</Text>
                    ) : null}

                    <Text style={styles.label}>지역</Text>
                    <TextInput
                        autoCapitalize="sentences"
                        editable={!isSaving}
                        onFocus={createFocusHandler()}
                        onBlur={() => {
                            setFieldTouched('location');
                        }}
                        onChangeText={(value) => {
                            setLocation(value);
                            setSaveError(null);
                        }}
                        placeholder="예: 도쿄"
                        placeholderTextColor={theme.colors.textSecondary}
                        style={styles.input}
                        value={location}
                    />
                    <Text style={styles.fieldHint}>
                        비워 두면 날짜 정보만 저장되고, 상세 화면에서는 지역을 따로 보여주지 않아요.
                    </Text>

                    <Text style={styles.label}>시작일</Text>
                    <Pressable
                        accessibilityRole="button"
                        disabled={isSaving}
                        onPress={() => {
                            handleOpenDatePicker();
                        }}
                        style={({ pressed }) => [
                            styles.dateButton,
                            visibleStartDateError ? styles.inputError : null,
                            isSaving ? styles.buttonDisabled : null,
                            pressed && !isSaving ? styles.buttonPressed : null
                        ]}
                    >
                        <Text style={styles.dateButtonValue}>
                            {formatCalendarDisplayDate(startDate)}
                        </Text>
                    </Pressable>
                    {visibleStartDateError ? (
                        <Text style={styles.fieldError}>{visibleStartDateError}</Text>
                    ) : null}

                    <Text style={styles.label}>종료일</Text>
                    <Pressable
                        accessibilityRole="button"
                        disabled={isSaving}
                        onPress={() => {
                            handleOpenDatePicker();
                        }}
                        style={({ pressed }) => [
                            styles.dateButton,
                            visibleEndDateError ? styles.inputError : null,
                            isSaving ? styles.buttonDisabled : null,
                            pressed && !isSaving ? styles.buttonPressed : null
                        ]}
                    >
                        <Text style={styles.dateButtonValue}>
                            {formatCalendarDisplayDate(endDate)}
                        </Text>
                    </Pressable>
                    {visibleEndDateError ? (
                        <Text style={styles.fieldError}>{visibleEndDateError}</Text>
                    ) : null}

                    <View
                        style={[
                            styles.statusCard,
                            statusIsWarning ? styles.statusCardWarning : null
                        ]}
                    >
                        <Text
                            style={[
                                styles.statusText,
                                statusIsWarning ? styles.statusTextWarning : null
                            ]}
                        >
                            {statusMessage}
                        </Text>
                    </View>
                    {saveSupportText ? (
                        <Text style={styles.statusSupportText}>{saveSupportText}</Text>
                    ) : null}
                    {showSessionRecoveryAction ? (
                        <Pressable
                            accessibilityRole="button"
                            disabled={isSaving || isAuthActionLoading}
                            onPress={() => {
                                void handleSessionRecovery();
                            }}
                            style={({ pressed }) => [
                                styles.supportActionButton,
                                (isSaving || isAuthActionLoading) ? styles.buttonDisabled : null,
                                pressed && !isSaving && !isAuthActionLoading ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.supportActionButtonText}>
                                {isAuthActionLoading ? '세션 확인 중...' : '세션 다시 확인'}
                            </Text>
                        </Pressable>
                    ) : null}

                    <View style={styles.actions}>
                        <Pressable
                            accessibilityRole="button"
                            disabled={isSaving}
                        onPress={() => {
                            handleDiscard(() => {
                                pendingNavigationActionRef.current = CommonActions.goBack();
                                setAllowNextRemove(true);
                            });
                        }}
                            style={({ pressed }) => [
                                styles.secondaryButton,
                                isSaving ? styles.buttonDisabled : null,
                                pressed && !isSaving ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.secondaryButtonText}>
                                {hasChanges ? '변경 취소' : '닫기'}
                            </Text>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            disabled={saveDisabled || isUploadingCoverImage}
                            onPress={() => {
                                void handleSave();
                            }}
                            style={({ pressed }) => [
                                styles.primaryButton,
                                saveDisabled || isUploadingCoverImage ? styles.buttonDisabled : null,
                                pressed && !saveDisabled && !isUploadingCoverImage ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.primaryButtonText}>
                                {isSaving ? '저장 중...' : '변경사항 저장'}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
            <Modal
                animationType="fade"
                transparent
                visible={isCoverImageModalVisible}
                onRequestClose={closeCoverImageModal}
            >
                <View style={styles.photoModalBackdrop}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={closeCoverImageModal}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.photoModalCard}>
                        <Text style={styles.photoModalEyebrow}>대표 사진</Text>
                        <Text style={styles.photoModalTitle}>대표 사진 고르기</Text>
                        <Text style={styles.photoModalSubtitle}>
                            직접 업로드하거나 여행 추억 사진 중에서 선택할 수 있어요.
                        </Text>

                        <Pressable
                            accessibilityRole="button"
                            disabled={isSaving || isUploadingCoverImage}
                            onPress={() => {
                                void handlePickCoverFromLibrary();
                            }}
                            style={({ pressed }) => [
                                styles.photoModalButton,
                                (isSaving || isUploadingCoverImage) ? styles.buttonDisabled : null,
                                pressed && !isSaving && !isUploadingCoverImage ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.photoModalButtonLabel}>사진 보관함에서 고르기</Text>
                            <Text style={styles.photoModalButtonHint}>새 대표 사진을 직접 업로드해요.</Text>
                        </Pressable>

                        <View style={styles.photoMemorySection}>
                            <Text style={styles.photoMemorySectionTitle}>추억 사진에서 고르기</Text>
                            {photoGalleryUrls.length > 0 ? (
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.photoMemoryRow}
                                >
                                    {photoGalleryUrls.map((url, index) => (
                                        <Pressable
                                            key={`${url}-${index}`}
                                            accessibilityRole="button"
                                            disabled={isSaving || isUploadingCoverImage}
                                            onPress={() => {
                                                handleSelectMemoryCover(url);
                                            }}
                                            style={({ pressed }) => [
                                                styles.photoMemoryThumbWrap,
                                                pressed && !isSaving && !isUploadingCoverImage ? styles.buttonPressed : null
                                            ]}
                                        >
                                            <Image source={{ uri: url }} style={styles.photoMemoryThumb} />
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            ) : (
                                <Text style={styles.photoMemoryEmptyText}>
                                    아직 고를 수 있는 추억 사진이 없어요.
                                </Text>
                            )}
                        </View>

                        <Pressable
                            accessibilityRole="button"
                            disabled={isSaving || isUploadingCoverImage}
                            onPress={handleResetCoverImage}
                            style={({ pressed }) => [
                                styles.photoModalButton,
                                styles.photoModalResetButton,
                                (isSaving || isUploadingCoverImage) ? styles.buttonDisabled : null,
                                pressed && !isSaving && !isUploadingCoverImage ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.photoModalButtonLabel}>기본 사진으로 초기화</Text>
                            <Text style={styles.photoModalButtonHint}>자동으로 선택된 기본 대표 사진으로 되돌려요.</Text>
                        </Pressable>

                        <Pressable
                            accessibilityRole="button"
                            disabled={isSaving || isUploadingCoverImage}
                            onPress={closeCoverImageModal}
                            style={({ pressed }) => [
                                styles.photoModalCloseButton,
                                (isSaving || isUploadingCoverImage) ? styles.buttonDisabled : null,
                                pressed && !isSaving && !isUploadingCoverImage ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.photoModalCloseButtonText}>닫기</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
            <DateCalendarModal
                visible={isDatePickerVisible}
                title="여행 날짜 선택"
                startDate={startDate}
                endDate={endDate}
                onClose={handleCloseDatePicker}
                onSelectRange={handleSelectDateRange}
            />
        </KeyboardAvoidingView>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    content: {
        paddingTop: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.lg
    },
    hero: {
        marginBottom: theme.spacing.md
    },
    title: {
        fontSize: 28,
        lineHeight: 34,
        fontFamily: theme.fonts.display,
        color: theme.colors.textPrimary
    },
    description: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 22
    },
    formCard: {
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    labelFirst: {
        marginTop: 0
    },
    label: {
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    fieldCounter: {
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    coverCard: {
        borderRadius: theme.radius.lg,
        backgroundColor: theme.mode === 'dark' ? '#2b241e' : '#ffffff',
        overflow: 'hidden',
        marginBottom: theme.spacing.xs
    },
    coverPreviewFrame: {
        position: 'relative'
    },
    coverPreviewImage: {
        width: '100%',
        height: 168,
        backgroundColor: theme.colors.surfaceMuted
    },
    coverPreviewFallback: {
        width: '100%',
        height: 168,
        backgroundColor: theme.colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center'
    },
    coverPreviewFallbackText: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold
    },
    coverPreviewOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.18)',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        padding: theme.spacing.sm
    },
    coverPreviewEditBadge: {
        width: 34,
        height: 34,
        borderRadius: theme.radius.md,
        backgroundColor: 'rgba(0, 0, 0, 0.46)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.28)',
        alignItems: 'center',
        justifyContent: 'center'
    },
    coverCardBody: {
        padding: theme.spacing.sm
    },
    coverCardTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold,
        fontSize: 16
    },
    coverCardHint: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    coverCardActionRow: {
        marginTop: theme.spacing.xs,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    coverCardActionText: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold
    },
    coverCardActionArrow: {
        color: theme.colors.textSecondary,
        fontSize: 20,
        lineHeight: 20
    },
    input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        backgroundColor: theme.mode === 'dark' ? '#2b241e' : '#ffffff',
        color: theme.colors.textPrimary
    },
    inputError: {
        borderColor: theme.colors.warning,
        backgroundColor: theme.colors.warningSoft
    },
    dateButton: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        backgroundColor: theme.mode === 'dark' ? '#2b241e' : '#ffffff'
    },
    dateButtonValue: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    fieldHint: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    fieldError: {
        marginTop: theme.spacing.micro,
        color: theme.colors.warning,
        lineHeight: 20
    },
    statusCard: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    statusCardWarning: {
        backgroundColor: theme.colors.warningSoft
    },
    statusText: {
        color: theme.colors.textPrimary,
        lineHeight: 21
    },
    statusTextWarning: {
        color: theme.colors.warning
    },
    statusSupportText: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    supportActionButton: {
        marginTop: theme.spacing.xs,
        alignSelf: 'flex-start',
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    supportActionButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    actions: {
        marginTop: theme.spacing.md,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: theme.spacing.xs
    },
    secondaryButton: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    secondaryButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    primaryButton: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        backgroundColor: theme.colors.accent
    },
    primaryButtonText: {
        color: theme.mode === 'dark' ? '#2b1c12' : '#ffffff',
        fontFamily: theme.fonts.semibold
    },
    buttonPressed: {
        opacity: 0.88
    },
    buttonDisabled: {
        opacity: 0.45
    },
    photoModalBackdrop: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.md,
        backgroundColor: 'rgba(15, 17, 18, 0.42)'
    },
    photoModalCard: {
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.sm
    },
    photoModalEyebrow: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    photoModalTitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontFamily: theme.fonts.display
    },
    photoModalSubtitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 21
    },
    photoModalButton: {
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.mode === 'dark' ? '#2b241e' : '#ffffff',
        padding: theme.spacing.sm
    },
    photoModalResetButton: {
        marginTop: theme.spacing.md
    },
    photoModalButtonLabel: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    photoModalButtonHint: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    photoMemorySection: {
        marginTop: theme.spacing.md
    },
    photoMemorySectionTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold,
        marginBottom: theme.spacing.xs
    },
    photoMemoryRow: {
        paddingRight: theme.spacing.micro
    },
    photoMemoryThumbWrap: {
        marginRight: theme.spacing.xs,
        borderRadius: theme.radius.md,
        overflow: 'hidden'
    },
    photoMemoryThumb: {
        width: 96,
        height: 96,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    photoMemoryEmptyText: {
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    photoModalCloseButton: {
        marginTop: theme.spacing.sm,
        alignSelf: 'flex-end',
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    photoModalCloseButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    }
});

import React from 'react';
import {
    ActivityIndicator,
    Animated,
    Image,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    pickTripMemoryAssets,
    takeTripMemoryPhotoAsset,
    type PickedTripMemoryAsset
} from '@/services/trip-memory-upload';
import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import { SheetBackButton } from './SheetBackButton';

type Props = {
    visible: boolean;
    targetTitle: string;
    isSaving: boolean;
    errorMessage?: string | null;
    onClose(): void;
    onSubmit(input: {
        assets: PickedTripMemoryAsset[];
    }): void;
};

const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 0.85;

export function TimelineMemoryComposerModal({
    visible,
    targetTitle,
    isSaving,
    errorMessage,
    onClose,
    onSubmit
}: Props) {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const sheetTranslateY = React.useRef(new Animated.Value(0)).current;
    const sheetInsetStyle = React.useMemo(() => ({
        paddingTop: insets.top
    }), [insets.top]);
    const contentInsetStyle = React.useMemo(() => ({
        paddingBottom: insets.bottom + theme.spacing.xxl
    }), [insets.bottom, theme.spacing.xxl]);
    const [assets, setAssets] = React.useState<PickedTripMemoryAsset[]>([]);
    const [didAttemptSubmit, setDidAttemptSubmit] = React.useState(false);
    const [isPickingPhotos, setIsPickingPhotos] = React.useState(false);
    const [isTakingPhoto, setIsTakingPhoto] = React.useState(false);
    const [pickerError, setPickerError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!visible) {
            return;
        }

        setAssets([]);
        setDidAttemptSubmit(false);
        setIsPickingPhotos(false);
        setIsTakingPhoto(false);
        setPickerError(null);
        sheetTranslateY.setValue(0);
    }, [sheetTranslateY, visible]);

    const hasContent = assets.length > 0;
    const contentError = !hasContent ? '사진을 한 장 이상 선택해 주세요.' : null;
    const supportMessage = pickerError || errorMessage || null;
    const isPhotoActionBusy = isPickingPhotos || isTakingPhoto;
    const canSubmit = !isSaving && !isPhotoActionBusy;

    const handlePickPhotos = React.useCallback(async () => {
        if (isSaving || isPhotoActionBusy) {
            return;
        }

        try {
            setIsPickingPhotos(true);
            setPickerError(null);
            const selectedAssets = await pickTripMemoryAssets();
            if (selectedAssets.length === 0) {
                return;
            }

            setAssets(selectedAssets);
        } catch (error) {
            setPickerError(
                error instanceof Error
                    ? error.message
                    : '추억 사진을 고르지 못했어요.'
            );
        } finally {
            setIsPickingPhotos(false);
        }
    }, [isPhotoActionBusy, isSaving]);

    const handleTakePhoto = React.useCallback(async () => {
        if (isSaving || isPhotoActionBusy) {
            return;
        }

        try {
            setIsTakingPhoto(true);
            setPickerError(null);
            const selectedAsset = await takeTripMemoryPhotoAsset();
            if (!selectedAsset) {
                return;
            }

            setAssets((currentAssets) => [...currentAssets, selectedAsset]);
        } catch (error) {
            setPickerError(
                error instanceof Error
                    ? error.message
                    : '추억 사진을 찍지 못했어요.'
            );
        } finally {
            setIsTakingPhoto(false);
        }
    }, [isPhotoActionBusy, isSaving]);

    const handleRemoveAsset = React.useCallback((targetIndex: number) => {
        setAssets((currentAssets) => currentAssets.filter((_, index) => index !== targetIndex));
    }, []);

    const handleSubmit = React.useCallback(() => {
        setDidAttemptSubmit(true);

        if (contentError) {
            return;
        }

        onSubmit({
            assets
        });
    }, [assets, contentError, onSubmit]);
    const resetSheetPosition = React.useCallback(() => {
        Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 180
        }).start();
    }, [sheetTranslateY]);
    const dismissSheetFromHandle = React.useCallback(() => {
        Animated.timing(sheetTranslateY, {
            toValue: windowHeight,
            duration: 180,
            useNativeDriver: true
        }).start(({ finished }) => {
            if (finished) {
                onClose();
            }
        });
    }, [onClose, sheetTranslateY, windowHeight]);
    const sheetHandlePanResponder = React.useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => !isSaving && !isPhotoActionBusy,
        onStartShouldSetPanResponderCapture: () => !isSaving && !isPhotoActionBusy,
        onMoveShouldSetPanResponder: (_event, gestureState) => (
            !isSaving
            && !isPhotoActionBusy
            && gestureState.dy > 2
            && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        ),
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => (
            !isSaving
            && !isPhotoActionBusy
            && gestureState.dy > 2
            && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        ),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_event, gestureState) => {
            sheetTranslateY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_event, gestureState) => {
            if (
                gestureState.dy > SHEET_DISMISS_DRAG_DISTANCE
                || gestureState.vy > SHEET_DISMISS_VELOCITY
            ) {
                dismissSheetFromHandle();
                return;
            }

            resetSheetPosition();
        },
        onPanResponderTerminate: resetSheetPosition
    }), [dismissSheetFromHandle, isPhotoActionBusy, isSaving, resetSheetPosition, sheetTranslateY]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.keyboardArea}
                >
                    <Animated.View
                        style={[
                            styles.sheet,
                            sheetInsetStyle,
                            {
                                transform: [{ translateY: sheetTranslateY }]
                            }
                        ]}
                    >
                        <View
                            {...sheetHandlePanResponder.panHandlers}
                            collapsable={false}
                            style={styles.handleTouch}
                        >
                            <View style={styles.handle} />
                        </View>
                        <View style={styles.header}>
                            <SheetBackButton disabled={isSaving || isPhotoActionBusy} onPress={onClose} />
                            <View style={styles.headerCopy}>
                                <Text numberOfLines={1} style={styles.headerTitle}>추억 추가</Text>
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                disabled={!canSubmit}
                                onPress={handleSubmit}
                                style={({ pressed }) => [
                                    styles.saveButton,
                                    !canSubmit ? styles.saveButtonDisabled : null,
                                    pressed && canSubmit ? styles.buttonPressed : null
                                ]}
                            >
                                <Text style={styles.saveButtonText}>
                                    {isSaving ? '저장 중' : '저장'}
                                </Text>
                            </Pressable>
                        </View>

                        <ScrollView
                            style={styles.scroll}
                            contentContainerStyle={[styles.content, contentInsetStyle]}
                        >
                            <View style={styles.targetCard}>
                                <Text style={styles.targetLabel}>추억이 붙을 일정</Text>
                                <Text style={styles.targetTitle}>{targetTitle || '선택된 일정'}</Text>
                            </View>

                            <View style={styles.formCard}>
                                <View style={styles.photoHeader}>
                                    <View style={styles.photoHeaderCopy}>
                                        <Text style={styles.sectionLabel}>사진</Text>
                                        <Text style={styles.sectionSupport}>
                                            여러 장을 골라 두고 저장할 때 한 번에 올릴 수 있어요.
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.photoActionRow}>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={isSaving || isPhotoActionBusy}
                                        onPress={() => {
                                            void handlePickPhotos();
                                        }}
                                        style={({ pressed }) => [
                                            styles.photoAction,
                                            pressed && !isSaving && !isPhotoActionBusy ? styles.buttonPressed : null,
                                            isSaving || isPhotoActionBusy ? styles.photoActionDisabled : null
                                        ]}
                                    >
                                        {isPickingPhotos ? (
                                            <ActivityIndicator size="small" color={theme.colors.accent} />
                                        ) : (
                                            <Text style={styles.photoActionText}>
                                                {assets.length > 0 ? '다시 고르기' : '사진 고르기'}
                                            </Text>
                                        )}
                                    </Pressable>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={isSaving || isPhotoActionBusy}
                                        onPress={() => {
                                            void handleTakePhoto();
                                        }}
                                        style={({ pressed }) => [
                                            styles.photoAction,
                                            pressed && !isSaving && !isPhotoActionBusy ? styles.buttonPressed : null,
                                            isSaving || isPhotoActionBusy ? styles.photoActionDisabled : null
                                        ]}
                                    >
                                        {isTakingPhoto ? (
                                            <ActivityIndicator size="small" color={theme.colors.accent} />
                                        ) : (
                                            <Text style={styles.photoActionText}>사진 찍기</Text>
                                        )}
                                    </Pressable>
                                </View>

                                {assets.length > 0 ? (
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.photoRow}
                                    >
                                        {assets.map((asset, index) => (
                                            <View
                                                key={`${asset.uri}-${index}`}
                                                style={[
                                                    styles.photoPreviewCard,
                                                    index < assets.length - 1 ? styles.photoPreviewCardSpaced : null
                                                ]}
                                            >
                                                <Image
                                                    source={{ uri: asset.uri }}
                                                    style={styles.photoPreview}
                                                />
                                                <Pressable
                                                    accessibilityRole="button"
                                                    disabled={isSaving || isPhotoActionBusy}
                                                    onPress={() => {
                                                        handleRemoveAsset(index);
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.removePhotoButton,
                                                        pressed && !isSaving && !isPhotoActionBusy ? styles.buttonPressed : null
                                                    ]}
                                                >
                                                    <Text style={styles.removePhotoButtonText}>삭제</Text>
                                                </Pressable>
                                            </View>
                                        ))}
                                    </ScrollView>
                                ) : (
                                    <View style={styles.emptyPhotoCard}>
                                        <Text style={styles.emptyPhotoTitle}>사진을 한 장 이상 골라 주세요.</Text>
                                        <Text style={styles.emptyPhotoSupport}>
                                            추억은 사진으로만 저장돼요.
                                        </Text>
                                    </View>
                                )}
                                {didAttemptSubmit && contentError ? (
                                    <Text style={styles.fieldError}>{contentError}</Text>
                                ) : null}
                            </View>

                            <View style={[styles.statusCard, supportMessage ? styles.statusCardWarning : null]}>
                                <Text style={styles.statusText}>
                                    {supportMessage || '저장하면 선택한 일정 카드의 추억 수와 사진 미리보기가 바로 갱신돼요.'}
                                </Text>
                            </View>
                        </ScrollView>
                    </Animated.View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.28)'
    },
    keyboardArea: {
        width: '100%',
        height: '100%',
        justifyContent: 'flex-end'
    },
    sheet: {
        height: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        maxHeight: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        backgroundColor: theme.colors.surface
    },
    handleTouch: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 36,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    handle: {
        width: 48,
        height: 5,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    headerCopy: {
        flex: 1,
        justifyContent: 'center',
        minHeight: theme.spacing.xl,
        paddingRight: theme.spacing.sm
    },
    headerTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    saveButton: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.accent
    },
    saveButtonDisabled: {
        opacity: 0.5
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontFamily: theme.fonts.bold
    },
    content: {
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.md
    },
    scroll: {
        flex: 1
    },
    targetCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    targetLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    targetTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.display
    },
    formCard: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    photoHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: theme.spacing.sm
    },
    photoHeaderCopy: {
        flex: 1
    },
    sectionLabel: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontFamily: theme.fonts.bold
    },
    sectionSupport: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    photoActionRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.sm
    },
    photoAction: {
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    photoActionDisabled: {
        opacity: 0.55
    },
    photoActionText: {
        color: theme.colors.accent,
        fontSize: 15,
        lineHeight: 20,
        fontFamily: theme.fonts.bold
    },
    photoRow: {
        paddingTop: theme.spacing.sm
    },
    photoPreviewCard: {
        width: 132
    },
    photoPreviewCardSpaced: {
        marginRight: theme.spacing.xs
    },
    photoPreview: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    removePhotoButton: {
        marginTop: theme.spacing.micro,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    removePhotoButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    emptyPhotoCard: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyPhotoTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold
    },
    emptyPhotoSupport: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    fieldLabel: {
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    textArea: {
        minHeight: 128,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    textInputError: {
        borderColor: theme.colors.warning
    },
    fieldError: {
        marginTop: theme.spacing.micro,
        color: theme.colors.warning,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    statusCard: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    statusCardWarning: {
        backgroundColor: theme.mode === 'dark' ? '#4f2a22' : '#fff1e5'
    },
    statusText: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    buttonPressed: {
        opacity: 0.88
    }
});

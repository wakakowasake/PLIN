import { formatTimeStr, parseTimeStr } from '@shared/core/utils/time-value-helpers.js';
import React from 'react';
import {
    Animated,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import type { MobileTimelineMemoCreateInput } from '@/types/trip';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import { SheetBackButton } from './SheetBackButton';

type Props = {
    visible: boolean;
    targetTitle: string;
    defaultTime: string;
    isSaving: boolean;
    errorMessage?: string | null;
    onClose(): void;
    onSubmit(input: MobileTimelineMemoCreateInput): void;
};

function normalizeTextInput(value: string) {
    return String(value || '').trim();
}

function normalizeTimeInput(value: string) {
    const parsed = parseTimeStr(String(value || '').trim());
    if (parsed === null) {
        return '';
    }

    return formatTimeStr(parsed);
}

const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 0.85;

export function TimelineMemoComposerModal({
    visible,
    targetTitle,
    defaultTime,
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
    const {
        scrollRef,
        createFocusHandler,
        keyboardAwareContentInsetStyle,
        scrollViewProps
    } = useKeyboardAwareInputScroll(132);
    const [content, setContent] = React.useState('');
    const [didAttemptSubmit, setDidAttemptSubmit] = React.useState(false);

    React.useEffect(() => {
        if (!visible) {
            return;
        }

        setContent('');
        setDidAttemptSubmit(false);
        sheetTranslateY.setValue(0);
    }, [sheetTranslateY, visible]);

    const normalizedContent = React.useMemo(() => normalizeTextInput(content), [content]);
    const normalizedDefaultTime = React.useMemo(
        () => normalizeTimeInput(defaultTime) || '09:00',
        [defaultTime]
    );
    const contentError = !normalizedContent ? '메모를 입력해 주세요.' : null;
    const canSubmit = !isSaving;

    const handleSubmit = React.useCallback(() => {
        setDidAttemptSubmit(true);

        if (contentError) {
            return;
        }

        onSubmit({
            content: normalizedContent,
            time: normalizedDefaultTime
        });
    }, [contentError, normalizedContent, normalizedDefaultTime, onSubmit]);
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
        onStartShouldSetPanResponder: () => !isSaving,
        onStartShouldSetPanResponderCapture: () => !isSaving,
        onMoveShouldSetPanResponder: (_event, gestureState) => (
            !isSaving
            && gestureState.dy > 2
            && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        ),
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => (
            !isSaving
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
    }), [dismissSheetFromHandle, isSaving, resetSheetPosition, sheetTranslateY]);

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
                            <SheetBackButton disabled={isSaving} onPress={onClose} />
                            <View style={styles.headerCopy}>
                                <Text numberOfLines={1} style={styles.headerTitle}>메모 추가</Text>
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
                                    {isSaving ? '저장 중...' : '저장'}
                                </Text>
                            </Pressable>
                        </View>

                        <ScrollView
                            ref={scrollRef}
                            style={styles.scroll}
                            contentContainerStyle={[styles.content, contentInsetStyle, keyboardAwareContentInsetStyle]}
                            {...scrollViewProps}
                        >
                            <View style={styles.formCard}>
                                <Text style={styles.sectionLabel}>메모가 붙을 일정</Text>
                                <Text style={styles.sectionSupport}>
                                    {targetTitle || '선택된 일정'}에 메모로 저장돼요.
                                </Text>

                                <Text style={styles.fieldLabel}>메모 내용</Text>
                                <TextInput
                                    value={content}
                                    onChangeText={setContent}
                                    onFocus={createFocusHandler()}
                                    editable={!isSaving}
                                    multiline
                                    textAlignVertical="top"
                                    placeholder="예: 체크인 전에 짐 보관 먼저 하기"
                                    placeholderTextColor={theme.colors.textSecondary}
                                    style={[
                                        styles.textArea,
                                        didAttemptSubmit && contentError ? styles.textInputError : null
                                    ]}
                                />
                                {didAttemptSubmit && contentError ? (
                                    <Text style={styles.fieldError}>{contentError}</Text>
                                ) : null}
                            </View>

                            <View style={[styles.statusCard, errorMessage ? styles.statusCardWarning : null]}>
                                <Text style={styles.statusText}>
                                    {errorMessage
                                        ? errorMessage
                                        : '저장하면 위 일정 카드의 메모 영역에 바로 표시돼요.'}
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
        paddingBottom: theme.spacing.sm
    },
    scroll: {
        flex: 1
    },
    formCard: {
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    sectionLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    sectionSupport: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    fieldLabel: {
        marginTop: theme.spacing.sm,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    textArea: {
        minHeight: 140,
        marginTop: theme.spacing.micro,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        color: theme.colors.textPrimary
    },
    textInputError: {
        borderColor: theme.mode === 'dark' ? '#a76d6d' : '#d35b5b'
    },
    fieldError: {
        marginTop: theme.spacing.xs,
        color: theme.mode === 'dark' ? '#f2a3a3' : '#c24141',
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    statusCard: {
        marginBottom: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    statusCardWarning: {
        borderColor: theme.mode === 'dark' ? '#84693a' : '#edd49a',
        backgroundColor: theme.mode === 'dark' ? '#342a16' : '#fff6cf'
    },
    statusText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    buttonPressed: {
        opacity: 0.88
    }
});

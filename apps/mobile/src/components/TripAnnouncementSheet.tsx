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

import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import { SheetBackButton } from './SheetBackButton';

type Props = {
    visible: boolean;
    tripTitle: string;
    error?: string | null;
    busy?: boolean;
    actionDisabled?: boolean;
    onClose(): void;
    onSubmit(input: { title: string; body: string }): void;
};

const TITLE_MAX_LENGTH = 60;
const BODY_MAX_LENGTH = 240;
const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 0.85;

export function TripAnnouncementSheet({
    visible,
    tripTitle,
    error = null,
    busy = false,
    actionDisabled = false,
    onClose,
    onSubmit
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const sheetTranslateY = React.useRef(new Animated.Value(0)).current;
    const [title, setTitle] = React.useState('');
    const [body, setBody] = React.useState('');
    const {
        scrollRef,
        createFocusHandler,
        keyboardAwareContentInsetStyle,
        scrollViewProps
    } = useKeyboardAwareInputScroll(120);

    React.useEffect(() => {
        if (!visible) {
            return;
        }

        setTitle('');
        setBody('');
    }, [tripTitle, visible]);

    const isActionDisabled = busy || actionDisabled;
    const canSubmit = body.trim().length > 0 && !isActionDisabled;

    const handleSubmit = React.useCallback(() => {
        if (!canSubmit) {
            return;
        }

        onSubmit({
            title,
            body
        });
    }, [body, canSubmit, onSubmit, title]);

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
        onStartShouldSetPanResponder: () => !busy,
        onStartShouldSetPanResponderCapture: () => !busy,
        onMoveShouldSetPanResponder: (_event, gestureState) => (
            !busy
            && gestureState.dy > 2
            && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        ),
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => (
            !busy
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
    }), [busy, dismissSheetFromHandle, resetSheetPosition, sheetTranslateY]);

    React.useEffect(() => {
        if (visible) {
            sheetTranslateY.setValue(0);
        }
    }, [sheetTranslateY, visible]);

    return (
        <Modal
            animationType="slide"
            transparent
            visible={visible}
            onRequestClose={() => {
                if (!busy) {
                    onClose();
                }
            }}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.backdrop}
            >
                <Pressable style={StyleSheet.absoluteFill} />
                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            paddingTop: insets.top + theme.spacing.sm,
                            paddingBottom: insets.bottom + theme.spacing.md,
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
                    <View style={styles.headerRow}>
                        <SheetBackButton disabled={busy} onPress={onClose} />
                        <View style={styles.headerCopy}>
                            <Text numberOfLines={1} style={styles.title}>참가자 공지</Text>
                        </View>
                        <View style={styles.headerActions}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={!canSubmit}
                                onPress={handleSubmit}
                                style={({ pressed }) => [
                                    styles.sendButton,
                                    !canSubmit ? styles.sendButtonDisabled : null,
                                    pressed && canSubmit ? styles.buttonPressed : null
                                ]}
                            >
                                <Text style={styles.sendButtonText}>
                                    {busy ? '전송 중' : '보내기'}
                                </Text>
                            </Pressable>
                        </View>
                    </View>

                    <ScrollView
                        ref={scrollRef}
                        contentContainerStyle={[styles.content, keyboardAwareContentInsetStyle]}
                        showsVerticalScrollIndicator={false}
                        {...scrollViewProps}
                    >
                        <View style={styles.fieldBlock}>
                            <View style={styles.fieldHeader}>
                                <Text style={styles.fieldLabel}>제목</Text>
                                <Text style={styles.counter}>{title.length}/{TITLE_MAX_LENGTH}</Text>
                            </View>
                            <TextInput
                                editable={!isActionDisabled}
                                maxLength={TITLE_MAX_LENGTH}
                                onChangeText={setTitle}
                                onFocus={createFocusHandler()}
                                placeholder="비워 두면 일정 제목으로 발송돼요"
                                placeholderTextColor={theme.colors.textSecondary}
                                style={styles.input}
                                value={title}
                            />
                        </View>

                        <View style={styles.fieldBlock}>
                            <View style={styles.fieldHeader}>
                                <Text style={styles.fieldLabel}>공지 내용</Text>
                                <Text style={styles.counter}>{body.length}/{BODY_MAX_LENGTH}</Text>
                            </View>
                            <TextInput
                                editable={!isActionDisabled}
                                maxLength={BODY_MAX_LENGTH}
                                multiline
                                onChangeText={setBody}
                                onFocus={createFocusHandler()}
                                placeholder="예: 내일 오전 8시에 로비에서 출발해요. 늦지 않게 준비해 주세요."
                                placeholderTextColor={theme.colors.textSecondary}
                                style={[styles.input, styles.textArea]}
                                textAlignVertical="top"
                                value={body}
                            />
                            <Text style={styles.supportText}>
                                공지는 저장되지 않고, 참가자에게 바로 전송돼요.
                            </Text>
                        </View>

                        {error ? (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        ) : null}
                    </ScrollView>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(24, 18, 12, 0.32)'
    },
    sheet: {
        height: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        maxHeight: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm
    },
    handleTouch: {
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: theme.spacing.xl,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    handle: {
        width: 44,
        height: 5,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    headerCopy: {
        flex: 1,
        justifyContent: 'center',
        minHeight: theme.spacing.xl
    },
    headerActions: {
        alignItems: 'flex-end'
    },
    title: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold,
        fontSize: 18,
        lineHeight: 24
    },
    content: {
        paddingTop: theme.spacing.md,
        gap: theme.spacing.md
    },
    fieldBlock: {
        gap: theme.spacing.xs
    },
    fieldHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    fieldLabel: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold,
        fontSize: 14
    },
    counter: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.medium,
        fontSize: 12
    },
    input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        color: theme.colors.textPrimary,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        fontFamily: theme.fonts.body,
        fontSize: 15
    },
    textArea: {
        minHeight: 150
    },
    supportText: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body,
        fontSize: 12,
        lineHeight: 18
    },
    errorBox: {
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.warning,
        backgroundColor: theme.colors.warningSoft,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm
    },
    errorText: {
        color: theme.colors.warning,
        fontFamily: theme.fonts.medium,
        fontSize: 13,
        lineHeight: 19
    },
    sendButton: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 40,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent,
        paddingHorizontal: theme.spacing.sm
    },
    sendButtonDisabled: {
        opacity: 0.45
    },
    sendButtonText: {
        color: '#ffffff',
        fontFamily: theme.fonts.semibold,
        fontSize: 14
    },
    buttonPressed: {
        opacity: 0.8
    }
});

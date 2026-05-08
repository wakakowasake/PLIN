import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
    Alert as NativeAlert,
    Animated,
    Easing,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AppTheme, useAppTheme } from '@/theme';

export type FeedbackTone = 'info' | 'success' | 'warning' | 'error';
export type FeedbackAlertButton = {
    text?: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
    isPreferred?: boolean;
};
export type FeedbackAlertOptions = {
    cancelable?: boolean;
    onDismiss?: () => void;
};

type ToastPayload = {
    id: number;
    title: string;
    message: string;
    tone: FeedbackTone;
    duration: number;
    actionLabel?: string;
    onAction?: () => void;
};

type DialogPayload = {
    id: number;
    title: string;
    message: string;
    tone: FeedbackTone;
    buttons: FeedbackAlertButton[];
    cancelable: boolean;
    onDismiss?: () => void;
};

type FeedbackBridge = {
    presentToast(payload: Omit<ToastPayload, 'id'>): void;
    presentDialog(payload: Omit<DialogPayload, 'id'>): void;
};

let activeBridge: FeedbackBridge | null = null;
let feedbackSequence = 0;

function nextFeedbackId() {
    feedbackSequence += 1;
    return feedbackSequence;
}

function normalizeText(value: string | undefined) {
    return String(value || '').trim();
}

function splitAlertContent(title: string, message?: string) {
    const normalizedTitle = normalizeText(title);
    const normalizedMessage = normalizeText(message);

    if (!normalizedTitle && !normalizedMessage) {
        return {
            title: '',
            message: ''
        };
    }

    if (!normalizedMessage) {
        return {
            title: '',
            message: normalizedTitle
        };
    }

    return {
        title: normalizedTitle,
        message: normalizedMessage
    };
}

function resolveTone(title: string, message: string, buttons?: FeedbackAlertButton[]) {
    if (buttons?.some((button) => button.style === 'destructive')) {
        return 'warning';
    }

    const combined = `${title} ${message}`;

    if (/(완료|성공|추가|복사|저장|연결됨|발송 완료|담았어요|동기화|가져오기|사본)/.test(combined)) {
        return 'success';
    }

    if (/(실패|오류|불가|필요|없음|못했|닫았어요|다시 시도|권한|지원되지 않는)/.test(combined)) {
        return 'error';
    }

    if (/(삭제|제거|차단|신고|주의)/.test(combined)) {
        return 'warning';
    }

    return 'info';
}

function resolveToastDuration(tone: FeedbackTone) {
    if (tone === 'warning' || tone === 'error') {
        return 3400;
    }

    return 2600;
}

function resolveToastAction(tone: FeedbackTone, buttons?: FeedbackAlertButton[]) {
    if (tone !== 'success' || !buttons || buttons.length === 0) {
        return null;
    }

    const actionButton = [...buttons]
        .reverse()
        .find((button) => button.style !== 'cancel' && button.style !== 'destructive');

    if (!actionButton) {
        return null;
    }

    const actionLabel = normalizeText(actionButton.text) || '열기';
    return {
        actionLabel,
        onAction: actionButton.onPress
    };
}

function shouldUseToast(tone: FeedbackTone, buttons?: FeedbackAlertButton[]) {
    if (tone === 'success') {
        return true;
    }

    if (!buttons || buttons.length === 0) {
        return true;
    }

    if (buttons.length > 1) {
        return false;
    }

    const [button] = buttons;
    const label = normalizeText(button.text);
    const hasAction = typeof button.onPress === 'function' || (button.style && button.style !== 'default');
    const isPassiveLabel = !label || label === '확인' || label === '닫기';

    return !hasAction && isPassiveLabel;
}

function presentAlert(
    title: string,
    message?: string,
    buttons?: FeedbackAlertButton[],
    options?: FeedbackAlertOptions
) {
    if (!activeBridge) {
        NativeAlert.alert(title, message, buttons, options);
        return;
    }

    const content = splitAlertContent(title, message);
    const tone = resolveTone(content.title, content.message, buttons);
    const toastAction = resolveToastAction(tone, buttons);

    if (shouldUseToast(tone, buttons)) {
        activeBridge.presentToast({
            title: content.title,
            message: content.message,
            tone,
            duration: toastAction ? 4200 : resolveToastDuration(tone),
            actionLabel: toastAction?.actionLabel,
            onAction: toastAction?.onAction
        });
        return;
    }

    activeBridge.presentDialog({
        title: content.title || '안내',
        message: content.message,
        tone,
        buttons: buttons && buttons.length > 0 ? buttons : [{ text: '확인' }],
        cancelable: Boolean(options?.cancelable),
        onDismiss: options?.onDismiss
    });
}

export const Alert = {
    alert(
        title: string,
        message?: string,
        buttons?: FeedbackAlertButton[],
        options?: FeedbackAlertOptions
    ) {
        presentAlert(title, message, buttons, options);
    }
};

export function showToast(message: string, options: { title?: string; tone?: FeedbackTone; duration?: number } = {}) {
    if (!activeBridge) {
        NativeAlert.alert(options.title || '', message);
        return;
    }

    const normalizedTitle = normalizeText(options.title);
    const normalizedMessage = normalizeText(message);
    const tone = options.tone || resolveTone(normalizedTitle, normalizedMessage);

    activeBridge.presentToast({
        title: normalizedTitle,
        message: normalizedMessage,
        tone,
        duration: options.duration || resolveToastDuration(tone)
    });
}

function getTonePalette(theme: AppTheme, tone: FeedbackTone) {
    if (tone === 'success') {
        return {
            background: theme.colors.accentSoft,
            border: theme.colors.accent,
            icon: theme.colors.accent,
            text: theme.colors.textPrimary,
            subtleText: theme.colors.textSecondary
        };
    }

    if (tone === 'warning' || tone === 'error') {
        return {
            background: theme.colors.warningSoft,
            border: theme.colors.warning,
            icon: theme.colors.warning,
            text: theme.colors.textPrimary,
            subtleText: theme.colors.textSecondary
        };
    }

    return {
        background: theme.colors.surfaceMuted,
        border: theme.colors.border,
        icon: theme.colors.textSecondary,
        text: theme.colors.textPrimary,
        subtleText: theme.colors.textSecondary
    };
}

function getToneIconName(tone: FeedbackTone) {
    switch (tone) {
        case 'success':
            return 'check-circle-outline';
        case 'warning':
            return 'alert-outline';
        case 'error':
            return 'alert-circle-outline';
        default:
            return 'information-outline';
    }
}

function getDialogIconName(dialog: DialogPayload) {
    const combined = `${dialog.title} ${dialog.message}`;
    const isDeleteConfirmation = /(삭제|제거)/.test(combined)
        && dialog.buttons.some((button) => button.style === 'destructive');

    if (isDeleteConfirmation) {
        return 'trash-can-outline';
    }

    return getToneIconName(dialog.tone);
}

function FeedbackDialog({
    dialog,
    onClose
}: {
    dialog: DialogPayload;
    onClose(triggerOnDismiss?: boolean): void;
}) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const palette = getTonePalette(theme, dialog.tone);

    const handleButtonPress = React.useCallback((button: FeedbackAlertButton) => {
        onClose(false);
        requestAnimationFrame(() => {
            button.onPress?.();
        });
    }, [onClose]);

    return (
        <Modal
            animationType="fade"
            transparent
            visible
            onRequestClose={() => {
                if (dialog.cancelable) {
                    onClose(true);
                }
            }}
        >
            <View style={styles.dialogOverlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => {
                        if (dialog.cancelable) {
                            onClose(true);
                        }
                    }}
                />
                <View style={styles.dialogCard}>
                    <View
                        style={[
                            styles.dialogIconWrap,
                            {
                                backgroundColor: palette.background,
                                borderColor: palette.border
                            }
                        ]}
                    >
                        <MaterialCommunityIcons
                            name={getDialogIconName(dialog)}
                            size={28}
                            color={palette.icon}
                        />
                    </View>
                    <Text style={styles.dialogTitle}>{dialog.title}</Text>
                    {dialog.message ? (
                        <Text style={styles.dialogMessage}>{dialog.message}</Text>
                    ) : null}
                    <View style={styles.dialogButtons}>
                        {dialog.buttons.map((button, index) => {
                            const buttonStyle = button.style || 'default';
                            const isDestructive = buttonStyle === 'destructive';
                            const isCancel = buttonStyle === 'cancel';
                            const isPrimary = !isCancel && (button.isPreferred || index === dialog.buttons.length - 1);

                            return (
                                <Pressable
                                    key={`${dialog.id}-${button.text || index}`}
                                    style={({ pressed }) => [
                                        styles.dialogButton,
                                        isCancel
                                            ? styles.dialogButtonMuted
                                            : isDestructive
                                                ? styles.dialogButtonDestructive
                                                : isPrimary
                                                    ? styles.dialogButtonPrimary
                                                    : styles.dialogButtonSecondary,
                                        pressed ? styles.dialogButtonPressed : null
                                    ]}
                                    onPress={() => {
                                        handleButtonPress(button);
                                    }}
                                >
                                    <Text
                                        style={[
                                            styles.dialogButtonText,
                                            isCancel
                                                ? styles.dialogButtonTextMuted
                                                : isDestructive || isPrimary
                                                    ? styles.dialogButtonTextInverted
                                                    : styles.dialogButtonTextDefault
                                        ]}
                                    >
                                        {button.text || '확인'}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const [toast, setToast] = React.useState<ToastPayload | null>(null);
    const [dialog, setDialog] = React.useState<DialogPayload | null>(null);
    const toastOpacity = React.useRef(new Animated.Value(0)).current;
    const toastTranslateY = React.useRef(new Animated.Value(24)).current;
    const toastHideTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearToastTimer = React.useCallback(() => {
        if (toastHideTimeoutRef.current) {
            clearTimeout(toastHideTimeoutRef.current);
            toastHideTimeoutRef.current = null;
        }
    }, []);

    const dismissToast = React.useCallback((toastId?: number) => {
        clearToastTimer();

        Animated.parallel([
            Animated.timing(toastOpacity, {
                toValue: 0,
                duration: 180,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true
            }),
            Animated.timing(toastTranslateY, {
                toValue: 24,
                duration: 180,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true
            })
        ]).start(({ finished }) => {
            if (finished) {
                setToast((currentToast) => (
                    currentToast && (!toastId || currentToast.id === toastId) ? null : currentToast
                ));
            }
        });
    }, [clearToastTimer, toastOpacity, toastTranslateY]);

    const showToast = React.useCallback((payload: Omit<ToastPayload, 'id'>) => {
        clearToastTimer();
        const nextToast = {
            ...payload,
            id: nextFeedbackId()
        };

        toastOpacity.stopAnimation();
        toastTranslateY.stopAnimation();
        toastOpacity.setValue(0);
        toastTranslateY.setValue(24);
        setToast(nextToast);

        requestAnimationFrame(() => {
            Animated.parallel([
                Animated.timing(toastOpacity, {
                    toValue: 1,
                    duration: 220,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true
                }),
                Animated.timing(toastTranslateY, {
                    toValue: 0,
                    duration: 220,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true
                })
            ]).start();

            toastHideTimeoutRef.current = setTimeout(() => {
                Animated.parallel([
                    Animated.timing(toastOpacity, {
                        toValue: 0,
                        duration: 180,
                        easing: Easing.in(Easing.quad),
                        useNativeDriver: true
                    }),
                    Animated.timing(toastTranslateY, {
                        toValue: 24,
                        duration: 180,
                        easing: Easing.in(Easing.quad),
                        useNativeDriver: true
                    })
                ]).start(({ finished }) => {
                    if (finished) {
                        setToast((currentToast) => (
                            currentToast && currentToast.id === nextToast.id ? null : currentToast
                        ));
                    }
                });
            }, payload.duration);
        });
    }, [clearToastTimer, toastOpacity, toastTranslateY]);

    const closeDialog = React.useCallback((triggerOnDismiss = false) => {
        setDialog((currentDialog) => {
            if (currentDialog && triggerOnDismiss) {
                currentDialog.onDismiss?.();
            }

            return null;
        });
    }, []);

    React.useEffect(() => {
        const bridge: FeedbackBridge = {
            presentToast(payload) {
                showToast(payload);
            },
            presentDialog(payload) {
                setDialog({
                    ...payload,
                    id: nextFeedbackId()
                });
            }
        };

        activeBridge = bridge;

        return () => {
            if (activeBridge === bridge) {
                activeBridge = null;
            }
        };
    }, [showToast]);

    React.useEffect(() => () => {
        clearToastTimer();
    }, [clearToastTimer]);

    const toastPalette = toast ? getTonePalette(theme, toast.tone) : null;

    return (
        <>
            {children}
            {toast && toastPalette ? (
                <View pointerEvents="box-none" style={styles.toastViewport}>
                    <Animated.View
                        style={[
                            styles.toastCard,
                            {
                                bottom: insets.bottom + theme.spacing.md,
                                opacity: toastOpacity,
                                transform: [{ translateY: toastTranslateY }],
                                backgroundColor: toastPalette.background,
                                borderColor: toastPalette.border
                            }
                        ]}
                    >
                        <MaterialCommunityIcons
                            name={getToneIconName(toast.tone)}
                            size={22}
                            color={toastPalette.icon}
                            style={styles.toastIcon}
                        />
                        <View style={styles.toastTextBlock}>
                            {toast.title ? (
                                <Text style={[styles.toastTitle, { color: toastPalette.text }]}>
                                    {toast.title}
                                </Text>
                            ) : null}
                            <Text
                                style={[
                                    styles.toastMessage,
                                    { color: toast.title ? toastPalette.subtleText : toastPalette.text }
                                ]}
                            >
                                {toast.message}
                            </Text>
                        </View>
                        {toast.actionLabel ? (
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => {
                                    const activeToastId = toast.id;
                                    dismissToast(activeToastId);
                                    requestAnimationFrame(() => {
                                        toast.onAction?.();
                                    });
                                }}
                                style={({ pressed }) => [
                                    styles.toastActionButton,
                                    { backgroundColor: toastPalette.border },
                                    pressed ? styles.toastActionButtonPressed : null
                                ]}
                            >
                                <Text style={[styles.toastActionText, { color: theme.colors.surface }]}>
                                    {toast.actionLabel}
                                </Text>
                            </Pressable>
                        ) : null}
                        <Pressable
                            accessibilityRole="button"
                            hitSlop={8}
                            onPress={() => {
                                dismissToast(toast.id);
                            }}
                            style={styles.toastCloseButton}
                        >
                            <MaterialCommunityIcons
                                name="close"
                                size={18}
                                color={toastPalette.subtleText}
                            />
                        </Pressable>
                    </Animated.View>
                </View>
            ) : null}
            {dialog ? (
                <FeedbackDialog dialog={dialog} onClose={closeDialog} />
            ) : null}
        </>
    );
}

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        toastViewport: {
            ...StyleSheet.absoluteFillObject,
            pointerEvents: 'box-none'
        },
        toastCard: {
            position: 'absolute',
            left: theme.spacing.md,
            right: theme.spacing.md,
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.16,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 14
        },
        toastIcon: {
            marginRight: theme.spacing.xs
        },
        toastTextBlock: {
            flex: 1,
            gap: 4
        },
        toastActionButton: {
            marginLeft: theme.spacing.xs,
            minHeight: 32,
            borderRadius: theme.radius.full,
            paddingHorizontal: theme.spacing.sm,
            alignItems: 'center',
            justifyContent: 'center'
        },
        toastActionButtonPressed: {
            opacity: 0.82
        },
        toastActionText: {
            fontFamily: theme.fonts.semibold,
            fontSize: 13
        },
        toastTitle: {
            fontFamily: theme.fonts.bold,
            fontSize: 15
        },
        toastMessage: {
            fontFamily: theme.fonts.content,
            fontSize: 13,
            lineHeight: 18
        },
        toastCloseButton: {
            marginLeft: theme.spacing.xs,
            padding: theme.spacing.micro
        },
        dialogOverlay: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(22, 18, 15, 0.42)',
            padding: theme.spacing.md
        },
        dialogCard: {
            width: '100%',
            maxWidth: 360,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: theme.spacing.md,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 12 },
            elevation: 18
        },
        dialogIconWrap: {
            width: 56,
            height: 56,
            borderRadius: theme.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            marginBottom: theme.spacing.sm
        },
        dialogTitle: {
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.bold,
            fontSize: 22,
            lineHeight: 28
        },
        dialogMessage: {
            marginTop: theme.spacing.xs,
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.content,
            fontSize: 14,
            lineHeight: 20
        },
        dialogButtons: {
            marginTop: theme.spacing.md,
            flexDirection: 'row',
            gap: theme.spacing.xs
        },
        dialogButton: {
            flex: 1,
            minHeight: 48,
            borderRadius: theme.radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.sm
        },
        dialogButtonPrimary: {
            backgroundColor: theme.colors.accent
        },
        dialogButtonSecondary: {
            backgroundColor: theme.colors.accentSoft
        },
        dialogButtonMuted: {
            backgroundColor: theme.colors.surfaceMuted
        },
        dialogButtonDestructive: {
            backgroundColor: theme.colors.warning
        },
        dialogButtonPressed: {
            opacity: 0.82
        },
        dialogButtonText: {
            fontFamily: theme.fonts.semibold,
            fontSize: 15
        },
        dialogButtonTextInverted: {
            color: theme.colors.surface
        },
        dialogButtonTextDefault: {
            color: theme.colors.textPrimary
        },
        dialogButtonTextMuted: {
            color: theme.colors.textSecondary
        }
    });
}

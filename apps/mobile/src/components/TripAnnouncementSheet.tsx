import React from 'react';
import {
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
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.backdrop}
            >
                <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={onClose}
                    style={StyleSheet.absoluteFill}
                />
                <View
                    style={[
                        styles.sheet,
                        {
                            paddingTop: insets.top + theme.spacing.sm,
                            paddingBottom: insets.bottom + theme.spacing.md
                        }
                    ]}
                >
                    <View style={styles.handle} />
                    <View style={styles.headerRow}>
                        <SheetBackButton disabled={busy} onPress={onClose} />
                        <View style={styles.headerCopy}>
                            <Text style={styles.eyebrow}>참가자 공지</Text>
                            <Text style={styles.title}>참가자에게 공지 보내기</Text>
                            <Text style={styles.description}>
                                {tripTitle || '이 여행'} 참가자에게 바로 알림을 보낼 수 있어요.
                            </Text>
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
                                placeholder="비워 두면 여행 제목으로 발송돼요"
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

                    <View style={styles.footer}>
                        <Pressable
                            accessibilityRole="button"
                            disabled={busy}
                            onPress={onClose}
                            style={({ pressed }) => [
                                styles.secondaryButton,
                                pressed && !busy ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.secondaryButtonText}>닫기</Text>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            disabled={!canSubmit}
                            onPress={() => {
                                if (!canSubmit) {
                                    return;
                                }

                                onSubmit({
                                    title,
                                    body
                                });
                            }}
                            style={({ pressed }) => [
                                styles.primaryButton,
                                !canSubmit ? styles.primaryButtonDisabled : null,
                                pressed && canSubmit ? styles.buttonPressed : null
                            ]}
                            >
                            <Text style={styles.primaryButtonText}>
                                {busy ? '공지 보내는 중...' : '공지 보내기'}
                            </Text>
                        </Pressable>
                    </View>
                </View>
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
    handle: {
        alignSelf: 'center',
        width: 44,
        height: 5,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border,
        marginBottom: theme.spacing.sm
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.xs
    },
    headerCopy: {
        flex: 1
    },
    eyebrow: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold,
        fontSize: 12,
        textTransform: 'uppercase'
    },
    title: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.display,
        fontSize: 26
    },
    description: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body,
        fontSize: 14,
        lineHeight: 21
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
    footer: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        paddingTop: theme.spacing.md
    },
    secondaryButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    secondaryButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold,
        fontSize: 15
    },
    primaryButton: {
        flex: 1.4,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    primaryButtonDisabled: {
        opacity: 0.45
    },
    primaryButtonText: {
        color: '#ffffff',
        fontFamily: theme.fonts.semibold,
        fontSize: 15
    },
    buttonPressed: {
        opacity: 0.8
    }
});

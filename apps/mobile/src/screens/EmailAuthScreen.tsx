import React from 'react';
import {
    KeyboardAvoidingView,
    LayoutAnimation,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    UIManager,
    View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthSession } from '@/hooks/useAuthSession';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { type AppTheme, useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailAuth'>;
type EmailAuthMode = 'signIn' | 'signUp';

const MODE_OPTIONS: ReadonlyArray<{ value: EmailAuthMode; label: string }> = [
    { value: 'signIn', label: '로그인' },
    { value: 'signUp', label: '가입' }
];

const maybeUIManager = UIManager as typeof UIManager & {
    setLayoutAnimationEnabledExperimental?: (enabled: boolean) => void;
};

if (Platform.OS === 'android') {
    maybeUIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export function EmailAuthScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const {
        scrollRef,
        createFocusHandler,
        keyboardAwareContentInsetStyle,
        scrollViewProps
    } = useKeyboardAwareInputScroll(120);
    const {
        user,
        signInWithEmail,
        signUpWithEmail,
        authActionError,
        isAuthActionLoading
    } = useAuthSession();
    const [emailAuthMode, setEmailAuthMode] = React.useState<EmailAuthMode>('signIn');
    const [email, setEmail] = React.useState('');
    const [displayName, setDisplayName] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [passwordConfirm, setPasswordConfirm] = React.useState('');
    const [localError, setLocalError] = React.useState<string | null>(null);

    const contentInsetStyle = React.useMemo(() => ({
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: insets.bottom + theme.spacing.md
    }), [insets.bottom, insets.top, theme.spacing.md, theme.spacing.sm]);
    const screenTitle = emailAuthMode === 'signUp' ? '이메일로 가입' : '이메일로 로그인';
    const helperCopy = emailAuthMode === 'signUp'
        ? '가입 후 메일함에서 인증 링크를 열면 PLIN을 시작해요.'
        : '가입한 이메일과 비밀번호로 PLIN에 들어가요.';

    React.useEffect(() => {
        if (!user) {
            return;
        }

        navigation.replace('AuthGate');
    }, [navigation, user]);

    function clearLocalError() {
        setLocalError(null);
    }

    function handleModeChange(nextMode: EmailAuthMode) {
        if (emailAuthMode === nextMode) {
            return;
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setEmailAuthMode(nextMode);
        clearLocalError();
    }

    async function handleSubmit() {
        const safeEmail = email.trim();
        const safeDisplayName = displayName.trim();
        clearLocalError();

        if (!safeEmail || !password) {
            setLocalError('이메일과 비밀번호를 입력해 주세요.');
            return;
        }

        if (emailAuthMode === 'signUp') {
            if (password.length < 6) {
                setLocalError('비밀번호는 6자 이상으로 입력해 주세요.');
                return;
            }

            if (password !== passwordConfirm) {
                setLocalError('비밀번호 확인이 일치하지 않아요.');
                return;
            }
        }

        try {
            if (emailAuthMode === 'signUp') {
                await signUpWithEmail(safeEmail, password, safeDisplayName);
            } else {
                await signInWithEmail(safeEmail, password);
            }

            navigation.replace('AuthGate');
        } catch {}
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <ScrollView
                ref={scrollRef}
                style={styles.container}
                contentContainerStyle={[
                    styles.content,
                    contentInsetStyle,
                    keyboardAwareContentInsetStyle
                ]}
                {...scrollViewProps}
            >
                <View style={styles.topBar}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="이전 화면으로 돌아가기"
                        disabled={isAuthActionLoading}
                        hitSlop={12}
                        onPress={() => {
                            navigation.goBack();
                        }}
                        style={({ pressed }) => [
                            styles.backButton,
                            pressed && !isAuthActionLoading ? styles.pressed : null
                        ]}
                    >
                        <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
                    </Pressable>
                </View>

                <View style={styles.header}>
                    <Text style={styles.brand}>PLIN</Text>
                    <Text style={styles.title}>{screenTitle}</Text>
                    <Text style={styles.description}>{helperCopy}</Text>
                </View>

                <View style={styles.formBlock}>
                    <View style={styles.modeRow}>
                        {MODE_OPTIONS.map((option) => {
                            const isSelected = emailAuthMode === option.value;
                            return (
                                <Pressable
                                    key={option.value}
                                    accessibilityRole="button"
                                    disabled={isAuthActionLoading}
                                    onPress={() => {
                                        handleModeChange(option.value);
                                    }}
                                    style={({ pressed }) => [
                                        styles.modeButton,
                                        isSelected ? styles.modeButtonSelected : null,
                                        pressed && !isAuthActionLoading ? styles.pressed : null
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.modeButtonText,
                                            isSelected ? styles.modeButtonTextSelected : null
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <TextInput
                        value={email}
                        onChangeText={(nextValue) => {
                            setEmail(nextValue);
                            clearLocalError();
                        }}
                        placeholder="이메일"
                        placeholderTextColor={theme.colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        textContentType="username"
                        returnKeyType="next"
                        editable={!isAuthActionLoading}
                        onFocus={createFocusHandler()}
                        style={styles.input}
                    />

                    {emailAuthMode === 'signUp' ? (
                        <TextInput
                            value={displayName}
                            onChangeText={(nextValue) => {
                                setDisplayName(nextValue);
                                clearLocalError();
                            }}
                            placeholder="이름"
                            placeholderTextColor={theme.colors.textSecondary}
                            autoCapitalize="words"
                            autoCorrect={false}
                            textContentType="name"
                            returnKeyType="next"
                            editable={!isAuthActionLoading}
                            onFocus={createFocusHandler()}
                            style={styles.input}
                        />
                    ) : null}

                    <TextInput
                        value={password}
                        onChangeText={(nextValue) => {
                            setPassword(nextValue);
                            clearLocalError();
                        }}
                        placeholder="비밀번호"
                        placeholderTextColor={theme.colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        textContentType={emailAuthMode === 'signUp' ? 'newPassword' : 'password'}
                        returnKeyType={emailAuthMode === 'signUp' ? 'next' : 'done'}
                        editable={!isAuthActionLoading}
                        onFocus={createFocusHandler()}
                        onSubmitEditing={emailAuthMode === 'signUp' ? undefined : handleSubmit}
                        style={styles.input}
                    />

                    {emailAuthMode === 'signUp' ? (
                        <TextInput
                            value={passwordConfirm}
                            onChangeText={(nextValue) => {
                                setPasswordConfirm(nextValue);
                                clearLocalError();
                            }}
                            placeholder="비밀번호 확인"
                            placeholderTextColor={theme.colors.textSecondary}
                            autoCapitalize="none"
                            autoCorrect={false}
                            secureTextEntry
                            textContentType="newPassword"
                            returnKeyType="done"
                            editable={!isAuthActionLoading}
                            onFocus={createFocusHandler()}
                            onSubmitEditing={handleSubmit}
                            style={styles.input}
                        />
                    ) : null}

                    {localError || authActionError ? (
                        <Text style={styles.errorText}>{localError || authActionError}</Text>
                    ) : null}

                    <Pressable
                        accessibilityRole="button"
                        disabled={isAuthActionLoading}
                        onPress={handleSubmit}
                        style={({ pressed }) => [
                            styles.submitButton,
                            isAuthActionLoading ? styles.submitButtonDisabled : null,
                            pressed && !isAuthActionLoading ? styles.pressed : null
                        ]}
                    >
                        <Text style={styles.submitButtonText}>
                            {isAuthActionLoading
                                ? '확인 중'
                                : emailAuthMode === 'signUp'
                                    ? '이메일로 가입'
                                    : '이메일로 로그인'}
                        </Text>
                    </Pressable>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    content: {
        flexGrow: 1,
        paddingHorizontal: theme.spacing.md
    },
    topBar: {
        minHeight: 44,
        justifyContent: 'center'
    },
    backButton: {
        width: 44,
        height: 44,
        alignItems: 'flex-start',
        justifyContent: 'center'
    },
    header: {
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.lg
    },
    brand: {
        color: theme.colors.accent,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.display
    },
    title: {
        marginTop: theme.spacing.sm,
        color: theme.colors.textPrimary,
        fontSize: 30,
        lineHeight: 36,
        fontFamily: theme.fonts.bold
    },
    description: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 15,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    formBlock: {
        gap: theme.spacing.sm
    },
    modeRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        padding: 4,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    modeButton: {
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.sm
    },
    modeButtonSelected: {
        backgroundColor: theme.colors.accent
    },
    modeButtonText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    modeButtonTextSelected: {
        color: '#FFFFFF'
    },
    input: {
        minHeight: 54,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.sm,
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    errorText: {
        color: theme.colors.warning,
        fontSize: 13,
        lineHeight: 19,
        fontFamily: theme.fonts.semibold
    },
    submitButton: {
        minHeight: 54,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    submitButtonDisabled: {
        opacity: 0.6
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        lineHeight: 22,
        fontFamily: theme.fonts.bold
    },
    pressed: {
        transform: [{ scale: 0.99 }]
    }
});

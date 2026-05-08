import React from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarImage } from '@/components/AvatarImage';
import { BottomNavBar } from '@/components/BottomNavBar';
import { DebugInfoCard } from '@/components/DebugInfoCard';
import { EmptyState } from '@/components/EmptyState';
import { isPrivilegedDebugUser } from '@/dev/debug-access';
import { Alert } from '@/feedback';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import {
    type PickedProfilePhotoAsset,
    pickProfilePhotoAsset,
    uploadProfilePhotoAsset
} from '@/services/profile-photo-upload';
import { usePrimaryScrollActivityReporter } from '@/state/primary-scroll-activity';
import { type AppTheme, type FontPreset, useAppTheme, useThemePreference } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const TERMS_URL = 'https://plin.ink/terms.html';
const PRIVACY_URL = 'https://plin.ink/privacy.html';
const LOCATION_TERMS_URL = 'https://plin.ink/location-terms.html';
const OPERATION_POLICY_URL = 'https://plin.ink/operation-policy.html';
const YOUTH_PROTECTION_POLICY_URL = 'https://plin.ink/youth-protection-policy.html';
const KAKAO_SUPPORT_CHAT_URL = 'http://pf.kakao.com/_duxdTX/chat';
const PROFILE_NAME_MAX_LENGTH = 24;
const FONT_PRESET_OPTIONS: Array<{ value: FontPreset; title: string; description: string }> = [
    {
        value: 'pretendard',
        title: '기본',
        description: 'Pretendard'
    },
    {
        value: 'memoment',
        title: '손글씨',
        description: 'Memoment 꾹꾹체'
    }
];
const SUPPORT_POLICY_LINKS: ReadonlyArray<{
    label: string;
    url: string;
    icon: keyof typeof Ionicons.glyphMap;
}> = [
    {
        label: '카카오톡 문의',
        url: KAKAO_SUPPORT_CHAT_URL,
        icon: 'chatbubble-ellipses-outline'
    },
    {
        label: '이용약관',
        url: TERMS_URL,
        icon: 'document-text-outline'
    },
    {
        label: '위치기반서비스 약관',
        url: LOCATION_TERMS_URL,
        icon: 'location-outline'
    },
    {
        label: '운영정책',
        url: OPERATION_POLICY_URL,
        icon: 'shield-checkmark-outline'
    },
    {
        label: '청소년보호정책',
        url: YOUTH_PROTECTION_POLICY_URL,
        icon: 'heart-outline'
    },
    {
        label: '개인정보처리방침',
        url: PRIVACY_URL,
        icon: 'lock-closed-outline'
    }
];

function buildFallbackSummary(user: ReturnType<typeof useAuthSession>['user']) {
    if (!user) {
        return null;
    }

    return {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL || null,
        role: 'user' as const,
        agreedToTerms: null,
        agreedToPrivacy: null,
        agreedAt: null,
        accountStatus: 'active' as const,
        deletionRequestedAt: null,
        purgeAfter: null,
        blockedUserIds: [],
        source: 'auth' as const
    };
}

function getProfilePrimaryLabel(summary: { displayName: string | null; email: string | null }) {
    const displayName = summary.displayName?.trim() || '';
    if (displayName) {
        return displayName;
    }

    const email = summary.email?.trim() || '';
    if (email.includes('@')) {
        return email.split('@')[0];
    }

    return email || 'PLIN 여행자';
}

function getEditableProfileName(summary: { displayName: string | null; email: string | null }) {
    const displayName = summary.displayName?.trim() || '';
    if (displayName) {
        return displayName;
    }

    return getProfilePrimaryLabel(summary);
}

export function SettingsScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const {
        scrollRef: profileEditorScrollRef,
        createFocusHandler: createProfileEditorFocusHandler,
        keyboardAwareContentInsetStyle: profileEditorKeyboardInsetStyle,
        scrollViewProps: profileEditorScrollViewProps
    } = useKeyboardAwareInputScroll(112);
    const {
        user,
        profileSummary,
        refreshSession,
        authActionError,
        isAuthActionLoading,
        updateProfilePhoto,
        updateProfileDisplayName
    } = useAuthSession();
    const {
        isDarkModeEnabled,
        fontPreset,
        isThemePreferenceLoading,
        setDarkModeEnabled,
        setFontPreset
    } = useThemePreference();
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isProfileEditorVisible, setIsProfileEditorVisible] = React.useState(false);
    const [draftDisplayName, setDraftDisplayName] = React.useState('');
    const [draftPhotoPreviewUri, setDraftPhotoPreviewUri] = React.useState<string | null>(null);
    const [pendingPhotoAsset, setPendingPhotoAsset] = React.useState<PickedProfilePhotoAsset | null>(null);
    const [isProfileEditorSaving, setIsProfileEditorSaving] = React.useState(false);
    const [isFontPresetModalVisible, setIsFontPresetModalVisible] = React.useState(false);
    const [isSupportPolicyOpen, setIsSupportPolicyOpen] = React.useState(false);
    const { notifyPrimaryScrollActivity, scrollEventThrottle } = usePrimaryScrollActivityReporter();

    const summary = profileSummary || buildFallbackSummary(user);
    const canAccessDiagnostics = __DEV__ && isPrivilegedDebugUser(profileSummary, user);
    const isPendingDeletion = summary?.accountStatus === 'pending_deletion';
    const profilePrimaryLabel = getProfilePrimaryLabel(summary ?? { displayName: null, email: null });
    const editableProfileName = getEditableProfileName(summary ?? { displayName: null, email: null });
    const trimmedDraftDisplayName = draftDisplayName.trim();
    const hasDraftDisplayName = trimmedDraftDisplayName.length > 0;
    const hasProfileChanges = Boolean(pendingPhotoAsset)
        || trimmedDraftDisplayName !== editableProfileName;
    const isProfileEditorBusy = isProfileEditorSaving || isAuthActionLoading;
    const activeFontPresetOption = React.useMemo(
        () => FONT_PRESET_OPTIONS.find((option) => option.value === fontPreset) || FONT_PRESET_OPTIONS[0],
        [fontPreset]
    );

    const handleRefresh = React.useCallback(async () => {
        setIsRefreshing(true);
        try {
            await refreshSession();
        } finally {
            setIsRefreshing(false);
        }
    }, [refreshSession]);

    const handleToggleDarkMode = React.useCallback(async (nextValue: boolean) => {
        await setDarkModeEnabled(nextValue);
    }, [setDarkModeEnabled]);

    const handleSelectFontPreset = React.useCallback(async (nextValue: FontPreset) => {
        setIsFontPresetModalVisible(false);
        await setFontPreset(nextValue);
    }, [setFontPreset]);

    const openFontPresetModal = React.useCallback(() => {
        setIsFontPresetModalVisible(true);
    }, []);

    const closeFontPresetModal = React.useCallback(() => {
        setIsFontPresetModalVisible(false);
    }, []);

    const handleOpenExternalLink = React.useCallback((url: string, title?: string) => {
        navigation.navigate('InAppBrowser', { url, title });
    }, [navigation]);

    const openProfileEditor = React.useCallback(() => {
        setDraftDisplayName(editableProfileName);
        setDraftPhotoPreviewUri(summary?.photoURL || null);
        setPendingPhotoAsset(null);
        setIsProfileEditorVisible(true);
    }, [editableProfileName, summary?.photoURL]);

    const closeProfileEditor = React.useCallback(() => {
        if (isProfileEditorBusy) {
            return;
        }

        setIsProfileEditorVisible(false);
    }, [isProfileEditorBusy]);

    const handlePickProfilePhoto = React.useCallback(async () => {
        try {
            const asset = await pickProfilePhotoAsset();
            if (!asset) {
                return;
            }

            setPendingPhotoAsset(asset);
            setDraftPhotoPreviewUri(asset.uri);
        } catch (error) {
            const message = error instanceof Error && error.message
                ? error.message
                : '프로필 사진을 고르지 못했어요.';
            Alert.alert('프로필 사진 선택 실패', message);
        }
    }, []);

    const handleSaveProfile = React.useCallback(async () => {
        if (!user) {
            return;
        }
        if (!hasDraftDisplayName) {
            Alert.alert('이름을 확인해 주세요.', '프로필 이름은 비워 둘 수 없어요.');
            return;
        }
        if (!hasProfileChanges) {
            setIsProfileEditorVisible(false);
            return;
        }

        setIsProfileEditorSaving(true);
        try {
            if (pendingPhotoAsset) {
                const uploadedUrl = await uploadProfilePhotoAsset({
                    uid: user.uid,
                    asset: pendingPhotoAsset
                });
                await updateProfilePhoto(uploadedUrl);
                setPendingPhotoAsset(null);
                setDraftPhotoPreviewUri(uploadedUrl);
            }

            if (trimmedDraftDisplayName !== editableProfileName) {
                await updateProfileDisplayName(trimmedDraftDisplayName);
            }

            setIsProfileEditorVisible(false);
        } catch (error) {
            const message = error instanceof Error && error.message
                ? error.message
                : '프로필 정보를 저장하지 못했어요.';
            Alert.alert('프로필 저장 실패', message);
        } finally {
            setIsProfileEditorSaving(false);
        }
    }, [
        editableProfileName,
        hasDraftDisplayName,
        hasProfileChanges,
        pendingPhotoAsset,
        trimmedDraftDisplayName,
        updateProfileDisplayName,
        updateProfilePhoto,
        user
    ]);

    if (!user || !summary) {
        return (
            <View style={styles.shell}>
                <SafeAreaView edges={['top']} style={styles.screenBody}>
                    <View style={styles.stateContent}>
                        <EmptyState
                            title="세션을 다시 확인해 주세요."
                            description="설정 화면을 열기 전에 로그인 상태를 다시 확인해야 해요."
                            actionLabel="세션 다시 확인"
                            onAction={() => {
                                void handleRefresh();
                            }}
                        />
                    </View>
                </SafeAreaView>
                <BottomNavBar activeTab="Settings" />
            </View>
        );
    }

    return (
        <View style={styles.shell}>
            <SafeAreaView edges={['top']} style={styles.screenBody}>
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={styles.content}
                    onScroll={notifyPrimaryScrollActivity}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={() => {
                                void handleRefresh();
                            }}
                            tintColor={theme.colors.accent}
                            colors={[theme.colors.accent]}
                        />
                    }
                    scrollEventThrottle={scrollEventThrottle}
                >
                    <Pressable
                        accessibilityRole="button"
                        onPress={openProfileEditor}
                        style={({ pressed }) => [
                            styles.profileCard,
                            pressed ? styles.actionPressed : null
                        ]}
                    >
                        <View style={styles.profileIdentityRow}>
                            <View style={styles.profileAvatarFrame}>
                                <AvatarImage
                                    uri={summary.photoURL}
                                    label={profilePrimaryLabel}
                                    size={56}
                                    textSize={22}
                                    tone={isPendingDeletion ? 'warning' : 'accent'}
                                />
                            </View>
                            <View style={styles.profileCopy}>
                                <Text style={styles.profileName}>{profilePrimaryLabel}</Text>
                                <Text style={styles.profileDescription}>
                                    프로필 사진과 이름을 바꿀 수 있어요.
                                </Text>
                            </View>
                            <View style={styles.rowTrailing}>
                                {isPendingDeletion ? (
                                    <View style={styles.warningBadge}>
                                        <Text style={styles.warningBadgeText}>삭제 처리 중</Text>
                                    </View>
                                ) : null}
                                <Ionicons
                                    name="chevron-forward"
                                    size={20}
                                    color={theme.colors.textSecondary}
                                />
                            </View>
                        </View>
                    </Pressable>

                    {authActionError ? (
                        <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                            <Text style={[styles.noticeText, styles.noticeTextWarning]}>
                                {authActionError}
                            </Text>
                        </View>
                    ) : null}

                    {isPendingDeletion ? (
                        <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                            <Text style={styles.noticeTitle}>계정 삭제 진행 중</Text>
                            <Text style={[styles.noticeText, styles.noticeTextWarning]}>
                                계정과 업로드한 데이터 삭제를 처리하고 있어요.
                            </Text>
                        </View>
                    ) : null}

                    <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>설정</Text>
                        <View style={styles.groupCard}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => navigation.navigate('SettingsAccount')}
                                style={({ pressed }) => [
                                    styles.menuRow,
                                    pressed ? styles.actionPressed : null
                                ]}
                            >
                                <View style={styles.rowCopy}>
                                    <Text style={styles.rowTitle}>설정</Text>
                                    <Text style={styles.rowDescription}>
                                        로그인 수단, 로그아웃, 계정 삭제를 관리해요.
                                    </Text>
                                </View>
                                <Ionicons
                                    name="chevron-forward"
                                    size={20}
                                    color={theme.colors.textSecondary}
                                />
                            </Pressable>
                        </View>
                    </View>

                    <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>개인 설정</Text>
                        <View style={styles.groupCard}>
                            <View style={styles.settingRow}>
                                <View style={styles.rowCopy}>
                                    <Text style={styles.rowTitle}>다크 모드</Text>
                                    <Text style={styles.rowDescription}>
                                        이 기기에서 사용할 테마를 저장해 둬요.
                                    </Text>
                                </View>
                                <Switch
                                    value={isDarkModeEnabled}
                                    disabled={isThemePreferenceLoading}
                                    onValueChange={(nextValue) => {
                                        void handleToggleDarkMode(nextValue);
                                    }}
                                    trackColor={{
                                        false: theme.mode === 'dark' ? '#4b3f34' : '#d8c9b3',
                                        true: theme.colors.accent
                                    }}
                                    thumbColor={theme.mode === 'dark' ? '#f5ede2' : '#fffdf9'}
                                    ios_backgroundColor={theme.mode === 'dark' ? '#4b3f34' : '#d8c9b3'}
                                />
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isThemePreferenceLoading}
                                onPress={openFontPresetModal}
                                style={({ pressed }) => [
                                    styles.menuRow,
                                    styles.menuRowDivider,
                                    isThemePreferenceLoading ? styles.actionDisabled : null,
                                    pressed && !isThemePreferenceLoading ? styles.actionPressed : null
                                ]}
                            >
                                <View style={styles.rowCopy}>
                                    <Text style={styles.rowTitle}>폰트 스타일</Text>
                                    <Text style={styles.rowDescription}>
                                        이 기기에서 사용할 글꼴 분위기를 저장해 둬요.
                                    </Text>
                                </View>
                                <View style={styles.rowTrailing}>
                                    <Text style={styles.rowValue}>{activeFontPresetOption.title}</Text>
                                    <Ionicons
                                        name="chevron-forward"
                                        size={20}
                                        color={theme.colors.textSecondary}
                                    />
                                </View>
                            </Pressable>
                        </View>
                    </View>

                    <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>지원</Text>
                        <View style={styles.groupCard}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ expanded: isSupportPolicyOpen }}
                                onPress={() => {
                                    setIsSupportPolicyOpen((currentValue) => !currentValue);
                                }}
                                style={({ pressed }) => [
                                    styles.menuRow,
                                    pressed ? styles.actionPressed : null
                                ]}
                            >
                                <View style={styles.rowCopy}>
                                    <Text style={styles.rowTitle}>문의/운영정책</Text>
                                    <Text style={styles.rowDescription}>
                                        문의와 약관을 한곳에서 확인해요.
                                    </Text>
                                </View>
                                <Ionicons
                                    name={isSupportPolicyOpen ? 'chevron-up' : 'chevron-down'}
                                    size={20}
                                    color={theme.colors.textSecondary}
                                />
                            </Pressable>
                            {isSupportPolicyOpen ? (
                                <View style={styles.supportPolicyPanel}>
                                    {SUPPORT_POLICY_LINKS.map((item) => {
                                        const isSupportLink = item.url === KAKAO_SUPPORT_CHAT_URL;

                                        return (
                                            <Pressable
                                                key={item.label}
                                                accessibilityRole="link"
                                                onPress={() => {
                                                    handleOpenExternalLink(item.url, item.label);
                                                }}
                                                style={({ pressed }) => [
                                                    styles.supportPolicyLink,
                                                    pressed ? styles.actionPressed : null
                                                ]}
                                            >
                                                <Ionicons
                                                    name={item.icon}
                                                    size={18}
                                                    color={isSupportLink
                                                        ? theme.colors.accent
                                                        : theme.colors.textSecondary}
                                                />
                                                <Text style={[
                                                    styles.supportPolicyLinkText,
                                                    isSupportLink ? styles.supportPolicyLinkTextPrimary : null
                                                ]}>
                                                    {item.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            ) : null}
                        </View>
                    </View>

                    {canAccessDiagnostics ? (
                        <View style={styles.sectionBlock}>
                            <Text style={styles.sectionLabel}>기타</Text>
                            <View style={styles.groupCard}>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => navigation.navigate('EmojiDiagnostics')}
                                    style={({ pressed }) => [
                                        styles.menuRow,
                                        pressed ? styles.actionPressed : null
                                    ]}
                                >
                                    <View style={styles.rowCopy}>
                                        <Text style={styles.rowTitle}>Emoji Diagnostics</Text>
                                        <Text style={styles.rowDescription}>
                                            개발용 진단 화면을 열어요.
                                        </Text>
                                    </View>
                                    <Ionicons
                                        name="chevron-forward"
                                        size={20}
                                        color={theme.colors.textSecondary}
                                    />
                                </Pressable>
                            </View>
                        </View>
                    ) : null}

                    <DebugInfoCard screen="Settings" dataState="ready" />
                </ScrollView>
            </SafeAreaView>
            <Modal
                animationType="slide"
                transparent
                visible={isProfileEditorVisible}
                onRequestClose={closeProfileEditor}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.profileSheetBackdrop}
                >
                    <Pressable
                        accessibilityRole="button"
                        disabled={isProfileEditorBusy}
                        onPress={closeProfileEditor}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.profileSheet, { paddingBottom: insets.bottom + theme.spacing.md }]}>
                        <View style={styles.profileSheetHandle} />
                        <Text style={styles.profileSheetEyebrow}>프로필</Text>
                        <Text style={styles.profileSheetTitle}>프로필 설정</Text>
                        <Text style={styles.profileSheetDescription}>
                            프로필 사진과 이름을 이 기기에서 바로 바꿀 수 있어요.
                        </Text>

                        <ScrollView
                            ref={profileEditorScrollRef}
                            contentContainerStyle={[styles.profileSheetContent, profileEditorKeyboardInsetStyle]}
                            showsVerticalScrollIndicator={false}
                            {...profileEditorScrollViewProps}
                        >
                            <View style={styles.profileSheetAvatarBlock}>
                                <View style={styles.profileSheetAvatarWrap}>
                                    <AvatarImage
                                        uri={draftPhotoPreviewUri}
                                        label={trimmedDraftDisplayName || profilePrimaryLabel}
                                        size={88}
                                        textSize={30}
                                        tone={isPendingDeletion ? 'warning' : 'accent'}
                                    />
                                </View>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isProfileEditorBusy}
                                    onPress={() => {
                                        void handlePickProfilePhoto();
                                    }}
                                    style={({ pressed }) => [
                                        styles.profilePhotoButton,
                                        isProfileEditorBusy ? styles.actionDisabled : null,
                                        pressed && !isProfileEditorBusy ? styles.actionPressed : null
                                    ]}
                                >
                                    <Ionicons name="image-outline" size={16} color={theme.colors.accent} />
                                    <Text style={styles.profilePhotoButtonText}>사진 바꾸기</Text>
                                </Pressable>
                            </View>

                            <View style={styles.profileFieldBlock}>
                                <View style={styles.profileFieldHeader}>
                                    <Text style={styles.profileFieldLabel}>이름</Text>
                                    <Text style={styles.profileFieldCounter}>
                                        {draftDisplayName.length}/{PROFILE_NAME_MAX_LENGTH}
                                    </Text>
                                </View>
                                <TextInput
                                    editable={!isProfileEditorBusy}
                                    maxLength={PROFILE_NAME_MAX_LENGTH}
                                    onChangeText={setDraftDisplayName}
                                    onFocus={createProfileEditorFocusHandler()}
                                    placeholder="프로필 이름을 입력해 주세요"
                                    placeholderTextColor={theme.colors.textSecondary}
                                    style={styles.profileNameInput}
                                    value={draftDisplayName}
                                />
                                <Text style={styles.profileFieldHint}>
                                    여행 공유와 기록에 보일 이름이에요.
                                </Text>
                            </View>
                        </ScrollView>

                        <View style={styles.profileSheetFooter}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isProfileEditorBusy}
                                onPress={closeProfileEditor}
                                style={({ pressed }) => [
                                    styles.profileSecondaryButton,
                                    pressed && !isProfileEditorBusy ? styles.actionPressed : null
                                ]}
                            >
                                <Text style={styles.profileSecondaryButtonText}>닫기</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isProfileEditorBusy || !hasDraftDisplayName || !hasProfileChanges}
                                onPress={() => {
                                    void handleSaveProfile();
                                }}
                                style={({ pressed }) => [
                                    styles.profilePrimaryButton,
                                    isProfileEditorBusy || !hasDraftDisplayName || !hasProfileChanges
                                        ? styles.actionDisabled
                                        : null,
                                    pressed && !isProfileEditorBusy && hasDraftDisplayName && hasProfileChanges
                                        ? styles.actionPressed
                                        : null
                                ]}
                            >
                                <Text style={styles.profilePrimaryButtonText}>
                                    {isProfileEditorBusy ? '저장 중...' : '저장'}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            <Modal
                animationType="slide"
                transparent
                visible={isFontPresetModalVisible}
                onRequestClose={closeFontPresetModal}
            >
                <View style={styles.profileSheetBackdrop}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={closeFontPresetModal}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.profileSheet, { paddingBottom: insets.bottom + theme.spacing.md }]}>
                        <View style={styles.profileSheetHandle} />
                        <Text style={styles.profileSheetEyebrow}>개인 설정</Text>
                        <Text style={styles.profileSheetTitle}>폰트 스타일</Text>
                        <Text style={styles.profileSheetDescription}>
                            이 기기에서 사용할 글꼴 분위기를 저장해 둬요.
                        </Text>

                        <View style={styles.fontPresetModalOptionList}>
                            {FONT_PRESET_OPTIONS.map((option) => {
                                const isSelected = fontPreset === option.value;
                                return (
                                    <Pressable
                                        key={option.value}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${option.title} 폰트 사용`}
                                        disabled={isThemePreferenceLoading}
                                        onPress={() => {
                                            void handleSelectFontPreset(option.value);
                                        }}
                                        style={({ pressed }) => [
                                            styles.fontPresetModalOption,
                                            isSelected ? styles.fontPresetModalOptionSelected : null,
                                            isThemePreferenceLoading ? styles.actionDisabled : null,
                                            pressed && !isThemePreferenceLoading ? styles.actionPressed : null
                                        ]}
                                    >
                                        <View style={styles.rowCopy}>
                                            <Text style={styles.fontPresetModalOptionTitle}>{option.title}</Text>
                                            <Text style={styles.fontPresetModalOptionDescription}>{option.description}</Text>
                                        </View>
                                        <Ionicons
                                            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                                            size={20}
                                            color={isSelected ? theme.colors.accent : theme.colors.textSecondary}
                                        />
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View style={styles.profileSheetFooter}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={closeFontPresetModal}
                                style={({ pressed }) => [
                                    styles.profileSecondaryButton,
                                    pressed ? styles.actionPressed : null
                                ]}
                            >
                                <Text style={styles.profileSecondaryButtonText}>닫기</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
            <BottomNavBar activeTab="Settings" />
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    shell: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    screenBody: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    container: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    content: {
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.md
    },
    stateContent: {
        flex: 1,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.md
    },
    profileCard: {
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    profileIdentityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm
    },
    profileAvatarFrame: {
        padding: theme.spacing.micro,
        borderRadius: theme.radius.full,
        backgroundColor: theme.mode === 'dark' ? '#2b241e' : '#f4ecdf'
    },
    profileCopy: {
        flex: 1
    },
    profileName: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        lineHeight: 26,
        fontFamily: theme.fonts.bold
    },
    profileDescription: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    noticeCard: {
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md
    },
    noticeCardWarning: {
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    noticeTitle: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.bold
    },
    noticeText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    noticeTextWarning: {
        color: theme.colors.warning
    },
    sectionBlock: {
        marginBottom: theme.spacing.sm
    },
    sectionLabel: {
        marginBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    groupCard: {
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden'
    },
    menuRow: {
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm
    },
    menuRowDivider: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border
    },
    settingRow: {
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm
    },
    rowCopy: {
        flex: 1
    },
    rowTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    rowDescription: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    rowValue: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    rowTrailing: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    supportPolicyPanel: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    supportPolicyLink: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs
    },
    supportPolicyLinkText: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        lineHeight: 18,
        fontFamily: theme.fonts.semibold
    },
    supportPolicyLinkTextPrimary: {
        color: theme.colors.accent
    },
    fontPresetModalOptionList: {
        marginTop: theme.spacing.md,
        gap: theme.spacing.xs
    },
    fontPresetModalOption: {
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    fontPresetModalOptionSelected: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    fontPresetModalOptionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    fontPresetModalOptionDescription: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    warningBadge: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.mode === 'dark' ? '#40231e' : '#fff0e8'
    },
    warningBadgeText: {
        color: theme.colors.warning,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    profileSheetBackdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(24, 18, 12, 0.32)'
    },
    profileSheet: {
        maxHeight: '84%',
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm
    },
    profileSheetHandle: {
        alignSelf: 'center',
        width: 48,
        height: 4,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border,
        marginBottom: theme.spacing.sm
    },
    profileSheetEyebrow: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    profileSheetTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 26,
        fontFamily: theme.fonts.display
    },
    profileSheetDescription: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    profileSheetContent: {
        paddingTop: theme.spacing.md,
        gap: theme.spacing.md
    },
    profileSheetAvatarBlock: {
        alignItems: 'center',
        gap: theme.spacing.sm
    },
    profileSheetAvatarWrap: {
        padding: theme.spacing.micro,
        borderRadius: theme.radius.full,
        backgroundColor: theme.mode === 'dark' ? '#2b241e' : '#f4ecdf'
    },
    profilePhotoButton: {
        minHeight: 40,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    profilePhotoButtonText: {
        color: theme.colors.accent,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    profileFieldBlock: {
        gap: theme.spacing.xs
    },
    profileFieldHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm
    },
    profileFieldLabel: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    profileFieldCounter: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    profileNameInput: {
        minHeight: 48,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    profileFieldHint: {
        color: theme.colors.textSecondary,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    profileSheetFooter: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
        paddingTop: theme.spacing.md
    },
    profileSecondaryButton: {
        flex: 1,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    profileSecondaryButtonText: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    profilePrimaryButton: {
        flex: 1,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    profilePrimaryButtonText: {
        color: theme.mode === 'dark' ? '#16120f' : '#fffaf2',
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    actionPressed: {
        opacity: 0.88
    },
    actionDisabled: {
        opacity: 0.5
    }
});

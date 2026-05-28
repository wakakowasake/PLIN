import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StackActions, useNavigation, useNavigationState } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { OfflineModeToast } from '@/components/OfflineModeToast';
import type {
    RootStackParamList,
    RootTabKey
} from '@/navigation/RootNavigator';
import { useConnectivityStatus } from '@/state/connectivity-store';
import { usePrimaryScrollActivity } from '@/state/primary-scroll-activity';
import { type AppTheme, useAppTheme } from '@/theme';

type Props = {
    activeTab: RootTabKey;
};

const NAV_BAR_HEIGHT = 40;
const MIN_ANDROID_SYSTEM_NAV_INSET = 24;

const TAB_ITEMS: Array<{
    key: RootTabKey;
    label: string;
    inactiveIcon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    activeIcon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}> = [
    { key: 'Home', label: '홈', inactiveIcon: 'home-outline', activeIcon: 'home' },
    { key: 'TripList', label: '내 일정', inactiveIcon: 'bag-suitcase-outline', activeIcon: 'bag-suitcase' },
    { key: 'Community', label: '플랜', inactiveIcon: 'compass', activeIcon: 'compass' },
    { key: 'Settings', label: '설정', inactiveIcon: 'cog-outline', activeIcon: 'cog' }
];

export function BottomNavBar({ activeTab }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { isOfflineMode } = useConnectivityStatus();
    const isPrimaryScrollActive = usePrimaryScrollActivity();
    const [isIosKeyboardVisible, setIsIosKeyboardVisible] = React.useState(false);

    React.useEffect(() => {
        if (Platform.OS !== 'ios') {
            return undefined;
        }

        const showSubscription = Keyboard.addListener('keyboardWillShow', () => {
            setIsIosKeyboardVisible(true);
        });
        const hideSubscription = Keyboard.addListener('keyboardWillHide', () => {
            setIsIosKeyboardVisible(false);
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    const bottomInset = Platform.OS === 'android'
        ? Math.max(insets.bottom, MIN_ANDROID_SYSTEM_NAV_INSET)
        : isIosKeyboardVisible
            ? 0
            : insets.bottom;
    const wrapInsetStyle = React.useMemo(() => ({
        paddingBottom: isIosKeyboardVisible ? 0 : bottomInset + theme.spacing.micro
    }), [bottomInset, isIosKeyboardVisible, theme.spacing.micro]);
    const toastInsetStyle = React.useMemo(() => ({
        bottom: bottomInset + theme.spacing.micro + NAV_BAR_HEIGHT + theme.spacing.xs
    }), [bottomInset, theme.spacing.micro, theme.spacing.xs]);
    const navigation = useNavigation();
    const currentRouteName = useNavigationState((state) => state.routes[state.index]?.name);

    return (
        <View style={styles.host}>
            {isOfflineMode ? (
                <View pointerEvents="box-none" style={[styles.toastOverlay, toastInsetStyle]}>
                    <OfflineModeToast
                        visible={!isPrimaryScrollActive}
                        message="오프라인 모드예요. 저장된 내용을 보여드리고 있어요."
                    />
                </View>
            ) : null}
            <View style={[styles.wrap, wrapInsetStyle]}>
                <View style={styles.bar}>
                    {TAB_ITEMS.map((item) => {
                        const isActive = item.key === activeTab;
                        const isCurrentRootScreen = currentRouteName === item.key;
                        const tintColor = isActive ? theme.colors.accent : theme.colors.textSecondary;

                        return (
                            <Pressable
                                key={item.key}
                                accessibilityRole="button"
                                accessibilityLabel={item.label}
                                onPress={() => {
                                    if (isActive && isCurrentRootScreen) {
                                        return;
                                    }

                                    navigation.dispatch(
                                        StackActions.replace(item.key as keyof RootStackParamList)
                                    );
                                }}
                                style={({ pressed }) => [
                                    styles.tabButton,
                                    pressed && !(isActive && isCurrentRootScreen) ? styles.tabButtonPressed : null
                                ]}
                            >
                                <MaterialCommunityIcons
                                    name={isActive ? item.activeIcon : item.inactiveIcon}
                                    size={20}
                                    color={tintColor}
                                />
                                <Text
                                    numberOfLines={1}
                                    style={[
                                        styles.tabLabel,
                                        isActive ? styles.tabLabelActive : null
                                    ]}
                                >
                                    {item.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    host: {
        position: 'relative',
        overflow: 'visible'
    },
    wrap: {
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.micro,
        backgroundColor: theme.colors.background,
        borderTopWidth: 1,
        borderTopColor: theme.mode === 'dark' ? 'rgba(62, 65, 69, 0.5)' : 'rgba(220, 222, 227, 0.55)'
    },
    toastOverlay: {
        position: 'absolute',
        left: theme.spacing.sm,
        right: theme.spacing.sm,
        zIndex: 10,
        elevation: 10
    },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    tabButton: {
        flex: 1,
        minHeight: NAV_BAR_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        gap: theme.spacing.micro
    },
    tabButtonPressed: {
        opacity: 0.82
    },
    tabLabel: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        lineHeight: 14,
        fontFamily: theme.fonts.medium
    },
    tabLabelActive: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold
    }
});

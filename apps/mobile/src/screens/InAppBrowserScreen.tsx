import React from 'react';
import {
    ActivityIndicator,
    Linking,
    Pressable,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import type { RootStackParamList } from '@/navigation/RootNavigator';
import { type AppTheme, useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'InAppBrowser'>;

function normalizeBrowserUrl(url: string) {
    const trimmedUrl = url.trim();

    if (trimmedUrl.startsWith('http://pf.kakao.com/')) {
        return trimmedUrl.replace('http://', 'https://');
    }

    return trimmedUrl;
}

export function InAppBrowserScreen({ navigation, route }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const title = route.params.title?.trim() || '문서 보기';
    const url = React.useMemo(() => normalizeBrowserUrl(route.params.url), [route.params.url]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [reloadKey, setReloadKey] = React.useState(0);

    const handleRetry = React.useCallback(() => {
        setError(null);
        setIsLoading(true);
        setReloadKey((currentValue) => currentValue + 1);
    }, []);

    const handleOpenExternally = React.useCallback(async () => {
        await Linking.openURL(url);
    }, [url]);

    return (
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <Pressable
                    accessibilityLabel="문서 닫기"
                    accessibilityRole="button"
                    hitSlop={12}
                    onPress={() => navigation.goBack()}
                    style={({ pressed }) => [
                        styles.headerButton,
                        pressed ? styles.pressed : null
                    ]}
                >
                    <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
                </Pressable>
                <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
                <View style={styles.headerButtonPlaceholder} />
            </View>

            {isLoading ? (
                <View style={styles.loadingBar}>
                    <ActivityIndicator size="small" color={theme.colors.accent} />
                    <Text style={styles.loadingText}>문서를 여는 중이에요</Text>
                </View>
            ) : null}

            {error ? (
                <View style={styles.errorCard}>
                    <Text style={styles.errorText}>{error}</Text>
                    <View style={styles.errorActionRow}>
                        <Pressable
                            accessibilityRole="button"
                            onPress={handleRetry}
                            style={({ pressed }) => [
                                styles.inlineButton,
                                styles.inlineButtonPrimary,
                                pressed ? styles.pressed : null
                            ]}
                        >
                            <Text style={styles.inlineButtonPrimaryText}>다시 시도</Text>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            onPress={handleOpenExternally}
                            style={({ pressed }) => [
                                styles.inlineButton,
                                pressed ? styles.pressed : null
                            ]}
                        >
                            <Text style={styles.inlineButtonText}>브라우저로 열기</Text>
                        </Pressable>
                    </View>
                </View>
            ) : null}

            <WebView
                key={reloadKey}
                source={{ uri: url }}
                style={styles.webView}
                originWhitelist={['http://*', 'https://*']}
                startInLoadingState
                onLoadStart={() => {
                    setError(null);
                    setIsLoading(true);
                }}
                onLoadEnd={() => {
                    setIsLoading(false);
                }}
                onError={() => {
                    setIsLoading(false);
                    setError('앱 안에서 문서를 불러오지 못했어요.');
                }}
                onHttpError={(event) => {
                    setIsLoading(false);
                    setError(`문서를 불러오지 못했어요. (${event.nativeEvent.statusCode})`);
                }}
            />
        </SafeAreaView>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    header: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    headerButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.sm
    },
    headerButtonPlaceholder: {
        width: 40,
        height: 40
    },
    headerTitle: {
        flex: 1,
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 22,
        textAlign: 'center',
        fontFamily: theme.fonts.semibold
    },
    loadingBar: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface
    },
    loadingText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.medium
    },
    errorCard: {
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.warningSoft
    },
    errorText: {
        color: theme.colors.warning,
        lineHeight: 20,
        fontFamily: theme.fonts.medium
    },
    errorActionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.xs
    },
    inlineButton: {
        minHeight: 36,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface
    },
    inlineButtonPrimary: {
        backgroundColor: theme.colors.accent
    },
    inlineButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    inlineButtonPrimaryText: {
        color: '#FFFFFF',
        fontFamily: theme.fonts.semibold
    },
    webView: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    pressed: {
        opacity: 0.78
    }
});

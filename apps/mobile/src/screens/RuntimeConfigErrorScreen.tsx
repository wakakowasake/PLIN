import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { type AppTheme, useAppTheme } from '@/theme';

type Props = {
    title: string;
    description: string;
    supportText?: string | null;
};

export function RuntimeConfigErrorScreen({ title, description, supportText }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
            <View style={styles.content}>
                <View style={styles.brandBlock}>
                    <Text style={styles.brand}>PLIN</Text>
                    <Text style={styles.subtitle}>운영 설정 확인이 필요해요.</Text>
                </View>

                <EmptyState
                    title={title}
                    description={description}
                    supportText={supportText || undefined}
                    tone="warning"
                />
            </View>
        </SafeAreaView>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.md,
        paddingBottom: theme.spacing.lg
    },
    brandBlock: {
        marginBottom: theme.spacing.md,
        alignItems: 'center'
    },
    brand: {
        color: theme.colors.textPrimary,
        fontSize: 42,
        lineHeight: 46,
        fontFamily: theme.fonts.display
    },
    subtitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.medium
    }
});

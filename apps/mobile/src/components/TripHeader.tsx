import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmojiText } from '@/components/EmojiText';
import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileTripDetail } from '@/types/trip';

type Props = {
    trip: MobileTripDetail;
    variant?: 'card' | 'hero';
};

export function TripHeader({ trip, variant = 'card' }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const isHero = variant === 'hero';
    const normalizedLocationLabel = String(trip.locationLabel || '').trim();
    const subInfoPrefix = String(trip.subInfo || '')
        .split('•')[0]
        .trim();
    const shouldShowLocationMeta = Boolean(normalizedLocationLabel)
        && normalizedLocationLabel !== subInfoPrefix;

    return (
        <View style={[styles.container, isHero ? styles.containerHero : null]}>
            <View style={[styles.badge, isHero ? styles.badgeHero : null]}>
                <Text style={[styles.badgeText, isHero ? styles.badgeTextHero : null]}>
                    {trip.status === 'completed' ? '일정 기록' : '일정 계획'}
                </Text>
            </View>
            <EmojiText style={[styles.title, isHero ? styles.titleHero : null]}>{trip.title}</EmojiText>
            <EmojiText style={[styles.subInfo, isHero ? styles.subInfoHero : null]}>
                {trip.subInfo || '일정 정보 준비 중'}
            </EmojiText>
            <View style={styles.metaRow}>
                <Text style={[styles.metaText, isHero ? styles.metaTextHero : null]}>{trip.dayCount}</Text>
                {shouldShowLocationMeta ? (
                    <EmojiText style={[styles.metaText, isHero ? styles.metaTextHero : null]}>
                        {normalizedLocationLabel}
                    </EmojiText>
                ) : null}
            </View>
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.md
    },
    containerHero: {
        marginBottom: 0,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.sm,
        borderWidth: 0,
        backgroundColor: 'transparent'
    },
    badge: {
        alignSelf: 'flex-start',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
    },
    badgeHero: {
        backgroundColor: 'rgba(18, 24, 32, 0.42)'
    },
    badgeText: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold,
        fontSize: 12
    },
    badgeTextHero: {
        color: '#ffffff'
    },
    title: {
        marginTop: theme.spacing.sm,
        fontSize: 28,
        lineHeight: 34,
        fontFamily: theme.fonts.display,
        color: theme.colors.textPrimary
    },
    titleHero: {
        marginTop: theme.spacing.xs,
        color: '#ffffff'
    },
    subInfo: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 15,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    subInfoHero: {
        marginTop: theme.spacing.micro,
        color: 'rgba(255,255,255,0.9)'
    },
    metaRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        flexWrap: 'wrap',
        marginTop: theme.spacing.sm
    },
    metaText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontFamily: theme.fonts.medium
    },
    metaTextHero: {
        color: 'rgba(255,255,255,0.84)'
    }
});

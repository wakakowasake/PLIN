import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAdapters } from '@/adapters/useAdapters';
import { getMobileDiagnosticsSnapshot } from '@/config/mobile-runtime-config';
import { isPrivilegedDebugUser } from '@/dev/debug-access';
import { useAuthSession } from '@/hooks/useAuthSession';
import { theme } from '@/theme';

type Props = {
    screen: string;
    dataState: string;
    lastDataError?: string | null;
};

type RowProps = {
    label: string;
    value: string;
};

function Row({ label, value }: RowProps) {
    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
        </View>
    );
}

function formatUserSummary(
    user: ReturnType<typeof useAuthSession>['user']
) {
    if (!user) {
        return 'none';
    }

    return `${user.displayName || 'user'} (${user.uid})`;
}

export function DebugInfoCard({ screen, dataState, lastDataError }: Props) {
    const { authMode } = useAdapters();
    const {
        status,
        user,
        profileSummary,
        bootstrapError,
        authActionError,
        lastSessionEvent
    } = useAuthSession();
    const diagnostics = getMobileDiagnosticsSnapshot();

    if (!isPrivilegedDebugUser(profileSummary, user)) {
        return null;
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>개발 진단</Text>
            <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
            >
                <Row label="screen" value={screen} />
                <Row label="dataState" value={dataState} />
                <Row label="authMode" value={authMode} />
                <Row label="firebase" value={diagnostics.firebase.state} />
                <Row label="googleAuth" value={diagnostics.google.state} />
                <Row label="demoUid" value={diagnostics.demo.hasExplicitDemoUid ? 'configured' : 'none'} />
                <Row label="session" value={status} />
                <Row label="user" value={formatUserSummary(user)} />
                <Row label="lastSessionEvent" value={lastSessionEvent || 'none'} />
                <Row label="bootstrapError" value={bootstrapError || 'none'} />
                <Row label="authError" value={authActionError || 'none'} />
                <Row label="dataError" value={lastDataError || 'none'} />
                {diagnostics.firebase.missingKeys.length > 0 ? (
                    <Row
                        label="firebaseMissing"
                        value={diagnostics.firebase.missingKeys.join(', ')}
                    />
                ) : null}
                {diagnostics.google.missingKeys.length > 0 ? (
                    <Row
                        label="googleMissing"
                        value={diagnostics.google.missingKeys.join(', ')}
                    />
                ) : null}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    title: {
        marginBottom: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontWeight: '800',
        fontSize: 13
    },
    scrollArea: {
        maxHeight: 280
    },
    scrollContent: {
        paddingBottom: theme.spacing.micro
    },
    row: {
        marginTop: 4
    },
    label: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontWeight: '700'
    },
    value: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontSize: 12,
        lineHeight: 18
    }
});

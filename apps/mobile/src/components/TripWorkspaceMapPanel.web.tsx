import React from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { EmptyState } from '@/components/EmptyState';
import { useTripDetail } from '@/hooks/useTripDetail';
import { fetchBackendJson } from '@/services/backend-client';
import { type AppTheme, useAppTheme } from '@/theme';
import type {
    MobileTimelineFocusTarget,
    MobileTripDaySection,
    MobileTripDetail
} from '@/types/trip';

type Props = {
    tripId: string;
    userId: string | null;
    selectedTarget: MobileTimelineFocusTarget | null;
    onSelectTarget(target: MobileTimelineFocusTarget): void;
};

type PublicConfigResponse = {
    googleMapsApiKey?: string;
    googleMapsApiEnabled?: boolean;
};

type WorkspaceMapPoint = {
    key: string;
    dayId: string;
    dayLabel: string;
    itemId: string;
    itemIndex: number;
    title: string;
    subtitle: string;
    timeLabel: string;
    latitude: number;
    longitude: number;
};

type FrameMessage =
    | { type: 'workspace_map_ready' }
    | { type: 'workspace_map_select'; dayId: string; itemId: string; itemIndex: number };

let cachedBrowserMapsApiKey: string | null | undefined;

function normalizeText(value: string | null | undefined) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

async function readBrowserMapsApiKey() {
    if (cachedBrowserMapsApiKey !== undefined) {
        return cachedBrowserMapsApiKey;
    }

    const payload = await fetchBackendJson<PublicConfigResponse>('/config', {
        requireAuth: false
    });
    const apiKey = normalizeText(payload.googleMapsApiKey || '');
    cachedBrowserMapsApiKey = apiKey || null;
    return cachedBrowserMapsApiKey;
}

function hasCoordinates(item: { latitude?: number | null; longitude?: number | null }) {
    return typeof item.latitude === 'number'
        && Number.isFinite(item.latitude)
        && typeof item.longitude === 'number'
        && Number.isFinite(item.longitude);
}

function buildMapPoints(detail: MobileTripDetail | null): WorkspaceMapPoint[] {
    if (!detail) {
        return [];
    }

    return detail.days.flatMap((day: MobileTripDaySection) => (
        day.items
            .map((item, itemIndex): WorkspaceMapPoint | null => {
                if (!hasCoordinates(item) || item.isTransit || item.badgeLabel === '메모') {
                    return null;
                }

                const title = normalizeText(item.title) || normalizeText(item.location) || '일정';
                const subtitle = [
                    normalizeText(item.timeLabel),
                    normalizeText(item.location)
                ].filter(Boolean).join(' · ');

                return {
                    key: `${day.id}:${item.id}`,
                    dayId: day.id,
                    dayLabel: day.label,
                    itemId: item.id,
                    itemIndex,
                    title,
                    subtitle,
                    timeLabel: normalizeText(item.timeLabel),
                    latitude: Number(item.latitude),
                    longitude: Number(item.longitude)
                };
            })
            .filter((point): point is WorkspaceMapPoint => Boolean(point))
    ));
}

function buildDayOptions(detail: MobileTripDetail | null, points: WorkspaceMapPoint[]) {
    if (!detail) {
        return [];
    }

    const daysWithPoints = new Set(points.map((point) => point.dayId));
    return detail.days
        .filter((day) => daysWithPoints.has(day.id))
        .map((day) => ({
            id: day.id,
            label: day.label
        }));
}

function buildMapHtml(theme: AppTheme, apiKey: string) {
    const config = JSON.stringify({
        colors: {
            background: theme.colors.background,
            surface: theme.colors.surface,
            border: theme.colors.border,
            textPrimary: theme.colors.textPrimary,
            textSecondary: theme.colors.textSecondary,
            accent: theme.colors.accent
        },
        defaultCenter: {
            lat: 37.5665,
            lng: 126.9780
        }
    });

    return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <style>
      html, body, #map {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: ${theme.colors.surface};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      const staticConfig = ${config};
      let map;
      let markers = [];
      let currentPoints = [];
      let selectedKey = '';

      function postMessageToParent(message) {
        window.parent.postMessage(JSON.stringify(message), '*');
      }

      function markerIcon(active) {
        return {
          path: google.maps.SymbolPath.CIRCLE,
          scale: active ? 10 : 7,
          fillColor: active ? staticConfig.colors.accent : staticConfig.colors.surface,
          fillOpacity: 1,
          strokeColor: active ? staticConfig.colors.accent : staticConfig.colors.textSecondary,
          strokeWeight: active ? 3 : 2
        };
      }

      function clearMarkers() {
        markers.forEach((marker) => marker.setMap(null));
        markers = [];
      }

      function renderMarkers() {
        if (!map || !window.google) return;
        clearMarkers();

        const bounds = new google.maps.LatLngBounds();
        currentPoints.forEach((point, index) => {
          const position = { lat: Number(point.latitude), lng: Number(point.longitude) };
          const active = point.key === selectedKey;
          const marker = new google.maps.Marker({
            map,
            position,
            title: point.title,
            icon: markerIcon(active),
            label: {
              text: String(index + 1),
              color: active ? '#ffffff' : staticConfig.colors.textPrimary,
              fontSize: '11px',
              fontWeight: '700'
            }
          });
          marker.addListener('click', () => {
            selectedKey = point.key;
            renderMarkers();
            map.panTo(position);
            map.setZoom(Math.max(Number(map.getZoom()) || 13, 14));
            postMessageToParent({
              type: 'workspace_map_select',
              dayId: point.dayId,
              itemId: point.itemId,
              itemIndex: point.itemIndex
            });
          });
          markers.push(marker);
          bounds.extend(position);
        });

        if (currentPoints.length === 1) {
          map.setCenter(bounds.getCenter());
          map.setZoom(14);
          return;
        }

        if (currentPoints.length > 1) {
          map.fitBounds(bounds, 64);
        }
      }

      function applyState(payload) {
        currentPoints = Array.isArray(payload.points) ? payload.points : [];
        selectedKey = String(payload.selectedKey || '');
        renderMarkers();

        const selectedPoint = currentPoints.find((point) => point.key === selectedKey);
        if (selectedPoint) {
          map.panTo({ lat: Number(selectedPoint.latitude), lng: Number(selectedPoint.longitude) });
          map.setZoom(Math.max(Number(map.getZoom()) || 13, 14));
        }
      }

      window.addEventListener('message', (event) => {
        let message = event.data;
        if (typeof message === 'string') {
          try {
            message = JSON.parse(message);
          } catch (error) {
            return;
          }
        }
        if (message && message.type === 'apply_state') {
          applyState(message.payload || {});
        }
      });

      window.initWorkspaceMap = function initWorkspaceMap() {
        map = new google.maps.Map(document.getElementById('map'), {
          center: staticConfig.defaultCenter,
          zoom: 12,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: 'greedy',
          styles: [
            { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit.station', stylers: [{ visibility: 'simplified' }] }
          ]
        });
        postMessageToParent({ type: 'workspace_map_ready' });
      };
    </script>
    <script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=initWorkspaceMap"></script>
  </body>
</html>`;
}

export function TripWorkspaceMapPanel({
    tripId,
    userId,
    selectedTarget,
    onSelectTarget
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const frameRef = React.useRef<HTMLIFrameElement | null>(null);
    const [apiKey, setApiKey] = React.useState<string | null>(cachedBrowserMapsApiKey ?? null);
    const [isPreparingMap, setPreparingMap] = React.useState(cachedBrowserMapsApiKey === undefined);
    const [isFrameReady, setFrameReady] = React.useState(false);
    const [mapError, setMapError] = React.useState<string | null>(null);
    const [activeDayId, setActiveDayId] = React.useState('all');
    const { detail, loading, error, retry } = useTripDetail(userId, tripId);

    React.useEffect(() => {
        setActiveDayId('all');
        setFrameReady(false);
    }, [tripId]);

    React.useEffect(() => {
        if (selectedTarget?.dayId && activeDayId !== 'all' && activeDayId !== selectedTarget.dayId) {
            setActiveDayId(selectedTarget.dayId);
        }
    }, [activeDayId, selectedTarget?.dayId]);

    React.useEffect(() => {
        if (cachedBrowserMapsApiKey !== undefined) {
            setApiKey(cachedBrowserMapsApiKey || null);
            setPreparingMap(false);
            if (!cachedBrowserMapsApiKey) {
                setMapError('지도 키를 불러오지 못했어요.');
            }
            return;
        }

        let cancelled = false;
        setPreparingMap(true);
        void readBrowserMapsApiKey()
            .then((nextApiKey) => {
                if (cancelled) return;
                setApiKey(nextApiKey);
                setMapError(nextApiKey ? null : '지도 키를 불러오지 못했어요.');
            })
            .catch((apiError) => {
                if (cancelled) return;
                const message = apiError instanceof Error ? apiError.message : '지도 설정을 불러오지 못했어요.';
                setMapError(message);
            })
            .finally(() => {
                if (!cancelled) {
                    setPreparingMap(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const allPoints = React.useMemo(() => buildMapPoints(detail), [detail]);
    const dayOptions = React.useMemo(() => buildDayOptions(detail, allPoints), [allPoints, detail]);
    const visiblePoints = React.useMemo(() => (
        activeDayId === 'all'
            ? allPoints
            : allPoints.filter((point) => point.dayId === activeDayId)
    ), [activeDayId, allPoints]);
    const selectedKey = selectedTarget
        ? `${selectedTarget.dayId}:${selectedTarget.itemId}`
        : '';
    const selectedPoint = React.useMemo(() => (
        allPoints.find((point) => point.key === selectedKey) || null
    ), [allPoints, selectedKey]);
    const mapHtml = React.useMemo(() => (
        apiKey ? buildMapHtml(theme, apiKey) : ''
    ), [apiKey, theme]);

    const postFrameState = React.useCallback(() => {
        const frameWindow = frameRef.current?.contentWindow;
        if (!frameWindow || !isFrameReady) {
            return;
        }

        frameWindow.postMessage(JSON.stringify({
            type: 'apply_state',
            payload: {
                points: visiblePoints,
                selectedKey
            }
        }), '*');
    }, [isFrameReady, selectedKey, visiblePoints]);

    React.useEffect(() => {
        postFrameState();
    }, [postFrameState]);

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const handleMessage = (event: MessageEvent) => {
            let message: FrameMessage | null = null;
            if (typeof event.data === 'string') {
                try {
                    message = JSON.parse(event.data) as FrameMessage;
                } catch (parseError) {
                    return;
                }
            } else if (event.data && typeof event.data === 'object') {
                message = event.data as FrameMessage;
            }

            if (!message) {
                return;
            }

            if (message.type === 'workspace_map_ready') {
                setFrameReady(true);
                return;
            }

            if (message.type === 'workspace_map_select') {
                onSelectTarget({
                    dayId: message.dayId,
                    itemId: message.itemId,
                    itemIndex: message.itemIndex,
                    requestId: Date.now()
                });
            }
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [onSelectTarget]);

    if (!tripId) {
        return (
            <View style={styles.shell}>
                <View style={styles.emptyCard}>
                    <MaterialCommunityIcons name="map-marker-path" size={34} color={theme.colors.textSecondary} />
                    <Text style={styles.emptyTitle}>일정을 선택하면 지도가 열려요</Text>
                    <Text style={styles.emptyDescription}>왼쪽 목록에서 일정을 고르면 장소 핀을 이곳에서 함께 볼 수 있어요.</Text>
                </View>
            </View>
        );
    }

    if (loading || isPreparingMap) {
        return (
            <View style={styles.shell}>
                <View style={styles.loadingCard}>
                    <ActivityIndicator color={theme.colors.accent} />
                    <Text style={styles.loadingText}>지도와 일정 장소를 준비하고 있어요</Text>
                </View>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.shell}>
                <EmptyState
                    title="지도에 표시할 일정을 불러오지 못했어요."
                    description={error}
                    actionLabel="다시 시도"
                    onAction={() => {
                        void retry();
                    }}
                    tone="warning"
                />
            </View>
        );
    }

    if (mapError || !apiKey) {
        return (
            <View style={styles.shell}>
                <EmptyState
                    title="지도를 열지 못했어요."
                    description={mapError || '지도 설정을 확인해 주세요.'}
                    tone="warning"
                />
            </View>
        );
    }

    return (
        <View style={styles.shell}>
            <View style={styles.header}>
                <Text style={styles.eyebrow}>Map</Text>
                <Text style={styles.title} numberOfLines={1}>{detail?.title || '일정 지도'}</Text>
                <Text style={styles.description} numberOfLines={2}>
                    일정 장소 {allPoints.length}곳을 지도에서 함께 봅니다.
                </Text>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dayChips}
            >
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeDayId === 'all' }}
                    onPress={() => setActiveDayId('all')}
                    style={({ pressed }) => [
                        styles.dayChip,
                        activeDayId === 'all' ? styles.dayChipActive : null,
                        pressed ? styles.pressed : null
                    ]}
                >
                    <Text style={[
                        styles.dayChipText,
                        activeDayId === 'all' ? styles.dayChipTextActive : null
                    ]}>
                        전체
                    </Text>
                </Pressable>
                {dayOptions.map((day) => (
                    <Pressable
                        key={day.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activeDayId === day.id }}
                        onPress={() => setActiveDayId(day.id)}
                        style={({ pressed }) => [
                            styles.dayChip,
                            activeDayId === day.id ? styles.dayChipActive : null,
                            pressed ? styles.pressed : null
                        ]}
                    >
                        <Text style={[
                            styles.dayChipText,
                            activeDayId === day.id ? styles.dayChipTextActive : null
                        ]}>
                            {day.label}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>

            <View style={styles.mapFrame}>
                {visiblePoints.length ? (
                    React.createElement('iframe', {
                        ref: frameRef,
                        title: 'PLIN workspace map',
                        srcDoc: mapHtml,
                        onLoad: () => {
                            setFrameReady(false);
                        },
                        sandbox: 'allow-scripts allow-same-origin',
                        style: {
                            border: 0,
                            width: '100%',
                            height: '100%',
                            display: 'block',
                            backgroundColor: theme.colors.surface
                        }
                    } as React.IframeHTMLAttributes<HTMLIFrameElement>)
                ) : (
                    <View style={styles.noPlaces}>
                        <MaterialCommunityIcons name="map-marker-off-outline" size={34} color={theme.colors.textSecondary} />
                        <Text style={styles.emptyTitle}>표시할 장소가 없어요</Text>
                        <Text style={styles.emptyDescription}>
                            일정에 위치가 있는 장소를 추가하면 지도에 핀이 생겨요.
                        </Text>
                    </View>
                )}
            </View>

            {selectedPoint ? (
                <View style={styles.selectedCard}>
                    <Text style={styles.selectedDay}>{selectedPoint.dayLabel}</Text>
                    <Text style={styles.selectedTitle} numberOfLines={1}>{selectedPoint.title}</Text>
                    {selectedPoint.subtitle ? (
                        <Text style={styles.selectedDescription} numberOfLines={2}>{selectedPoint.subtitle}</Text>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    shell: {
        flex: 1,
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.surface
    },
    header: {
        gap: theme.spacing.micro
    },
    eyebrow: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold,
        fontSize: 12,
        lineHeight: 16
    },
    title: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold,
        fontSize: 20,
        lineHeight: 26
    },
    description: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body,
        fontSize: 13,
        lineHeight: 19
    },
    dayChips: {
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.micro
    },
    dayChip: {
        minHeight: 34,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    dayChipActive: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    dayChipText: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold,
        fontSize: 12
    },
    dayChipTextActive: {
        color: theme.colors.accent
    },
    mapFrame: {
        flex: 1,
        minHeight: 320,
        overflow: Platform.OS === 'web' ? 'hidden' : 'visible',
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.background
    },
    selectedCard: {
        gap: theme.spacing.micro,
        padding: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    selectedDay: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold,
        fontSize: 12,
        lineHeight: 16
    },
    selectedTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold,
        fontSize: 15,
        lineHeight: 21
    },
    selectedDescription: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body,
        fontSize: 13,
        lineHeight: 18
    },
    loadingCard: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        padding: theme.spacing.md
    },
    loadingText: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.medium,
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center'
    },
    emptyCard: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        padding: theme.spacing.md
    },
    noPlaces: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        padding: theme.spacing.md
    },
    emptyTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold,
        fontSize: 16,
        lineHeight: 22,
        textAlign: 'center'
    },
    emptyDescription: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body,
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center'
    },
    pressed: {
        opacity: 0.78
    }
});

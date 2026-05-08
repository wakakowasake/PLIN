import React from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View
} from 'react-native';

import { fetchBackendJson } from '@/services/backend-client';
import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileTripCreatePlace } from '@/types/trip';

export type MapMode = 'results' | 'manual';

export type PlaceMapCandidate = MobileTripCreatePlace & {
    rank: 1 | 2 | 3 | 4 | 5;
};

export type ManualCenterDraft = {
    latitude: number;
    longitude: number;
} | null;

export type MapVisibleInsets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

export type MapVisibleBounds = {
    north: number;
    south: number;
    east: number;
    west: number;
};

export type MapViewportDraft = {
    latitude: number;
    longitude: number;
    bounds?: MapVisibleBounds | null;
} | null;

type PublicConfigResponse = {
    googleMapsApiKey?: string;
    googleMapsApiEnabled?: boolean;
};

type MapMessage =
    | { type: 'ready' }
    | { type: 'candidate_press'; placeId: string }
    | { type: 'manual_center'; latitude: number; longitude: number }
    | { type: 'viewport_center'; latitude: number; longitude: number; bounds?: MapVisibleBounds | null; movedByUser?: boolean }
    | { type: 'manual_nearby_places'; places: MobileTripCreatePlace[]; fallbackPlace: MobileTripCreatePlace }
    | { type: 'manual_selection'; place: MobileTripCreatePlace }
    | { type: 'place_preview'; place: MobileTripCreatePlace }
    | { type: 'error'; message?: string };

type Props = {
    mode: MapMode;
    query: string;
    fallbackCenter?: {
        latitude: number;
        longitude: number;
    } | null;
    fallbackQuery?: string;
    candidates: PlaceMapCandidate[];
    selectedPlace: MobileTripCreatePlace | null;
    highlightedCandidateId: string | null;
    visibleInsets?: Partial<MapVisibleInsets>;
    manualCenterDraft: ManualCenterDraft;
    isCandidatesLoading: boolean;
    candidatesError?: string | null;
    controlsVisible?: boolean;
    onModeChange(nextMode: MapMode): void;
    onSelectCandidate(placeId: string): void;
    onManualCenterChange(nextCenter: ManualCenterDraft): void;
    onViewportCenterChange(nextCenter: MapViewportDraft, options?: { movedByUser?: boolean }): void;
    onManualNearbyPlaces(places: MobileTripCreatePlace[], fallbackPlace: MobileTripCreatePlace): void;
    onManualSelect(place: MobileTripCreatePlace): void;
    onMapPlacePreview(place: MobileTripCreatePlace): void;
    onMapError(message: string): void;
};

export type InlinePlaceMapPickerHandle = {
    adjustZoom(delta: number): void;
    confirmManualSelection(): void;
    focusCandidate(placeId: string): void;
    focusLocation(center: { latitude: number; longitude: number; zoom?: number }): void;
};

type FrameCommand =
    | {
        type: 'apply_state';
        payload: ReturnType<typeof buildMapStatePayload>;
    }
    | {
        type: 'confirm_manual_selection';
    }
    | {
        type: 'focus_candidate';
        placeId: string;
    }
    | {
        type: 'adjust_zoom';
        delta: number;
    }
    | {
        type: 'focus_location';
        latitude: number;
        longitude: number;
        zoom?: number;
    };

let cachedBrowserMapsApiKey: string | null | undefined;
const MAP_PIN_ORANGE = '#ff8a1f';
const MAP_PIN_ORANGE_HIGHLIGHT = '#e36c00';
const MAP_PIN_MUTED_FILL = '#ffffff';
const MAP_PIN_MUTED_STROKE = '#9ca3af';

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

function buildMapHtml(theme: AppTheme, apiKey: string) {
    const payload = JSON.stringify({
        colors: {
            background: theme.colors.background,
            surface: theme.colors.surface,
            border: theme.colors.border,
            textPrimary: theme.colors.textPrimary,
            textSecondary: theme.colors.textSecondary,
            accent: theme.colors.accent
        },
        defaultCenter: {
            latitude: 37.5665,
            longitude: 126.9780
        }
    });

    return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: ${theme.colors.background};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #map {
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      const staticConfig = ${payload};
      let map;
      let geocoder;
      let markers = [];
      let idleListener = null;
      let userMovedMap = false;
      let renderVersion = 0;
      const resultFocusBottomInsetRatio = 0.75;
      let currentState = {
        mode: 'results',
        query: '',
        fallbackCenter: null,
        fallbackQuery: '',
        candidates: [],
        selectedPlace: null,
        highlightedCandidateId: null,
        visibleInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      };

      function postMessage(message) {
        window.parent.postMessage(JSON.stringify(message), '*');
      }

      function normalizeText(value) {
        return String(value || '').replace(/\\s+/g, ' ').trim();
      }

      function hasCoords(place) {
        return Boolean(
          place
          && Number.isFinite(Number(place.latitude))
          && Number.isFinite(Number(place.longitude))
        );
      }

      function buildLatLng(place) {
        return {
          lat: Number(place.latitude),
          lng: Number(place.longitude)
        };
      }

      function readFiniteNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }

      function getVisiblePadding(options) {
        const rawInsets = currentState.visibleInsets || {};
        const mapDiv = map && map.getDiv ? map.getDiv() : null;
        const mapHeight = mapDiv && mapDiv.clientHeight ? Number(mapDiv.clientHeight) : 0;
        const bottomInsetRatio = options && options.relaxedBottom === true ? resultFocusBottomInsetRatio : 1;
        const top = Math.max(48, readFiniteNumber(rawInsets.top, 0) + 24);
        const left = Math.max(48, readFiniteNumber(rawInsets.left, 0) + 24);
        const right = Math.max(48, readFiniteNumber(rawInsets.right, 0) + 24);
        const requestedBottom = Math.max(48, (readFiniteNumber(rawInsets.bottom, 0) * bottomInsetRatio) + 24);
        const maxBottom = mapHeight > 0 ? Math.max(48, mapHeight - top - 96) : requestedBottom;

        return {
          top,
          right,
          bottom: Math.min(requestedBottom, maxBottom),
          left
        };
      }

      function getMapLatLngBoundsPayload() {
        if (!map || !map.getBounds) {
          return null;
        }

        const bounds = map.getBounds();
        if (!bounds) {
          return null;
        }

        const northEast = bounds.getNorthEast();
        const southWest = bounds.getSouthWest();

        return {
          north: northEast.lat(),
          south: southWest.lat(),
          east: northEast.lng(),
          west: southWest.lng()
        };
      }

      function buildSingleCandidateBounds(candidate) {
        const latitude = Number(candidate.latitude);
        const longitude = Number(candidate.longitude);
        const bounds = new google.maps.LatLngBounds();
        const latSpan = 0.0022;
        const lngSpan = 0.0022 / Math.max(Math.abs(Math.cos(toRadians(latitude))), 0.35);

        bounds.extend({ lat: latitude - latSpan, lng: longitude - lngSpan });
        bounds.extend({ lat: latitude + latSpan, lng: longitude + lngSpan });
        return bounds;
      }

      function fitVisibleBounds(bounds, options) {
        map.fitBounds(bounds, getVisiblePadding(options));
      }

      function focusCandidateInVisibleArea(candidate, maxZoom) {
        fitVisibleBounds(buildSingleCandidateBounds(candidate), { relaxedBottom: true });
        google.maps.event.addListenerOnce(map, 'idle', () => {
          if (Number(map.getZoom()) > maxZoom) {
            map.setZoom(maxZoom);
          }
        });
      }

      function buildCandidatePinIcon(highlighted) {
        const fillColor = highlighted ? '${MAP_PIN_ORANGE_HIGHLIGHT}' : '${MAP_PIN_MUTED_FILL}';
        const strokeColor = highlighted ? '#ffffff' : '${MAP_PIN_MUTED_STROKE}';
        const accentColor = highlighted ? '${MAP_PIN_ORANGE_HIGHLIGHT}' : '${MAP_PIN_MUTED_STROKE}';
        const coreColor = highlighted ? '#ffffff' : '${MAP_PIN_MUTED_STROKE}';
        const size = highlighted ? 34 : 28;
        const height = highlighted ? 44 : 38;
        const strokeWidth = highlighted ? 4 : 3.25;
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + height + '" viewBox="0 0 46 64">'
          + '<line x1="23" y1="34" x2="23" y2="48" stroke="' + accentColor + '" stroke-width="5" stroke-linecap="round"/>'
          + '<circle cx="23" cy="22" r="17" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="' + strokeWidth + '"/>'
          + '<circle cx="23" cy="22" r="5" fill="' + coreColor + '"/>'
          + '</svg>';

        return {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
          scaledSize: new google.maps.Size(size, height),
          anchor: new google.maps.Point(size / 2, height - 3)
        };
      }

      function buildFallbackPlaceId(lat, lng) {
        return 'manual-map-' + Number(lat).toFixed(6) + '-' + Number(lng).toFixed(6);
      }

      function toRadians(value) {
        return Number(value) * Math.PI / 180;
      }

      function distanceMeters(a, b) {
        const lat1 = Number(a && a.latitude);
        const lng1 = Number(a && a.longitude);
        const lat2 = Number(b && b.latitude);
        const lng2 = Number(b && b.longitude);
        const earthRadius = 6371000;
        const dLat = toRadians(lat2 - lat1);
        const dLng = toRadians(lng2 - lng1);
        const haversine = Math.sin(dLat / 2) * Math.sin(dLat / 2)
          + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
          * Math.sin(dLng / 2) * Math.sin(dLng / 2);

        return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
      }

      function offsetLatLng(latitude, longitude, meters, angleDegrees) {
        const angle = toRadians(angleDegrees);
        const latitudeDelta = (meters / 111320) * Math.cos(angle);
        const longitudeBase = Math.cos(toRadians(latitude));
        const longitudeDelta = (meters / (111320 * Math.max(Math.abs(longitudeBase), 0.2))) * Math.sin(angle);

        return {
          lat: Number(latitude) + latitudeDelta,
          lng: Number(longitude) + longitudeDelta
        };
      }

      function buildMarkerPlacements(candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) {
          return [];
        }

        const groups = [];

        candidates.forEach((candidate) => {
          const targetGroup = groups.find((group) => (
            distanceMeters(group.anchor, candidate) < 18
          ));

          if (targetGroup) {
            targetGroup.items.push(candidate);
            return;
          }

          groups.push({
            anchor: {
              latitude: Number(candidate.latitude),
              longitude: Number(candidate.longitude)
            },
            items: [candidate]
          });
        });

        return groups.flatMap((group) => {
          if (group.items.length === 1) {
            const candidate = group.items[0];
            return [{
              candidate,
              position: {
                lat: Number(candidate.latitude),
                lng: Number(candidate.longitude)
              }
            }];
          }

          const radiusMeters = Math.max(18, 14 + group.items.length * 6);

          return group.items.map((candidate, index) => ({
            candidate,
            position: offsetLatLng(
              group.anchor.latitude,
              group.anchor.longitude,
              radiusMeters,
              -90 + ((360 / group.items.length) * index)
            )
          }));
        });
      }

      function getPrimaryCandidate(candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) {
          return null;
        }

        const highlightedCandidate = candidates.find((candidate) => (
          normalizeText(candidate.placeId) === normalizeText(currentState.highlightedCandidateId)
        ));

        return highlightedCandidate || candidates[0] || null;
      }

      function getMaxDistanceFromCandidate(referenceCandidate, candidates) {
        if (!referenceCandidate || !Array.isArray(candidates) || candidates.length === 0) {
          return 0;
        }

        return candidates.reduce((maxDistance, candidate) => (
          Math.max(maxDistance, distanceMeters(referenceCandidate, candidate))
        ), 0);
      }

      function buildFallbackName(result, lat, lng) {
        const explicitName = normalizeText(result && result.name);
        const formattedAddress = normalizeText(result && result.formatted_address);
        const primaryComponent = Array.isArray(result && result.address_components)
          ? normalizeText(result.address_components[0] && result.address_components[0].long_name)
          : '';
        const query = normalizeText(currentState.query);
        const coordinateName = Number(lat).toFixed(3) + ', ' + Number(lng).toFixed(3);

        if (explicitName) {
          return explicitName;
        }

        if (primaryComponent) {
          return primaryComponent;
        }

        if (formattedAddress) {
          return formattedAddress;
        }

        if (query) {
          return query;
        }

        return '선택한 위치 ' + coordinateName;
      }

      function buildPlacePayload(result, lat, lng) {
        const name = buildFallbackName(result, lat, lng);
        const address = normalizeText(result && (result.formatted_address || result.vicinity)) || name;
        const placeTypes = Array.isArray(result && result.types)
          ? result.types.map((type) => normalizeText(type).toLowerCase()).filter(Boolean)
          : [];
        const photoUrl = Array.isArray(result && result.photos) && result.photos[0] && result.photos[0].getUrl
          ? result.photos[0].getUrl({ maxWidth: 640, maxHeight: 960 })
          : null;

        return {
          placeId: normalizeText(result && result.place_id) || buildFallbackPlaceId(lat, lng),
          name,
          address,
          latitude: Number(lat),
          longitude: Number(lng),
          placeTypes,
          mapImageUrl: photoUrl,
          photoReference: null
        };
      }

      function postMapPlacePreview(result, lat, lng) {
        const safeLat = Number(lat);
        const safeLng = Number(lng);
        if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) {
          return;
        }

        postMessage({
          type: 'place_preview',
          place: buildPlacePayload(result, safeLat, safeLng)
        });
      }

      function getPreferredReverseGeocodeResult(results) {
        const safeResults = Array.isArray(results) ? results : [];

        return safeResults.find((entry) => (
          Array.isArray(entry && entry.types)
          && (
            entry.types.includes('point_of_interest')
            || entry.types.includes('establishment')
            || entry.types.includes('premise')
            || entry.types.includes('street_address')
            || entry.types.includes('route')
          )
        )) || safeResults[0] || null;
      }

      function previewLatLng(lat, lng) {
        if (!geocoder) {
          postMapPlacePreview(null, lat, lng);
          return;
        }

        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          const preferredResult = getPreferredReverseGeocodeResult(results);
          if (status !== 'OK' && !preferredResult) {
            postMapPlacePreview(null, lat, lng);
            return;
          }

          postMapPlacePreview(preferredResult, lat, lng);
        });
      }

      function previewMapClick(event) {
        const latLng = event && event.latLng;
        if (!latLng) {
          return;
        }

        const fallbackLat = latLng.lat();
        const fallbackLng = latLng.lng();
        const placeId = normalizeText(event && event.placeId);

        userMovedMap = true;

        if (!placeId || !window.google || !window.google.maps || !window.google.maps.places) {
          previewLatLng(fallbackLat, fallbackLng);
          return;
        }

        if (event.stop) {
          event.stop();
        }

        const placesService = new google.maps.places.PlacesService(map);
        placesService.getDetails({
          placeId,
          fields: ['place_id', 'name', 'formatted_address', 'geometry', 'types', 'photos', 'address_components']
        }, (result, status) => {
          const location = result && result.geometry && result.geometry.location;
          const lat = location ? location.lat() : fallbackLat;
          const lng = location ? location.lng() : fallbackLng;

          if (status === google.maps.places.PlacesServiceStatus.OK && result) {
            postMapPlacePreview(result, lat, lng);
            return;
          }

          previewLatLng(fallbackLat, fallbackLng);
        });
      }

      function clearMarkers() {
        markers.forEach((marker) => marker.setMap(null));
        markers = [];
      }

      function clearIdleListener() {
        if (idleListener && window.google && window.google.maps && window.google.maps.event) {
          window.google.maps.event.removeListener(idleListener);
        }

        idleListener = null;
      }

      function getPreferredCenter() {
        if (hasCoords(currentState.selectedPlace)) {
          return buildLatLng(currentState.selectedPlace);
        }

        const highlightedCandidate = Array.isArray(currentState.candidates)
          ? currentState.candidates.find((candidate) => candidate.placeId === currentState.highlightedCandidateId)
          : null;

        if (hasCoords(highlightedCandidate)) {
          return buildLatLng(highlightedCandidate);
        }

        if (Array.isArray(currentState.candidates) && currentState.candidates[0] && hasCoords(currentState.candidates[0])) {
          return buildLatLng(currentState.candidates[0]);
        }

        if (hasCoords(currentState.fallbackCenter)) {
          return buildLatLng(currentState.fallbackCenter);
        }

        return null;
      }

      function postCurrentCenter() {
        if (!map) {
          return;
        }

        const center = map.getCenter();
        if (!center) {
          return;
        }

        postMessage({
          type: 'manual_center',
          latitude: center.lat(),
          longitude: center.lng()
        });
      }

      function postViewportCenter() {
        if (!map) {
          return;
        }

        const center = map.getCenter();
        if (!center) {
          return;
        }

        postMessage({
          type: 'viewport_center',
          latitude: center.lat(),
          longitude: center.lng(),
          bounds: getMapLatLngBoundsPayload(),
          movedByUser: Boolean(userMovedMap)
        });
      }

      function attachManualCenterTracking() {
        clearIdleListener();

        idleListener = map.addListener('idle', () => {
          postCurrentCenter();
        });

        postCurrentCenter();
      }

      function attachResultsViewportTracking() {
        clearIdleListener();

        idleListener = map.addListener('idle', () => {
          postViewportCenter();
        });

        postViewportCenter();
      }

      function renderCandidateMarkers(focusedPlaceId, shouldRefit) {
        if (!Array.isArray(currentState.candidates) || currentState.candidates.length === 0) {
          return;
        }

        const bounds = new google.maps.LatLngBounds();
        const shouldHighlight = normalizeText(currentState.highlightedCandidateId);
        const placements = buildMarkerPlacements(currentState.candidates);
        const primaryCandidate = getPrimaryCandidate(currentState.candidates);
        const focusedCandidate = normalizeText(focusedPlaceId)
          ? currentState.candidates.find((candidate) => (
              normalizeText(candidate.placeId) === normalizeText(focusedPlaceId)
            )) || null
          : null;
        const maxCandidateDistance = getMaxDistanceFromCandidate(primaryCandidate, currentState.candidates);

        placements.forEach(({ candidate, position }) => {
          const highlighted = shouldHighlight === normalizeText(candidate.placeId);
          const marker = new google.maps.Marker({
            map,
            position,
            icon: buildCandidatePinIcon(highlighted),
            zIndex: highlighted ? 20 : 10
          });

          marker.addListener('click', () => {
            postMessage({
              type: 'candidate_press',
              placeId: String(candidate.placeId || '')
            });
          });

          bounds.extend(marker.getPosition());
          markers.push(marker);
        });

        if (shouldRefit === false) {
          return;
        }

        if (focusedCandidate) {
          focusCandidateInVisibleArea(focusedCandidate, 16);
          return;
        }

        if (primaryCandidate && maxCandidateDistance > 3500) {
          focusCandidateInVisibleArea(primaryCandidate, 15);
          return;
        }

        if (placements.length > 1) {
          fitVisibleBounds(bounds);
          return;
        }

        const firstCandidate = primaryCandidate || currentState.candidates[0];
        focusCandidateInVisibleArea(firstCandidate, 15);
      }

      function focusQueryIfNeeded(version) {
        const query = normalizeText(currentState.query) || normalizeText(currentState.fallbackQuery);
        if (!query || !geocoder) {
          map.setCenter({
            lat: Number(staticConfig.defaultCenter.latitude),
            lng: Number(staticConfig.defaultCenter.longitude)
          });
          map.setZoom(12);
          return;
        }

        geocoder.geocode({ address: query }, (results, status) => {
          if (version !== renderVersion) {
            return;
          }

          const firstResult = Array.isArray(results) ? results[0] : null;
          const location = firstResult && firstResult.geometry && firstResult.geometry.location;

          if (status === 'OK' && location) {
            map.setCenter({
              lat: location.lat(),
              lng: location.lng()
            });
            map.setZoom(currentState.mode === 'manual' ? 16 : 14);
            return;
          }

          map.setCenter({
            lat: Number(staticConfig.defaultCenter.latitude),
            lng: Number(staticConfig.defaultCenter.longitude)
          });
          map.setZoom(12);
        });
      }

      function renderState() {
        if (!map) {
          return;
        }

        renderVersion += 1;
        const version = renderVersion;
        clearMarkers();
        clearIdleListener();

        if (currentState.mode !== 'manual' && (!Array.isArray(currentState.candidates) || currentState.candidates.length === 0)) {
          const preferredCenter = getPreferredCenter();
          if (preferredCenter) {
            map.setCenter(preferredCenter);
            map.setZoom(14);
          } else {
            focusQueryIfNeeded(version);
          }
        }

        if (currentState.mode === 'results') {
          renderCandidateMarkers(null, true);
          attachResultsViewportTracking();
          return;
        }

        attachManualCenterTracking();
      }

      function confirmCurrentCenter() {
        if (!map || !geocoder) {
          postMessage({
            type: 'error',
            message: '지도를 준비하지 못했어요.'
          });
          return;
        }

        const center = map.getCenter();
        if (!center) {
          postMessage({
            type: 'error',
            message: '선택한 위치를 확인하지 못했어요.'
          });
          return;
        }

        const lat = center.lat();
        const lng = center.lng();

        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          const safeResults = Array.isArray(results) ? results : [];
          const preferredResult = safeResults.find((entry) => (
            Array.isArray(entry.types)
            && (
              entry.types.includes('point_of_interest')
              || entry.types.includes('establishment')
              || entry.types.includes('premise')
              || entry.types.includes('street_address')
            )
          )) || safeResults[0] || null;

          if (status !== 'OK' && !preferredResult) {
            postManualNearbyPlaces(lat, lng, null);
            return;
          }

          postManualNearbyPlaces(lat, lng, preferredResult);
        });
      }

      function postManualNearbyPlaces(lat, lng, fallbackResult) {
        if (!map || !window.google || !window.google.maps || !window.google.maps.places) {
          postMessage({
            type: 'manual_selection',
            place: buildPlacePayload(fallbackResult, lat, lng)
          });
          return;
        }

        const placesService = new google.maps.places.PlacesService(map);
        placesService.nearbySearch({
          location: { lat, lng },
          radius: 220
        }, (results, status) => {
          const safeResults = Array.isArray(results) ? results : [];
          const seenPlaceIds = {};
          const places = safeResults
            .filter((entry) => (
              entry
              && normalizeText(entry.place_id)
              && normalizeText(entry.name)
              && entry.geometry
              && entry.geometry.location
              && Array.isArray(entry.types)
              && (
                entry.types.includes('point_of_interest')
                || entry.types.includes('establishment')
                || entry.types.includes('store')
                || entry.types.includes('restaurant')
                || entry.types.includes('cafe')
                || entry.types.includes('lodging')
              )
            ))
            .map((entry) => buildPlacePayload(entry, entry.geometry.location.lat(), entry.geometry.location.lng()))
            .filter((place) => {
              if (!place.placeId || seenPlaceIds[place.placeId]) {
                return false;
              }

              seenPlaceIds[place.placeId] = true;
              return true;
            })
            .slice(0, 8);

          if (status === google.maps.places.PlacesServiceStatus.OK && places.length > 0) {
            postMessage({
              type: 'manual_nearby_places',
              places,
              fallbackPlace: buildPlacePayload(fallbackResult, lat, lng)
            });
            return;
          }

          postMessage({
            type: 'manual_selection',
            place: buildPlacePayload(fallbackResult, lat, lng)
          });
        });
      }

      function focusCandidateByPlaceId(placeId) {
        if (!map) {
          return;
        }

        currentState.highlightedCandidateId = normalizeText(placeId);
        clearMarkers();
        clearIdleListener();
        renderCandidateMarkers(placeId);
        if (currentState.mode === 'results') {
          attachResultsViewportTracking();
        }
      }

      function adjustMapZoom(delta) {
        if (!map) {
          return;
        }

        const currentZoom = Number(map.getZoom());
        const nextZoom = Math.max(2, Math.min(21, (Number.isFinite(currentZoom) ? currentZoom : 12) + Number(delta || 0)));
        map.setZoom(nextZoom);
      }

      function focusLocation(latitude, longitude, zoom) {
        if (!map) {
          return;
        }

        const lat = Number(latitude);
        const lng = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }

        userMovedMap = true;
        map.setCenter({ lat, lng });
        map.setZoom(Math.max(2, Math.min(21, Number(zoom) || 16)));
      }

      function applyIncomingState(nextState) {
        userMovedMap = false;
        currentState = Object.assign({}, currentState, nextState || {});
        renderState();
      }

      window.addEventListener('message', (event) => {
        const message = event && event.data ? event.data : null;
        if (!message || typeof message !== 'object') {
          return;
        }

        if (message.type === 'apply_state') {
          applyIncomingState(message.payload || {});
          return;
        }

        if (message.type === 'confirm_manual_selection') {
          confirmCurrentCenter();
          return;
        }

        if (message.type === 'focus_candidate') {
          focusCandidateByPlaceId(message.placeId);
          return;
        }

        if (message.type === 'adjust_zoom') {
          adjustMapZoom(message.delta);
          return;
        }

        if (message.type === 'focus_location') {
          focusLocation(message.latitude, message.longitude, message.zoom);
        }
      });

      function initMap() {
        try {
          geocoder = new google.maps.Geocoder();
          map = new google.maps.Map(document.getElementById('map'), {
            center: {
              lat: Number(staticConfig.defaultCenter.latitude),
              lng: Number(staticConfig.defaultCenter.longitude)
            },
            zoom: 12,
            disableDefaultUI: true,
            zoomControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: false,
            gestureHandling: 'greedy'
          });

          map.addListener('dragstart', () => {
            userMovedMap = true;
          });

          map.addListener('click', previewMapClick);

          renderState();
          postMessage({ type: 'ready' });
        } catch (error) {
          postMessage({
            type: 'error',
            message: error && error.message ? String(error.message) : '지도를 불러오지 못했어요.'
          });
        }
      }

      window.initMap = initMap;
      window.onerror = function(message) {
        postMessage({
          type: 'error',
          message: String(message || '지도를 불러오지 못했어요.')
        });
      };
    </script>
    <script
      async
      defer
      src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&callback=initMap"
    ></script>
  </body>
</html>`;
}

function buildMapStatePayload(props: {
    mode: MapMode;
    query: string;
    fallbackCenter?: {
        latitude: number;
        longitude: number;
    } | null;
    fallbackQuery?: string;
    candidates: PlaceMapCandidate[];
    selectedPlace: MobileTripCreatePlace | null;
    highlightedCandidateId: string | null;
    visibleInsets?: Partial<MapVisibleInsets>;
}) {
    return {
        mode: props.mode,
        query: normalizeText(props.query),
        fallbackCenter: props.fallbackCenter
            ? {
                latitude: props.fallbackCenter.latitude,
                longitude: props.fallbackCenter.longitude
            }
            : null,
        fallbackQuery: normalizeText(props.fallbackQuery),
        candidates: props.candidates.map((candidate) => ({
            placeId: candidate.placeId,
            name: candidate.name,
            address: candidate.address,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            rank: candidate.rank
        })),
        selectedPlace: props.selectedPlace
            ? {
                placeId: props.selectedPlace.placeId,
                name: props.selectedPlace.name,
                address: props.selectedPlace.address,
                latitude: props.selectedPlace.latitude,
                longitude: props.selectedPlace.longitude
            }
            : null,
        highlightedCandidateId: props.highlightedCandidateId,
        visibleInsets: {
            top: Number(props.visibleInsets?.top || 0),
            right: Number(props.visibleInsets?.right || 0),
            bottom: Number(props.visibleInsets?.bottom || 0),
            left: Number(props.visibleInsets?.left || 0)
        }
    };
}

export const InlinePlaceMapPicker = React.forwardRef<InlinePlaceMapPickerHandle, Props>(function InlinePlaceMapPicker(
    {
        mode,
        query,
        fallbackCenter = null,
        fallbackQuery = '',
        candidates,
        selectedPlace,
        highlightedCandidateId,
        visibleInsets,
        manualCenterDraft,
        isCandidatesLoading,
        candidatesError,
        controlsVisible = true,
        onModeChange,
        onSelectCandidate,
        onManualCenterChange,
        onViewportCenterChange,
        onManualNearbyPlaces,
        onManualSelect,
        onMapPlacePreview,
        onMapError
    },
    ref
) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
    const [apiKey, setApiKey] = React.useState<string | null>(cachedBrowserMapsApiKey ?? null);
    const [isPreparing, setIsPreparing] = React.useState(cachedBrowserMapsApiKey === undefined);
    const [isMapReady, setIsMapReady] = React.useState(false);
    const [localError, setLocalError] = React.useState<string | null>(null);

    const postFrameMessage = React.useCallback((message: FrameCommand) => {
        iframeRef.current?.contentWindow?.postMessage(message, '*');
    }, []);

    React.useImperativeHandle(ref, () => ({
        adjustZoom(delta: number) {
            postFrameMessage({
                type: 'adjust_zoom',
                delta: Number(delta) > 0 ? 1 : -1
            });
        },
        confirmManualSelection() {
            postFrameMessage({
                type: 'confirm_manual_selection'
            });
        },
        focusCandidate(placeId: string) {
            postFrameMessage({
                type: 'focus_candidate',
                placeId
            });
        },
        focusLocation(center: { latitude: number; longitude: number; zoom?: number }) {
            const latitude = Number(center.latitude);
            const longitude = Number(center.longitude);

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return;
            }

            postFrameMessage({
                type: 'focus_location',
                latitude,
                longitude,
                zoom: Number(center.zoom) || 16
            });
        }
    }), [postFrameMessage]);

    React.useEffect(() => {
        let cancelled = false;

        if (cachedBrowserMapsApiKey !== undefined) {
            setApiKey(cachedBrowserMapsApiKey || null);
            setIsPreparing(false);
            if (!cachedBrowserMapsApiKey) {
                const message = '지도를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.';
                setLocalError(message);
                onMapError(message);
            }

            return () => {
                cancelled = true;
            };
        }

        setIsPreparing(true);
        setLocalError(null);

        void readBrowserMapsApiKey()
            .then((nextApiKey) => {
                if (cancelled) {
                    return;
                }

                setApiKey(nextApiKey || null);
                if (!nextApiKey) {
                    const message = '지도를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.';
                    setLocalError(message);
                    onMapError(message);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    const message = '지도를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.';
                    setApiKey(null);
                    setLocalError(message);
                    onMapError(message);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsPreparing(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [onMapError]);

    const html = React.useMemo(() => {
        if (!apiKey) {
            return '';
        }

        return buildMapHtml(theme, apiKey);
    }, [apiKey, theme]);

    React.useEffect(() => {
        setIsMapReady(false);
    }, [html]);

    React.useEffect(() => {
        function handleMessage(event: MessageEvent) {
            if (event.source !== iframeRef.current?.contentWindow) {
                return;
            }

            try {
                const payload = typeof event.data === 'string'
                    ? JSON.parse(event.data) as MapMessage
                    : event.data as MapMessage;

                if (payload.type === 'ready') {
                    setIsMapReady(true);
                    setLocalError(null);
                    return;
                }

                if (payload.type === 'candidate_press') {
                    onSelectCandidate(payload.placeId);
                    return;
                }

                if (payload.type === 'manual_center') {
                    onManualCenterChange({
                        latitude: Number(payload.latitude),
                        longitude: Number(payload.longitude)
                    });
                    return;
                }

                if (payload.type === 'viewport_center') {
                    onViewportCenterChange(
                        {
                            latitude: Number(payload.latitude),
                            longitude: Number(payload.longitude),
                            bounds: payload.bounds
                        },
                        { movedByUser: payload.movedByUser === true }
                    );
                    return;
                }

                if (payload.type === 'manual_selection') {
                    onManualSelect(payload.place);
                    return;
                }

                if (payload.type === 'manual_nearby_places') {
                    onManualNearbyPlaces(payload.places, payload.fallbackPlace);
                    return;
                }

                if (payload.type === 'place_preview') {
                    onMapPlacePreview(payload.place);
                    return;
                }

                if (payload.type === 'error') {
                    const message = payload.message || '지도를 불러오지 못했어요.';
                    setLocalError(message);
                    onMapError(message);
                }
            } catch {
                const message = '지도를 불러오지 못했어요.';
                setLocalError(message);
                onMapError(message);
            }
        }

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [
        onManualCenterChange,
        onManualNearbyPlaces,
        onManualSelect,
        onMapError,
        onMapPlacePreview,
        onSelectCandidate,
        onViewportCenterChange
    ]);

    React.useEffect(() => {
        if (!apiKey || !isMapReady) {
            return;
        }

        postFrameMessage({
            type: 'apply_state',
            payload: buildMapStatePayload({
                mode,
                query,
                fallbackCenter,
                fallbackQuery,
                candidates,
                selectedPlace,
                highlightedCandidateId,
                visibleInsets
            })
        });
    }, [
        apiKey,
        candidates,
        fallbackCenter,
        fallbackQuery,
        highlightedCandidateId,
        isMapReady,
        mode,
        postFrameMessage,
        query,
        selectedPlace,
        visibleInsets
    ]);

    const iframeStyle = React.useMemo<React.CSSProperties>(() => ({
        border: 0,
        display: 'block',
        width: '100%',
        height: '100%',
        backgroundColor: theme.colors.background
    }), [theme.colors.background]);

    return (
        <View style={styles.container}>
            <View style={styles.frameWrap}>
                {apiKey ? (
                    <iframe
                        ref={iframeRef}
                        sandbox="allow-scripts allow-same-origin"
                        srcDoc={html}
                        style={iframeStyle}
                        title="PLIN place map"
                    />
                ) : (
                    <View style={styles.webViewFallback} />
                )}
            </View>

            {(isPreparing || !isMapReady) && apiKey ? (
                <View pointerEvents="none" style={styles.loadingOverlay}>
                    <ActivityIndicator color={theme.colors.accent} size="small" />
                    <Text style={styles.loadingText}>
                        {isPreparing ? '지도를 준비하고 있어요.' : '지도를 불러오고 있어요.'}
                    </Text>
                </View>
            ) : null}

            {controlsVisible ? (
                <View pointerEvents="box-none" style={styles.overlay}>
                    <View pointerEvents="box-none" style={styles.topOverlayRow}>
                        <View style={styles.statusStack}>
                            {mode === 'results' ? (
                                <>
                                    {isCandidatesLoading ? (
                                        <View style={styles.statusCard}>
                                            <Text style={styles.statusText}>검색 결과를 지도에 올리고 있어요.</Text>
                                        </View>
                                    ) : null}
                                    {!isCandidatesLoading && (candidatesError || (!candidates.length && !localError)) ? (
                                        <View style={[styles.statusCard, styles.statusCardWarning]}>
                                            <Text style={[styles.statusText, styles.statusTextWarning]}>
                                                {candidatesError || '검색 결과를 지도에 표시하지 못했어요. 목록에서 선택해 주세요.'}
                                            </Text>
                                        </View>
                                    ) : null}
                                </>
                            ) : (
                                <View style={styles.statusCard}>
                                    <Text style={styles.statusText}>지도를 움직여 위치를 맞춘 뒤 아래 버튼으로 확정해요.</Text>
                                </View>
                            )}
                            {localError ? (
                                <View style={[styles.statusCard, styles.statusCardWarning]}>
                                    <Text style={[styles.statusText, styles.statusTextWarning]}>{localError}</Text>
                                </View>
                            ) : null}
                        </View>

                        <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                                onModeChange(mode === 'manual' ? 'results' : 'manual');
                            }}
                            style={({ pressed }) => [
                                styles.modeToggle,
                                pressed ? styles.modeTogglePressed : null
                            ]}
                        >
                            <Text style={styles.modeToggleText}>
                                {mode === 'manual' ? '검색 결과 보기' : '직접 고르기'}
                            </Text>
                        </Pressable>
                    </View>

                    {mode === 'manual' ? (
                        <View pointerEvents="none" style={styles.centerPinWrap}>
                            <View style={styles.centerPinHead}>
                                <View style={styles.centerPinCore} />
                            </View>
                            <View style={styles.centerPinStem} />
                        </View>
                    ) : null}
                </View>
            ) : mode === 'manual' ? (
                <View pointerEvents="none" style={styles.overlay}>
                    <View style={styles.centerPinWrap}>
                        <View style={styles.centerPinHead}>
                            <View style={styles.centerPinCore} />
                        </View>
                        <View style={styles.centerPinStem} />
                    </View>
                </View>
            ) : null}
        </View>
    );
});

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.background
    },
    frameWrap: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    webViewFallback: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.08)',
        gap: theme.spacing.xs
    },
    loadingText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    overlay: {
        ...StyleSheet.absoluteFillObject
    },
    topOverlayRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.sm,
        paddingTop: Platform.select({
            ios: theme.spacing.lg,
            android: theme.spacing.md,
            default: theme.spacing.md
        }) || theme.spacing.md
    },
    statusStack: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    statusCard: {
        maxWidth: 260,
        marginBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.mode === 'dark' ? 'rgba(37, 39, 44, 0.92)' : 'rgba(255, 255, 255, 0.92)'
    },
    statusCardWarning: {
        borderColor: theme.mode === 'dark' ? 'rgba(247, 53, 38, 0.28)' : 'rgba(242, 30, 22, 0.2)',
        backgroundColor: theme.mode === 'dark' ? 'rgba(50, 35, 35, 0.92)' : 'rgba(253, 242, 242, 0.95)'
    },
    statusText: {
        color: theme.colors.textPrimary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    statusTextWarning: {
        color: theme.colors.warning
    },
    modeToggle: {
        minHeight: 40,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.mode === 'dark' ? 'rgba(37, 39, 44, 0.94)' : 'rgba(255, 255, 255, 0.94)'
    },
    modeTogglePressed: {
        opacity: 0.88
    },
    modeToggleText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    centerPinWrap: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center'
    },
    centerPinHead: {
        width: 34,
        height: 34,
        borderRadius: theme.radius.full,
        borderWidth: 4,
        borderColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: MAP_PIN_ORANGE,
        shadowColor: '#000000',
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6
    },
    centerPinCore: {
        width: 10,
        height: 10,
        borderRadius: theme.radius.full,
        backgroundColor: '#ffffff'
    },
    centerPinStem: {
        width: 4,
        height: 24,
        borderRadius: theme.radius.full,
        backgroundColor: MAP_PIN_ORANGE
    }
});

import { BACKEND_URL } from './config.js';
import { normalizeTripDocument } from '../../shared/features/trips/trip-canonical.js';
export {
    formatDuration,
    formatTimeStr,
    minutesTo24Hour,
    parseDurationStr,
    parseTimeStr
} from '../../shared/core/utils/time-value-helpers.js';

export function calculateStraightDistance(p1, p2) {
    if (!p1 || !p2 || typeof p1 !== 'object' || typeof p2 !== 'object') return null;
    const lat1 = p1.lat;
    const lng1 = p1.lng;
    const lat2 = p2.lat;
    const lng2 = p2.lng;
    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return null;

    const R = 6371e3; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Input text
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const SAFE_HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const SAFE_RELATIVE_URL_PATTERN = /^(?:\/(?!\/)|\.{1,2}\/|\?|#)/;
const SAFE_DATA_IMAGE_PATTERN = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;
const SAFE_DATA_PDF_PATTERN = /^data:application\/pdf;base64,[a-z0-9+/=\s]+$/i;
const FORCE_HTTPS_IMAGE_HOST_PATTERN = /(^|\.)kakaocdn\.net$/i;
export const TRIP_ATTACHMENT_LIMIT = 7;

function getDayTimelineEntries(day) {
    if (Array.isArray(day?.timeline) && day.timeline.length > 0) {
        return day.timeline;
    }

    if (Array.isArray(day?.items)) {
        return day.items;
    }

    return Array.isArray(day?.timeline) ? day.timeline : [];
}

export function countTripAttachments(tripData) {
    if (!tripData || typeof tripData !== 'object' || !Array.isArray(tripData.days)) {
        return 0;
    }

    return tripData.days.reduce((tripTotal, day) => {
        const entries = getDayTimelineEntries(day);
        const dayTotal = entries.reduce((entryTotal, item) => {
            if (!Array.isArray(item?.attachments)) {
                return entryTotal;
            }

            return entryTotal + item.attachments.filter(Boolean).length;
        }, 0);

        return tripTotal + dayTotal;
    }, 0);
}

function encodeUnsafeUrlCharacters(value = '') {
    return String(value).replace(/[\u0000-\u001F\u007F"'()<>\\`]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`
    );
}

function normalizeKnownSecureAssetUrl(value = '', parsedUrl = null) {
    const raw = String(value || '').trim();
    if (!raw) return raw;

    try {
        const parsed = parsedUrl instanceof URL ? new URL(parsedUrl.toString()) : new URL(raw, window.location.origin);
        if (parsed.protocol === 'http:' && FORCE_HTTPS_IMAGE_HOST_PATTERN.test(parsed.hostname)) {
            parsed.protocol = 'https:';
            return parsed.toString();
        }
        return raw.startsWith('http://') || raw.startsWith('https://') ? raw : parsed.href;
    } catch (error) {
        return raw;
    }
}

function sanitizeRenderableUrl(
    value = '',
    {
        fallback = '',
        allowRelative = true,
        allowBlob = false,
        allowDataImage = false,
        allowDataPdf = false
    } = {}
) {
    const raw = String(value || '').trim();
    if (!raw) return fallback;

    if (allowBlob && raw.startsWith('blob:')) {
        return encodeUnsafeUrlCharacters(raw);
    }

    if (allowDataImage && SAFE_DATA_IMAGE_PATTERN.test(raw)) {
        return encodeUnsafeUrlCharacters(raw);
    }

    if (allowDataPdf && SAFE_DATA_PDF_PATTERN.test(raw)) {
        return encodeUnsafeUrlCharacters(raw);
    }

    if (allowRelative && SAFE_RELATIVE_URL_PATTERN.test(raw)) {
        return encodeUnsafeUrlCharacters(raw);
    }

    try {
        const parsed = new URL(raw, window.location.origin);
        if (SAFE_HTTP_PROTOCOLS.has(parsed.protocol)) {
            const normalized = normalizeKnownSecureAssetUrl(raw, parsed);
            return encodeUnsafeUrlCharacters(normalized);
        }
    } catch (error) {
        return fallback;
    }

    return fallback;
}

export function sanitizeImageUrl(value = '', fallback = '') {
    return sanitizeRenderableUrl(value, {
        fallback,
        allowRelative: true,
        allowBlob: true,
        allowDataImage: true
    });
}

export function sanitizeFileUrl(value = '', fallback = '') {
    return sanitizeRenderableUrl(value, {
        fallback,
        allowRelative: true,
        allowBlob: true,
        allowDataImage: true,
        allowDataPdf: true
    });
}

export function extractGooglePhotoReference(url = '') {
    const raw = String(url || '').trim();
    if (!raw) return '';

    const match = raw.match(/(?:[?&]1s=?([^&]+)|[?&]photoreference=([^&]+))/i);
    const reference = match ? (match[1] || match[2] || '') : '';
    if (!reference) return '';

    try {
        return decodeURIComponent(reference);
    } catch (error) {
        return reference;
    }
}

export function normalizeGooglePhotoUrl(url = '', maxWidth = 1600) {
    const raw = String(url || '').trim();
    if (!raw) return raw;

    const isLegacyGooglePhotoUrl =
        raw.includes('maps.googleapis.com/maps/api/place/js/PhotoService.GetPhoto') ||
        raw.includes('photoreference=') ||
        raw.includes('?1s') ||
        raw.includes('&1s');

    if (!isLegacyGooglePhotoUrl) return sanitizeImageUrl(raw, '');

    const reference = extractGooglePhotoReference(raw);
    if (!reference || !BACKEND_URL) return sanitizeImageUrl(raw, '');

    return sanitizeImageUrl(
        `${BACKEND_URL}/google-photo-proxy?reference=${encodeURIComponent(reference)}&maxwidth=${maxWidth}`,
        ''
    );
}

export function normalizeTripMediaUrls(trip) {
    if (!trip || typeof trip !== 'object') return trip;

    const normalizedTrip = typeof structuredClone === 'function'
        ? structuredClone(trip)
        : JSON.parse(JSON.stringify(trip));

    if (normalizedTrip.meta) {
        if (normalizedTrip.meta.mapImage) {
            normalizedTrip.meta.mapImage = normalizeGooglePhotoUrl(normalizedTrip.meta.mapImage, 1600);
        }
        if (normalizedTrip.meta.defaultMapImage) {
            normalizedTrip.meta.defaultMapImage = normalizeGooglePhotoUrl(normalizedTrip.meta.defaultMapImage, 1600);
        }
        if (normalizedTrip.meta.coverImage) {
            normalizedTrip.meta.coverImage = normalizeGooglePhotoUrl(normalizedTrip.meta.coverImage, 1600);
        }
    }

    if (Array.isArray(normalizedTrip.days)) {
        normalizedTrip.days.forEach((day) => {
            const collections = [];
            if (Array.isArray(day?.timeline)) collections.push(day.timeline);
            if (Array.isArray(day?.items)) collections.push(day.items);

            collections.forEach((entries) => {
                entries.forEach((item) => {
                    if (!item || typeof item !== 'object') return;

                    if (item.image) {
                        item.image = normalizeGooglePhotoUrl(item.image, 800);
                    }

                    if (Array.isArray(item.memories)) {
                        item.memories.forEach((memory) => {
                            if (memory?.photoUrl) {
                                memory.photoUrl = normalizeGooglePhotoUrl(memory.photoUrl, 800);
                            }
                        });
                    }

                    if (Array.isArray(item.attachments)) {
                        item.attachments = item.attachments
                            .map((attachment) => {
                                if (!attachment || typeof attachment !== 'object') {
                                    return null;
                                }

                                const nextAttachment = { ...attachment };
                                const safeUrl = sanitizeFileUrl(
                                    nextAttachment.url || nextAttachment.data || nextAttachment.downloadUrl,
                                    ''
                                );

                                if (!safeUrl) {
                                    return null;
                                }

                                nextAttachment.url = safeUrl;

                                if (nextAttachment.previewUrl) {
                                    const safePreviewUrl = sanitizeImageUrl(nextAttachment.previewUrl, '');
                                    if (safePreviewUrl) {
                                        nextAttachment.previewUrl = safePreviewUrl;
                                    } else {
                                        delete nextAttachment.previewUrl;
                                    }
                                }

                                if (nextAttachment.thumbnailUrl) {
                                    const safeThumbnailUrl = sanitizeImageUrl(nextAttachment.thumbnailUrl, '');
                                    if (safeThumbnailUrl) {
                                        nextAttachment.thumbnailUrl = safeThumbnailUrl;
                                    } else {
                                        delete nextAttachment.thumbnailUrl;
                                    }
                                }

                                delete nextAttachment.data;
                                delete nextAttachment.downloadUrl;
                                return nextAttachment;
                            })
                            .filter(Boolean);
                    }
                });
            });
        });
    }

    if (normalizedTrip.mapImage) {
        normalizedTrip.mapImage = normalizeGooglePhotoUrl(normalizedTrip.mapImage, 1600);
    }
    if (normalizedTrip.coverImage) {
        normalizedTrip.coverImage = normalizeGooglePhotoUrl(normalizedTrip.coverImage, 1600);
    }

    return normalizedTrip;
}

function cloneTripData(value) {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

export function adaptTripDataForWeb(trip, tripId = '') {
    if (!trip || typeof trip !== 'object' || !Array.isArray(trip.days)) {
        return trip;
    }

    const needsTimelineCompat = trip.days.some((day) => Array.isArray(day?.items));

    if (!needsTimelineCompat) {
        return trip;
    }

    const resolvedTripId = String(tripId || trip.id || trip.tripId || 'trip').trim() || 'trip';
    const canonicalTrip = normalizeTripDocument(resolvedTripId, trip);
    const nextTrip = cloneTripData(trip);

    nextTrip.days = canonicalTrip.days.map((canonicalDay, index) => {
        const sourceDay = nextTrip.days?.[index] && typeof nextTrip.days[index] === 'object'
            ? nextTrip.days[index]
            : {};
        const nextItems = Array.isArray(canonicalDay.items)
            ? canonicalDay.items.map((item) => ({ ...item }))
            : [];
        const nextTimeline = nextItems.map((item) => ({ ...item }));
        const sourcePlans = sourceDay.plans && typeof sourceDay.plans === 'object' && !Array.isArray(sourceDay.plans)
            ? sourceDay.plans
            : {};
        const nextPlans = {
            ...sourcePlans,
            A: nextItems.map((item) => ({ ...item }))
        };

        return {
            ...sourceDay,
            id: sourceDay.id || canonicalDay.id,
            date: sourceDay.date || canonicalDay.date,
            items: nextItems,
            timeline: nextTimeline,
            plans: nextPlans,
            planATimeline: nextItems.map((item) => ({ ...item })),
            activePlan: 'A'
        };
    });

    if (Array.isArray(canonicalTrip.legacyFallbacks) && canonicalTrip.legacyFallbacks.length > 0) {
        nextTrip.legacyFallbacks = canonicalTrip.legacyFallbacks.slice();
    }

    return nextTrip;
}

/**
 * Compress image using canvas
 * @param {File|Blob} file - Source file
 * @param {number} maxWidth - Maximum width
 * @param {number} quality - JPEG quality (0 to 1)
 * @returns {Promise<string>} Data URL of compressed image
 */
export async function compressImage(file, maxWidth = 1024, quality = 0.7) {
    let objectUrl = null;
    let sourceFile = file;

    try {
        // [HEIC Conversion]
        if ((file.type === 'image/heic' || file.type === 'image/heif' || (file.name && file.name.toLowerCase().endsWith('.heic'))) && window.heic2any) {
            try {
                const convertedBlob = await window.heic2any({
                    blob: file,
                    toType: "image/jpeg",
                    quality: 0.8
                });
                sourceFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            } catch (e) {
                console.warn("HEIC conversion failed, trying original:", e);
            }
        }

        objectUrl = URL.createObjectURL(sourceFile);
        const imageSource = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("이미지 로드 실패"));
            img.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        let width = imageSource.width;
        let height = imageSource.height;

        if (width > maxWidth) {
            const ratio = maxWidth / width;
            width = maxWidth;
            height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // [Performance] Use white background for transparent images if falling back to JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(imageSource, 0, 0, width, height);

        // [Optimization] Try WebP first for better compression (30-50% smaller)
        let mimeType = 'image/webp';
        let dataUrl = canvas.toDataURL(mimeType, quality);

        // Fallback to JPEG if WebP resulted in a larger file or is not supported (unlikely in modern browsers)
        if (dataUrl.length < 1000 || dataUrl.includes('image/png')) { // toDataURL returns image/png if type not supported
            mimeType = 'image/jpeg';
            dataUrl = canvas.toDataURL(mimeType, quality);
        }

        if (dataUrl.length < 100) throw new Error("압축 결과 비정상");
        return dataUrl;
    } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
}

import React from 'react';
import {
    Image,
    InteractionManager,
    type ImageSourcePropType
} from 'react-native';

const prefetchedImageUrls = new Set<string>();
const inflightImageUrls = new Set<string>();
const REMOTE_IMAGE_URL_PATTERN = /^https?:\/\//i;

export function normalizeImageUrl(value: string | null | undefined) {
    return String(value || '').trim();
}

export function buildCachedImageSource(uri: string | null | undefined): ImageSourcePropType {
    return {
        uri: normalizeImageUrl(uri),
        cache: 'force-cache'
    };
}

export function normalizeImageUrls(
    urls: Array<string | null | undefined>,
    limit = urls.length
) {
    const normalizedUrls: string[] = [];
    const seenUrls = new Set<string>();

    for (const value of urls) {
        const normalized = normalizeImageUrl(value);
        if (!normalized || seenUrls.has(normalized)) {
            continue;
        }

        seenUrls.add(normalized);
        normalizedUrls.push(normalized);

        if (normalizedUrls.length >= limit) {
            break;
        }
    }

    return normalizedUrls;
}

export function prefetchImageUrls(
    urls: Array<string | null | undefined>,
    limit = urls.length
) {
    const candidateUrls = normalizeImageUrls(urls, limit)
        .filter((url) => REMOTE_IMAGE_URL_PATTERN.test(url));

    if (candidateUrls.length === 0) {
        return {
            cancel() {}
        };
    }

    let canceled = false;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
        if (canceled) {
            return;
        }

        candidateUrls.forEach((url) => {
            if (prefetchedImageUrls.has(url) || inflightImageUrls.has(url)) {
                return;
            }

            inflightImageUrls.add(url);
            void Image.prefetch(url)
                .then((isPrefetched) => {
                    if (isPrefetched) {
                        prefetchedImageUrls.add(url);
                    }
                })
                .catch(() => {})
                .finally(() => {
                    inflightImageUrls.delete(url);
                });
        });
    });

    return {
        cancel() {
            canceled = true;
            interactionTask.cancel();
        }
    };
}

export function useDeferredImagePrefetch(
    urls: Array<string | null | undefined>,
    limit = urls.length
) {
    const prefetchKey = React.useMemo(
        () => normalizeImageUrls(urls, limit).join('\n'),
        [limit, urls]
    );

    React.useEffect(() => {
        if (!prefetchKey) {
            return undefined;
        }

        const task = prefetchImageUrls(prefetchKey.split('\n'));
        return () => {
            task.cancel();
        };
    }, [prefetchKey]);
}

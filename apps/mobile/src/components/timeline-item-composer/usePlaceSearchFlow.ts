import React from 'react';

type SearchRequestPair = {
    searchRequestId: number;
    mapCandidatesRequestId: number;
};

export function usePlaceSearchFlow(sessionPrefix: string) {
    const searchRequestIdRef = React.useRef(0);
    const mapCandidatesRequestIdRef = React.useRef(0);
    const sessionTokenRef = React.useRef(`${sessionPrefix}-${Date.now().toString(36)}`);

    const beginPlaceSearchRequest = React.useCallback((): SearchRequestPair => {
        searchRequestIdRef.current += 1;
        mapCandidatesRequestIdRef.current += 1;

        return {
            searchRequestId: searchRequestIdRef.current,
            mapCandidatesRequestId: mapCandidatesRequestIdRef.current
        };
    }, []);

    const invalidatePlaceSearchRequests = React.useCallback(() => {
        searchRequestIdRef.current += 1;
        mapCandidatesRequestIdRef.current += 1;
    }, []);

    const invalidateMapCandidatesRequest = React.useCallback(() => {
        mapCandidatesRequestIdRef.current += 1;
    }, []);

    return {
        searchRequestIdRef,
        mapCandidatesRequestIdRef,
        sessionTokenRef,
        beginPlaceSearchRequest,
        invalidateMapCandidatesRequest,
        invalidatePlaceSearchRequests
    };
}

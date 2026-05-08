export function isLocalhostRuntime() {
    return typeof location !== 'undefined' &&
        (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
}

export function setWindowValue(key, value) {
    if (typeof window !== 'undefined') {
        window[key] = value;
    }
}

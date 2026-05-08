/**
 * 환경별 로거 유틸리티
 * 개발 환경에서만 로그를 출력하고, 프로덕션에서는 에러만 출력
 */

// 개발 환경 감지
const isDev = location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname.includes("firebase");

/**
 * 환경별 로거
 * @property {Function} log - 개발 환경에서만 일반 로그 출력
 * @property {Function} info - 개발 환경에서만 정보 로그 출력
 * @property {Function} warn - 경고 로그 출력 (모든 환경)
 * @property {Function} error - 에러 로그 출력 (모든 환경)
 * @property {Function} debug - 디버그 로그 출력 (개발 환경에서만)
 */
export const logger = {
    log: (...args) => {
        if (isDev) console.log(...args);
    },

    info: (...args) => {
        if (isDev) console.info(...args);
    },

    warn: (...args) => {
        console.warn(...args);
    },

    error: (...args) => {
        console.error(...args);
    },

    debug: (...args) => {
        if (isDev) console.debug(...args);
    },

    // 그룹 로깅 (디버깅용)
    group: (label, fn) => {
        if (isDev) {
            console.group(label);
            fn();
            console.groupEnd();
        }
    },

    // 테이블 로깅 (디버깅용)
    table: (data) => {
        if (isDev) console.table(data);
    }
};

// 성능 측정 유틸리티
export const perf = {
    start: (label) => {
        if (isDev) console.time(label);
    },

    end: (label) => {
        if (isDev) console.timeEnd(label);
    }
};

// 전역 접근 허용 (번들링 시 참조 오류 방지용)
if (typeof window !== 'undefined') {
    window.logger = logger;
}

export default logger;

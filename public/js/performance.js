import { getPerformance, trace } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-performance.js';
import { app, firebaseReady } from './firebase.js';
import logger from './logger.js';

// Firebase Performance 초기화
let perf = null;

firebaseReady.then(() => {
    try {
        perf = getPerformance(app);
        logger.log('Firebase Performance initialized');
    } catch (e) {
        logger.warn('Firebase Performance not available:', e.message);
    }
});

// Web Vitals 측정
export function measureWebVitals() {
    // Largest Contentful Paint (LCP)
    try {
        const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            const val = lastEntry.renderTime || lastEntry.loadTime;

            logger.log('LCP:', val);

            // Firebase Performance에 기록 (Custom Trace)
            if (perf) {
                const t = trace(perf, 'lcp');
                t.start();
                t.putMetric('value', Math.round(val));
                t.stop();
            }
        });

        observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
        logger.warn('LCP measurement failed:', e);
    }

    // First Input Delay (FID)
    try {
        const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach((entry) => {
                const fid = entry.processingStart - entry.startTime;
                logger.log('FID:', fid);

                if (perf) {
                    const t = trace(perf, 'fid');
                    t.start();
                    t.putMetric('value', Math.round(fid));
                    t.stop();
                }
            });
        });

        observer.observe({ type: 'first-input', buffered: true });
    } catch (e) {
        logger.warn('FID measurement failed:', e);
    }

    // Cumulative Layout Shift (CLS)
    let clsValue = 0;
    try {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) {
                    clsValue += entry.value;
                }
            }

            logger.log('CLS:', clsValue);

            if (perf) {
                // CLS는 소수점이므로 정수 메트릭으로 변환 (예: * 1000)
                const t = trace(perf, 'cls');
                t.start();
                t.putMetric('scaled_value', Math.round(clsValue * 1000));
                t.stop();
            }
        });

        observer.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {
        logger.warn('CLS measurement failed:', e);
    }
}

// 페이지 로드 시간 측정
export function measurePageLoad() {
    window.addEventListener('load', () => {
        setTimeout(() => {
            const perfData = performance.getEntriesByType('navigation')[0];

            if (perfData) {
                const metrics = {
                    dns: perfData.domainLookupEnd - perfData.domainLookupStart,
                    tcp: perfData.connectEnd - perfData.connectStart,
                    request: perfData.responseStart - perfData.requestStart,
                    response: perfData.responseEnd - perfData.responseStart,
                    dom: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
                    load: perfData.loadEventEnd - perfData.loadEventStart,
                    total: perfData.loadEventEnd - perfData.fetchStart
                };

                logger.log('Page Load Metrics:', metrics);

                // Firebase Performance에 기록
                if (perf) {
                    const t = trace(perf, 'page_load');
                    t.start();
                    Object.keys(metrics).forEach(key => {
                        t.putMetric(key, Math.round(metrics[key]));
                    });
                    t.stop();
                }
            }
        }, 0);
    });
}

// 리소스 로딩 시간 측정
export function measureResources() {
    window.addEventListener('load', () => {
        const resources = performance.getEntriesByType('resource');

        const resourceSummary = {
            scripts: 0,
            styles: 0,
            images: 0,
            fonts: 0,
            other: 0
        };

        resources.forEach(resource => {
            const type = resource.initiatorType;
            const duration = resource.duration;

            if (type === 'script') resourceSummary.scripts += duration;
            else if (type === 'css link') resourceSummary.styles += duration;
            else if (type === 'img') resourceSummary.images += duration;
            else if (type === 'font') resourceSummary.fonts += duration;
            else resourceSummary.other += duration;
        });

        logger.log('Resource Loading Summary:', resourceSummary);
    });
}

// 자동 초기화
if (typeof window !== 'undefined') {
    measureWebVitals();
    measurePageLoad();
    measureResources();
}

export default {
    measureWebVitals,
    measurePageLoad,
    measureResources
};

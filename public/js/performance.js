// Performance Monitoring Utility
// Firebase Performance와 Web Vitals를 활용한 성능 측정

import { getPerformance } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-performance.js';
import { app } from './firebase.js';
import logger from './logger.js';

// Firebase Performance 초기화
let perf = null;
try {
    perf = getPerformance(app);
    logger.log('Firebase Performance initialized');
} catch (e) {
    logger.warn('Firebase Performance not available:', e.message);
}

// Web Vitals 측정
export function measureWebVitals() {
    // Largest Contentful Paint (LCP)
    try {
        const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];

            logger.log('LCP:', lastEntry.renderTime || lastEntry.loadTime);

            // Firebase Performance에 기록 (Custom Trace)
            if (perf) {
                const trace = perf.trace('lcp');
                trace.putMetric('value', lastEntry.renderTime || lastEntry.loadTime);
                trace.record();
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
                    const trace = perf.trace('fid');
                    trace.putMetric('value', fid);
                    trace.record();
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
                const trace = perf.trace('cls');
                trace.putMetric('value', clsValue);
                trace.record();
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
                    const trace = perf.trace('page_load');
                    Object.keys(metrics).forEach(key => {
                        trace.putMetric(key, Math.round(metrics[key]));
                    });
                    trace.record();
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

// Image Lazy Loading 유틸리티
// Intersection Observer를 사용한 성능 최적화

/**
 * 이미지 lazy loading 초기화
 * data-src 속성을 가진 이미지를 뷰포트에 진입할 때 로드
 */
export function initLazyLoading() {
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;

                    // data-src를 src로 변경
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }

                    // data-srcset 지원
                    if (img.dataset.srcset) {
                        img.srcset = img.dataset.srcset;
                        img.removeAttribute('data-srcset');
                    }

                    // 로드 완료 처리
                    img.addEventListener('load', () => {
                        img.classList.add('loaded');
                        img.classList.remove('loading');
                    });

                    // 관찰 중지
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px 0px', // 뷰포트 50px 전에 미리 로드
            threshold: 0.01
        });

        // 모든 lazy 이미지 관찰 시작
        document.querySelectorAll('img[data-src]').forEach(img => {
            img.classList.add('loading');
            imageObserver.observe(img);
        });

        return imageObserver;
    } else {
        // Intersection Observer 미지원 시 즉시 로드
        document.querySelectorAll('img[data-src]').forEach(img => {
            if (img.dataset.src) {
                img.src = img.dataset.src;
            }
            if (img.dataset.srcset) {
                img.srcset = img.dataset.srcset;
            }
        });
    }
}

/**
 * 특정 컨테이너 내의 이미지만 lazy load
 */
export function observeImages(container) {
    if (!container) return;

    const images = container.querySelectorAll('img[data-src]');
    if (images.length === 0) return;

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '50px' });

        images.forEach(img => observer.observe(img));
    } else {
        // Fallback
        images.forEach(img => {
            if (img.dataset.src) img.src = img.dataset.src;
        });
    }
}

/**
 * 배경 이미지 lazy loading
 */
export function initBackgroundLazyLoad() {
    const bgElements = document.querySelectorAll('[data-bg]');

    if (bgElements.length === 0) return;

    if ('IntersectionObserver' in window) {
        const bgObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const bgUrl = el.dataset.bg;

                    if (bgUrl) {
                        el.style.backgroundImage = `url('${bgUrl}')`;
                        el.removeAttribute('data-bg');
                        el.classList.add('bg-loaded');
                    }

                    bgObserver.unobserve(el);
                }
            });
        }, { rootMargin: '100px' });

        bgElements.forEach(el => bgObserver.observe(el));
    } else {
        // Fallback
        bgElements.forEach(el => {
            if (el.dataset.bg) {
                el.style.backgroundImage = `url('${el.dataset.bg}')`;
            }
        });
    }
}

// 자동 초기화 (DOM 로드 후)
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initLazyLoading();
            initBackgroundLazyLoad();
        });
    } else {
        initLazyLoading();
        initBackgroundLazyLoad();
    }
}

export default {
    initLazyLoading,
    observeImages,
    initBackgroundLazyLoad
};

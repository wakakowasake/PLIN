import { currentTab, setCurrentTab } from '../../state.js';
import { loadProfileData } from '../../ui/profile.js';

export async function switchTab(tabName) {
    const hideHeaderEditButton = () => {
        document.getElementById('memory-lock-btn-header-container')?.classList.add('hidden');
        document.getElementById('memory-lock-btn-nav-container')?.classList.remove('is-visible');
    };

    if (currentTab === tabName) {
        if (tabName === 'main') {
            const detailView = document.getElementById('detail-view');
            if (detailView && !detailView.classList.contains('hidden')) {
                if (window.backToMain) {
                    window.backToMain();
                } else {
                    detailView.classList.add('hidden');
                    document.getElementById('main-view')?.classList.remove('hidden');
                    document.getElementById('back-btn')?.classList.add('hidden');
                    hideHeaderEditButton();
                }
            }
        }
        return;
    }

    setCurrentTab(tabName);

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((item) => {
        item.classList.remove('active');
        const icon = item.querySelector('.material-symbols-outlined');
        const text = item.querySelector('span:not(.material-symbols-outlined)');

        if (icon) {
            icon.classList.add('text-gray-400', 'dark:text-gray-500');
            icon.classList.remove('text-primary');
        }
        if (text) {
            text.classList.add('text-gray-400', 'dark:text-gray-500');
            text.classList.remove('text-primary');
        }
    });

    const activeNav = document.getElementById(`nav-${tabName}`);
    if (activeNav) {
        activeNav.classList.add('active');
        const activeIcon = activeNav.querySelector('.material-symbols-outlined');
        const activeText = activeNav.querySelector('span:not(.material-symbols-outlined)');

        if (activeIcon) {
            activeIcon.classList.remove('text-gray-400', 'dark:text-gray-500');
            activeIcon.classList.add('text-primary');
        }
        if (activeText) {
            activeText.classList.remove('text-gray-400', 'dark:text-gray-500');
            activeText.classList.add('text-primary');
        }
    }

    const mainView = document.getElementById('main-view');
    const communityView = document.getElementById('community-view');
    const noticesView = document.getElementById('notices-view');

    if (tabName === 'main') {
        if (mainView) mainView.classList.remove('hidden');
        if (communityView) communityView.classList.add('hidden');
        if (noticesView) noticesView.classList.add('hidden');
        document.getElementById('profile-view')?.classList.add('hidden');

        const detailView = document.getElementById('detail-view');
        if (detailView && !detailView.classList.contains('hidden')) {
            detailView.classList.add('hidden');
            document.getElementById('back-btn')?.classList.add('hidden');
            hideHeaderEditButton();
        }
        return;
    }

    if (tabName === 'community') {
        if (mainView) mainView.classList.add('hidden');
        if (communityView) communityView.classList.remove('hidden');
        if (noticesView) noticesView.classList.add('hidden');
        document.getElementById('profile-view')?.classList.add('hidden');
        document.getElementById('detail-view')?.classList.add('hidden');
        document.getElementById('back-btn')?.classList.add('hidden');
        hideHeaderEditButton();

        try {
            const { renderCommunityFeed } = await import('../../ui/community-renderer.js');
            renderCommunityFeed();
        } catch (error) {
            console.error('Failed to load community renderer:', error);
        }
        return;
    }

    if (tabName === 'notices') {
        if (mainView) mainView.classList.add('hidden');
        if (communityView) communityView.classList.add('hidden');
        if (noticesView) noticesView.classList.remove('hidden');
        document.getElementById('profile-view')?.classList.add('hidden');
        document.getElementById('detail-view')?.classList.add('hidden');
        document.getElementById('back-btn')?.classList.add('hidden');
        hideHeaderEditButton();

        try {
            const { initNoticesPage } = await import('../../pages/notices.js');
            initNoticesPage();
        } catch (error) {
            console.error('Failed to load notices page:', error);
        }
        return;
    }

    if (tabName === 'profile') {
        if (mainView) mainView.classList.add('hidden');
        if (communityView) communityView.classList.add('hidden');
        if (noticesView) noticesView.classList.add('hidden');
        document.getElementById('profile-view')?.classList.remove('hidden');
        document.getElementById('detail-view')?.classList.add('hidden');
        document.getElementById('back-btn')?.classList.add('hidden');
        hideHeaderEditButton();
        loadProfileData();
    }
}

window.switchTab = switchTab;

export default { switchTab };

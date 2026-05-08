import tinymce from 'tinymce/tinymce';
import 'tinymce/models/dom';
import 'tinymce/icons/default';
import 'tinymce/themes/silver';
import 'tinymce/plugins/advlist';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/autoresize';
import 'tinymce/plugins/code';
import 'tinymce/plugins/fullscreen';
import 'tinymce/plugins/image';
import 'tinymce/plugins/link';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/preview';
import 'tinymce/plugins/table';
import 'tinymce/plugins/wordcount';
import 'tinymce/skins/ui/oxide/skin.css';
import 'tinymce/skins/ui/oxide/content.css';

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseReady, db } from '../services/firebase/firebase-app.js';
import { assertAuthServicesReady, observeAuthState } from '../services/firebase/auth-service.js';
import { fetchUserProfile } from '../services/firebase/profile-repository.js';

const NOTICE_LIMIT = 50;
const NOTICE_BODY_HTML_LIMIT = 20000;
const noticesRef = collection(db, 'notices');

const els = {
    adminPanel: document.getElementById('notice-admin-panel'),
    listSection: document.getElementById('notice-list-section'),
    form: document.getElementById('notice-form'),
    editId: document.getElementById('notice-edit-id'),
    category: document.getElementById('notice-category'),
    title: document.getElementById('notice-title-input'),
    body: document.getElementById('notice-body-input'),
    pinned: document.getElementById('notice-pinned-input'),
    submit: document.getElementById('notice-submit-btn'),
    cancelEdit: document.getElementById('notice-cancel-edit-btn'),
    write: document.getElementById('notice-write-btn'),
    editorTitle: document.getElementById('notice-admin-title'),
    status: document.getElementById('notice-admin-status'),
    list: document.getElementById('notice-list'),
    refresh: document.getElementById('notice-refresh-btn')
};

const state = {
    isAdmin: false,
    currentUser: null,
    notices: []
};
let eventsBound = false;
let authObserverStarted = false;
let initPromise = null;
let noticeEditor = null;
let noticeEditorInitPromise = null;

function setNoticeEditorVisible(isVisible) {
    els.adminPanel?.classList.toggle('hidden', !isVisible);
    els.listSection?.classList.toggle('hidden', isVisible);
    els.write?.classList.toggle('hidden', isVisible || !state.isAdmin);
    if (isVisible) {
        window.requestAnimationFrame(() => {
            els.adminPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeMarkdownHref(value) {
    const href = String(value || '')
        .trim()
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    if (!href) return '';
    if (href.startsWith('/') || href.startsWith('#')) return href;
    if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
    return '';
}

function normalizeMediaSrc(value) {
    const src = String(value || '').trim();
    if (!src) return '';
    if (src.startsWith('/')) return src;
    if (/^https?:\/\//i.test(src)) return src;
    return '';
}

function sanitizeStyleAttribute(value) {
    const allowedProperties = new Set([
        'background-color',
        'color',
        'font-style',
        'font-weight',
        'text-align',
        'text-decoration'
    ]);

    return String(value || '')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const separatorIndex = part.indexOf(':');
            if (separatorIndex < 1) return '';
            const property = part.slice(0, separatorIndex).trim().toLowerCase();
            const cssValue = part.slice(separatorIndex + 1).trim();
            if (!allowedProperties.has(property)) return '';
            if (/url\s*\(|expression\s*\(|javascript:/i.test(cssValue)) return '';
            return `${property}: ${cssValue}`;
        })
        .filter(Boolean)
        .join('; ');
}

function sanitizeRichTextHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');

    const allowedTags = new Set([
        'a',
        'b',
        'blockquote',
        'br',
        'code',
        'div',
        'em',
        'h2',
        'h3',
        'h4',
        'h5',
        'hr',
        'i',
        'img',
        'li',
        'ol',
        'p',
        'pre',
        's',
        'span',
        'strong',
        'table',
        'tbody',
        'td',
        'tfoot',
        'th',
        'thead',
        'tr',
        'u',
        'ul'
    ]);
    const removableTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']);

    const sanitizeElement = (element) => {
        const tagName = element.tagName.toLowerCase();

        Array.from(element.childNodes).forEach((child) => {
            if (child.nodeType === Node.ELEMENT_NODE) {
                sanitizeElement(child);
            } else if (child.nodeType !== Node.TEXT_NODE) {
                child.remove();
            }
        });

        if (removableTags.has(tagName)) {
            element.remove();
            return;
        }

        if (!allowedTags.has(tagName)) {
            element.replaceWith(...Array.from(element.childNodes));
            return;
        }

        Array.from(element.attributes).forEach((attribute) => {
            const name = attribute.name.toLowerCase();
            const rawValue = attribute.value;

            if (name.startsWith('on')) {
                element.removeAttribute(attribute.name);
                return;
            }

            if (name === 'style') {
                const safeStyle = sanitizeStyleAttribute(rawValue);
                if (safeStyle) {
                    element.setAttribute('style', safeStyle);
                } else {
                    element.removeAttribute(attribute.name);
                }
                return;
            }

            if (tagName === 'a' && name === 'href') {
                const safeHref = normalizeMarkdownHref(rawValue);
                if (safeHref) {
                    element.setAttribute('href', safeHref);
                    if (!safeHref.startsWith('/') && !safeHref.startsWith('#')) {
                        element.setAttribute('target', '_blank');
                        element.setAttribute('rel', 'noopener noreferrer');
                    }
                } else {
                    element.removeAttribute(attribute.name);
                }
                return;
            }

            if (tagName === 'img' && name === 'src') {
                const safeSrc = normalizeMediaSrc(rawValue);
                if (safeSrc) {
                    element.setAttribute('src', safeSrc);
                } else {
                    element.removeAttribute(attribute.name);
                }
                return;
            }

            if (tagName === 'img' && ['alt', 'title'].includes(name)) return;
            if (['td', 'th'].includes(tagName) && ['colspan', 'rowspan'].includes(name) && /^\d{1,2}$/.test(rawValue)) return;

            element.removeAttribute(attribute.name);
        });
    };

    Array.from(template.content.childNodes).forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
            sanitizeElement(child);
        } else if (child.nodeType !== Node.TEXT_NODE) {
            child.remove();
        }
    });

    return template.innerHTML.trim();
}

function renderInlineMarkdown(value) {
    const codeTokens = [];
    let text = escapeHtml(value);

    text = text.replace(/`([^`]+)`/g, (_, content) => {
        const token = `%%PLINCODE${codeTokens.length}%%`;
        codeTokens.push(`<code>${content}</code>`);
        return token;
    });

    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
        const safeHref = normalizeMarkdownHref(href);
        if (!safeHref) return label;
        const target = safeHref.startsWith('/') || safeHref.startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer"';
        return `<a href="${escapeHtml(safeHref)}"${target}>${label}</a>`;
    });

    text = text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>');

    codeTokens.forEach((html, index) => {
        text = text.replaceAll(`%%PLINCODE${index}%%`, html);
    });

    return text;
}

function renderMarkdown(value) {
    const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
    const html = [];
    let paragraph = [];
    let quote = [];
    let listType = '';
    let listItems = [];
    let inCodeFence = false;
    let codeFenceLines = [];

    const flushParagraph = () => {
        if (!paragraph.length) return;
        html.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`);
        paragraph = [];
    };

    const flushQuote = () => {
        if (!quote.length) return;
        html.push(`<blockquote>${quote.map(renderInlineMarkdown).join('<br>')}</blockquote>`);
        quote = [];
    };

    const flushList = () => {
        if (!listType || !listItems.length) return;
        html.push(`<${listType}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${listType}>`);
        listType = '';
        listItems = [];
    };

    const flushOpenBlocks = () => {
        flushParagraph();
        flushQuote();
        flushList();
    };

    lines.forEach((line) => {
        if (/^\s*```/.test(line)) {
            if (inCodeFence) {
                html.push(`<pre><code>${escapeHtml(codeFenceLines.join('\n'))}</code></pre>`);
                codeFenceLines = [];
                inCodeFence = false;
            } else {
                flushOpenBlocks();
                inCodeFence = true;
            }
            return;
        }

        if (inCodeFence) {
            codeFenceLines.push(line);
            return;
        }

        if (!line.trim()) {
            flushOpenBlocks();
            return;
        }

        const heading = /^(#{1,3})\s+(.+)$/.exec(line);
        if (heading) {
            flushOpenBlocks();
            const level = heading[1].length + 2;
            html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
            return;
        }

        if (/^\s*---+\s*$/.test(line)) {
            flushOpenBlocks();
            html.push('<hr>');
            return;
        }

        const quoteMatch = /^>\s?(.*)$/.exec(line);
        if (quoteMatch) {
            flushParagraph();
            flushList();
            quote.push(quoteMatch[1]);
            return;
        }

        const unordered = /^\s*[-*]\s+(.+)$/.exec(line);
        const ordered = /^\s*\d+\.\s+(.+)$/.exec(line);
        if (unordered || ordered) {
            flushParagraph();
            flushQuote();
            const nextType = unordered ? 'ul' : 'ol';
            if (listType && listType !== nextType) flushList();
            listType = nextType;
            listItems.push((unordered || ordered)[1]);
            return;
        }

        flushQuote();
        flushList();
        paragraph.push(line);
    });

    if (inCodeFence) {
        html.push(`<pre><code>${escapeHtml(codeFenceLines.join('\n'))}</code></pre>`);
    }

    flushOpenBlocks();
    return html.join('');
}

function isDarkThemeActive() {
    return document.documentElement.classList.contains('dark')
        || document.documentElement.dataset.theme === 'dark';
}

function getNoticeEditorContentStyle() {
    const isDark = isDarkThemeActive();
    const ink = isDark ? '#f3f4f5' : '#1a1c20';
    const softInk = isDark ? '#b0b3ba' : '#374151';
    const surface = isDark ? '#25272c' : '#ffffff';
    const muted = isDark ? '#2c2e34' : '#f3f4f5';
    const border = isDark ? '#3e4145' : '#dcdee3';

    return `
        body {
            margin: 18px;
            background: ${surface};
            color: ${softInk};
            font-family: Pretendard, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 15px;
            line-height: 1.75;
            word-break: keep-all;
        }
        h2, h3, h4 { color: ${ink}; line-height: 1.35; }
        h2 { font-size: 24px; }
        h3 { font-size: 20px; }
        h4 { font-size: 17px; }
        a { color: #ff6600; font-weight: 800; text-decoration: underline; text-underline-offset: 3px; }
        blockquote {
            margin-left: 0;
            border-left: 3px solid #ff6600;
            border-radius: 8px;
            background: ${muted};
            color: ${ink};
            padding: 10px 12px;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid ${border}; padding: 8px 10px; }
        th { background: ${muted}; color: ${ink}; }
        code { border-radius: 6px; background: ${muted}; color: ${ink}; padding: 2px 5px; }
        img { max-width: 100%; height: auto; border-radius: 12px; }
    `;
}

async function initRichTextEditor() {
    if (!els.body) return null;
    if (noticeEditor) return noticeEditor;
    if (noticeEditorInitPromise) return noticeEditorInitPromise;

    noticeEditorInitPromise = tinymce.init({
        target: els.body,
        license_key: 'gpl',
        menubar: false,
        branding: false,
        promotion: false,
        skin: false,
        content_css: false,
        height: 420,
        min_height: 320,
        max_height: 720,
        resize: true,
        statusbar: true,
        plugins: 'advlist autolink autoresize code fullscreen image link lists preview table wordcount',
        toolbar: [
            'undo redo | blocks | bold italic underline strikethrough | forecolor backcolor',
            'alignleft aligncenter alignright | bullist numlist | outdent indent',
            'link image table | removeformat | preview code fullscreen'
        ].join(' | '),
        block_formats: '본문=p;제목 2=h2;제목 3=h3;제목 4=h4;인용=blockquote',
        placeholder: '공지 내용을 입력하세요.',
        link_default_target: '_blank',
        link_assume_external_targets: 'https',
        image_advtab: true,
        automatic_uploads: false,
        paste_data_images: false,
        content_style: getNoticeEditorContentStyle(),
        setup(editor) {
            editor.on('init', () => {
                noticeEditor = editor;
            });
            editor.on('change keyup undo redo setcontent', () => {
                editor.save();
            });
        }
    }).then((editors) => {
        noticeEditor = editors[0] || null;
        return noticeEditor;
    }).finally(() => {
        noticeEditorInitPromise = null;
    });

    return noticeEditorInitPromise;
}

function setRichTextEditorContent(value = '') {
    const html = String(value || '');
    if (noticeEditor) {
        noticeEditor.setContent(html);
        noticeEditor.save();
    } else if (els.body) {
        els.body.value = html;
    }
}

function getRichTextEditorContent() {
    if (noticeEditor) {
        noticeEditor.save();
        return noticeEditor.getContent({ format: 'html' });
    }
    return String(els.body?.value || '');
}

function getRichTextEditorText(html) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeRichTextHtml(html);
    return String(template.content.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasMeaningfulRichText(html) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeRichTextHtml(html);
    const text = String(template.content.textContent || '').replace(/\s+/g, '').trim();
    return Boolean(text || template.content.querySelector('img[src]'));
}

function setRichTextEditorBusy(isBusy) {
    try {
        noticeEditor?.mode?.set(isBusy ? 'readonly' : 'design');
    } catch (error) {
        console.warn('공지 편집기 상태 변경 실패:', error);
    }
}

function formatNoticeDate(value) {
    const date = typeof value?.toDate === 'function' ? value.toDate() : null;
    if (!date || Number.isNaN(date.getTime())) {
        return '방금 전';
    }

    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function normalizeNoticeDoc(snapshot) {
    const data = snapshot.data() || {};
    const bodyHtml = String(data.bodyHtml || '').trim();
    return {
        id: snapshot.id,
        title: String(data.title || '').trim(),
        body: String(data.body || '').trim(),
        bodyHtml,
        bodyFormat: bodyHtml ? 'html' : 'markdown',
        category: String(data.category || '공지').trim() || '공지',
        pinned: data.pinned === true,
        createdAt: data.createdAt || data.updatedAt || null,
        updatedAt: data.updatedAt || null,
        authorName: String(data.authorName || '').trim()
    };
}

function setAdminStatus(message = '', tone = 'info') {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.dataset.tone = tone;
}

function setFormBusy(isBusy) {
    if (els.submit) {
        els.submit.disabled = isBusy;
    }
    if (els.cancelEdit) {
        els.cancelEdit.disabled = isBusy;
    }
    setRichTextEditorBusy(isBusy);
}

function resetNoticeForm() {
    els.form?.reset();
    if (els.editId) els.editId.value = '';
    if (els.submit) els.submit.textContent = '공지 등록';
    if (els.editorTitle) els.editorTitle.textContent = '공지 작성';
    setRichTextEditorContent('');
    setAdminStatus('');
}

function getNoticeEditableHtml(notice) {
    if (!notice) return '';
    return notice.bodyHtml ? sanitizeRichTextHtml(notice.bodyHtml) : renderMarkdown(notice.body);
}

async function openNoticeEditor(notice = null) {
    if (!state.isAdmin || !state.currentUser) return;

    resetNoticeForm();
    setNoticeEditorVisible(true);
    await initRichTextEditor();

    if (els.editId) els.editId.value = notice?.id || '';
    if (els.category) els.category.value = notice?.category || '공지';
    if (els.title) els.title.value = notice?.title || '';
    setRichTextEditorContent(getNoticeEditableHtml(notice));
    if (els.pinned) els.pinned.checked = notice?.pinned === true;
    if (els.submit) els.submit.textContent = notice ? '공지 수정' : '공지 등록';
    if (els.editorTitle) els.editorTitle.textContent = notice ? '공지 수정' : '공지 작성';

    setAdminStatus(notice ? '공지 내용을 수정하고 저장하세요.' : '');
    els.title?.focus({ preventScroll: true });
}

function closeNoticeEditor() {
    resetNoticeForm();
    setNoticeEditorVisible(false);
    window.requestAnimationFrame(() => {
        els.listSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function buildNoticeCard(notice) {
    const dateLabel = formatNoticeDate(notice.updatedAt || notice.createdAt);
    const authorLabel = notice.authorName ? ` · ${escapeHtml(notice.authorName)}` : '';
    const pinnedBadge = notice.pinned ? '<span class="notice-pin-badge">상단 고정</span>' : '';
    const bodyHtml = notice.bodyHtml ? sanitizeRichTextHtml(notice.bodyHtml) : renderMarkdown(notice.body);
    const adminActions = state.isAdmin
        ? `
            <div class="notice-card-actions">
                <button type="button" data-notice-action="edit" data-notice-id="${escapeHtml(notice.id)}">수정</button>
                <button type="button" data-notice-action="delete" data-notice-id="${escapeHtml(notice.id)}">삭제</button>
            </div>
        `
        : '';

    return `
        <article class="notice-card ${notice.pinned ? 'is-pinned' : ''}">
            <div class="notice-card-head">
                <div>
                    <div class="notice-card-meta">
                        <span>${escapeHtml(notice.category)}</span>
                        ${pinnedBadge}
                    </div>
                    <h3>${escapeHtml(notice.title)}</h3>
                </div>
                ${adminActions}
            </div>
            <div class="notice-card-body notice-markdown">${bodyHtml}</div>
            <p class="notice-card-date">${dateLabel}${authorLabel}</p>
        </article>
    `;
}

function renderNoticeList() {
    if (!els.list) return;

    if (!state.notices.length) {
        els.list.innerHTML = `
            <article class="notice-empty-card">
                <strong>아직 등록된 공지가 없습니다.</strong>
                <p>서비스 공지와 업데이트가 생기면 이곳에 안내할게요.</p>
            </article>
        `;
        return;
    }

    const notices = [...state.notices].sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        const leftTime = left.createdAt?.toMillis?.() || 0;
        const rightTime = right.createdAt?.toMillis?.() || 0;
        return rightTime - leftTime;
    });

    els.list.innerHTML = notices.map(buildNoticeCard).join('');
}

async function loadNotices() {
    if (!els.list) return;

    els.refresh?.setAttribute('disabled', 'true');
    els.list.innerHTML = `
        <article class="notice-loading-card">
            <strong>공지사항을 불러오는 중입니다.</strong>
            <p>잠시만 기다려 주세요.</p>
        </article>
    `;

    try {
        await firebaseReady;
        const snapshot = await getDocs(query(
            noticesRef,
            orderBy('createdAt', 'desc'),
            limit(NOTICE_LIMIT)
        ));
        state.notices = snapshot.docs.map(normalizeNoticeDoc);
        renderNoticeList();
    } catch (error) {
        console.error('공지사항 조회 실패:', error);
        els.list.innerHTML = `
            <article class="notice-empty-card is-error">
                <strong>공지사항을 불러오지 못했습니다.</strong>
                <p>잠시 후 다시 시도해 주세요.</p>
            </article>
        `;
    } finally {
        els.refresh?.removeAttribute('disabled');
    }
}

async function readAdminState(user) {
    state.currentUser = user || null;
    state.isAdmin = false;

    if (!user) {
        resetNoticeForm();
        setNoticeEditorVisible(false);
        renderNoticeList();
        return;
    }

    const editorWasOpen = els.adminPanel && !els.adminPanel.classList.contains('hidden');

    let isTokenAdmin = false;
    try {
        const tokenResult = await user.getIdTokenResult();
        isTokenAdmin = tokenResult?.claims?.admin === true;
    } catch {}

    try {
        const profile = await fetchUserProfile(user.uid);
        const role = String(profile.data()?.role || '').trim().toLowerCase();
        state.isAdmin = isTokenAdmin || role === 'admin';
    } catch (error) {
        console.warn('관리자 권한 확인 실패:', error);
        state.isAdmin = isTokenAdmin;
    }

    setNoticeEditorVisible(state.isAdmin && editorWasOpen);
    renderNoticeList();
}

function readFormValues() {
    const bodyHtml = sanitizeRichTextHtml(getRichTextEditorContent());
    const bodyText = getRichTextEditorText(bodyHtml);
    return {
        category: String(els.category?.value || '공지').trim() || '공지',
        title: String(els.title?.value || '').trim(),
        body: bodyText,
        bodyHtml,
        pinned: els.pinned?.checked === true
    };
}

async function handleNoticeSubmit(event) {
    event.preventDefault();
    if (!state.isAdmin || !state.currentUser) {
        setAdminStatus('관리자 계정으로 로그인해야 공지를 작성할 수 있습니다.', 'error');
        return;
    }

    const values = readFormValues();
    const editId = String(els.editId?.value || '').trim();

    if (!values.title || !values.bodyHtml || !hasMeaningfulRichText(values.bodyHtml)) {
        setAdminStatus('제목과 내용을 입력해 주세요.', 'error');
        return;
    }

    if (values.bodyHtml.length > NOTICE_BODY_HTML_LIMIT) {
        setAdminStatus('공지 내용이 너무 깁니다. 이미지와 표를 줄인 뒤 다시 저장해 주세요.', 'error');
        return;
    }

    try {
        setFormBusy(true);
        setAdminStatus(editId ? '공지 수정 중입니다.' : '공지 등록 중입니다.');

        const payload = {
            ...values,
            bodyFormat: 'html',
            authorUid: state.currentUser.uid,
            authorName: state.currentUser.displayName || state.currentUser.email || 'PLIN',
            updatedAt: serverTimestamp()
        };

        if (editId) {
            await updateDoc(doc(db, 'notices', editId), payload);
            setAdminStatus('공지 수정이 완료되었습니다.', 'success');
        } else {
            await addDoc(noticesRef, {
                ...payload,
                createdAt: serverTimestamp()
            });
            setAdminStatus('공지 등록이 완료되었습니다.', 'success');
        }

        closeNoticeEditor();
        await loadNotices();
    } catch (error) {
        console.error('공지 저장 실패:', error);
        setAdminStatus('공지 저장에 실패했습니다. 권한 또는 네트워크를 확인해 주세요.', 'error');
    } finally {
        setFormBusy(false);
    }
}

function startEditNotice(noticeId) {
    const notice = state.notices.find((entry) => entry.id === noticeId);
    if (!notice) return;

    openNoticeEditor(notice);
}

async function deleteNotice(noticeId) {
    if (!state.isAdmin) return;
    const notice = state.notices.find((entry) => entry.id === noticeId);
    const label = notice?.title ? `"${notice.title}" 공지를 삭제할까요?` : '이 공지를 삭제할까요?';
    if (!window.confirm(label)) return;

    try {
        await deleteDoc(doc(db, 'notices', noticeId));
        resetNoticeForm();
        await loadNotices();
    } catch (error) {
        console.error('공지 삭제 실패:', error);
        setAdminStatus('공지 삭제에 실패했습니다.', 'error');
    }
}

function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    els.form?.addEventListener('submit', handleNoticeSubmit);
    els.write?.addEventListener('click', () => openNoticeEditor());
    els.cancelEdit?.addEventListener('click', closeNoticeEditor);
    els.refresh?.addEventListener('click', loadNotices);
    els.list?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-notice-action]');
        if (!button) return;

        const noticeId = button.dataset.noticeId || '';
        if (button.dataset.noticeAction === 'edit') {
            startEditNotice(noticeId);
        } else if (button.dataset.noticeAction === 'delete') {
            deleteNotice(noticeId);
        }
    });
}

async function runNoticesInit() {
    if (!els.list) return;

    bindEvents();
    setNoticeEditorVisible(false);
    await loadNotices();

    if (authObserverStarted) return;
    authObserverStarted = true;

    try {
        await firebaseReady;
        assertAuthServicesReady();
        observeAuthState(readAdminState);
    } catch (error) {
        console.warn('공지사항 관리자 상태 초기화 실패:', error);
    }
}

export function initNoticesPage() {
    if (initPromise) return initPromise;
    initPromise = runNoticesInit().finally(() => {
        initPromise = null;
    });
    return initPromise;
}

if (document.getElementById('notice-list')) {
    initNoticesPage();
}

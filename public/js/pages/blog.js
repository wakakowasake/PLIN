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
import {
    getDownloadURL,
    ref as storageRef,
    uploadBytes
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';
import { firebaseReady, db, storage } from '../services/firebase/firebase-app.js';
import { assertAuthServicesReady, observeAuthState } from '../services/firebase/auth-service.js';
import { fetchUserProfile } from '../services/firebase/profile-repository.js';

const BLOG_LIMIT = 50;
const BLOG_BODY_HTML_LIMIT = 30000;
const BLOG_COVER_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_BLOG_COVER_IMAGE = '/images/trip-destinations/aewol.jpg';
const BLOG_COVER_ALLOWED_TYPES = new Set([
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp'
]);
const BLOG_ADMIN_EMAILS = new Set([
    'contact@plin.ink',
    'plin.ink@gmail.com'
]);
const blogPostsRef = collection(db, 'blogPosts');

const els = {
    adminPanel: document.getElementById('blog-admin-panel'),
    listSection: document.getElementById('blog-list-section'),
    form: document.getElementById('blog-form'),
    editId: document.getElementById('blog-edit-id'),
    category: document.getElementById('blog-category'),
    title: document.getElementById('blog-title-input'),
    cover: document.getElementById('blog-cover-input'),
    coverFile: document.getElementById('blog-cover-file-input'),
    coverPreview: document.getElementById('blog-cover-preview'),
    coverPreviewImage: document.getElementById('blog-cover-preview-image'),
    coverClear: document.getElementById('blog-cover-clear-btn'),
    summary: document.getElementById('blog-summary-input'),
    body: document.getElementById('blog-body-input'),
    featured: document.getElementById('blog-featured-input'),
    submit: document.getElementById('blog-submit-btn'),
    cancelEdit: document.getElementById('blog-cancel-edit-btn'),
    write: document.getElementById('blog-write-btn'),
    editorTitle: document.getElementById('blog-admin-title'),
    status: document.getElementById('blog-admin-status'),
    list: document.getElementById('blog-list'),
    refresh: document.getElementById('blog-refresh-btn'),
    detailSection: document.getElementById('blog-detail-section'),
    detailContent: document.getElementById('blog-detail-content'),
    detailBack: document.getElementById('blog-detail-back-btn')
};

const state = {
    isAdmin: false,
    currentUser: null,
    posts: [],
    selectedPostId: ''
};

let eventsBound = false;
let authObserverStarted = false;
let initPromise = null;
let blogEditor = null;
let blogEditorInitPromise = null;
let coverPreviewObjectUrl = '';
let openWriterFromUrl = new URLSearchParams(window.location.search).get('write') === '1';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeMediaSrc(value) {
    const src = String(value || '').trim();
    if (!src) return '';
    if (src.startsWith('/')) return src;
    if (/^https?:\/\//i.test(src)) return src;
    return '';
}

function normalizeHref(value) {
    const href = String(value || '').trim();
    if (!href) return '';
    if (href.startsWith('/') || href.startsWith('#')) return href;
    if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
    return '';
}

function sanitizeRichTextHtml(html) {
    const source = String(html || '').trim();
    if (!source) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'text/html');
    const allowedTags = new Set([
        'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'FIGURE', 'FIGCAPTION',
        'H1', 'H2', 'H3', 'H4', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE',
        'SPAN', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL'
    ]);
    const allowedAttrs = new Set(['href', 'target', 'rel', 'src', 'alt', 'title', 'colspan', 'rowspan']);

    const walk = (node) => {
        Array.from(node.children).forEach((child) => {
            if (!allowedTags.has(child.tagName)) {
                child.replaceWith(...Array.from(child.childNodes));
                return;
            }

            Array.from(child.attributes).forEach((attr) => {
                if (!allowedAttrs.has(attr.name.toLowerCase())) {
                    child.removeAttribute(attr.name);
                }
            });

            if (child.tagName === 'A') {
                const href = normalizeHref(child.getAttribute('href'));
                if (!href) {
                    child.removeAttribute('href');
                } else {
                    child.setAttribute('href', href);
                    child.setAttribute('target', '_blank');
                    child.setAttribute('rel', 'noopener noreferrer');
                }
            }

            if (child.tagName === 'IMG') {
                const src = normalizeMediaSrc(child.getAttribute('src'));
                if (!src) {
                    child.remove();
                    return;
                }
                child.setAttribute('src', src);
                child.setAttribute('loading', 'lazy');
            }

            walk(child);
        });
    };

    walk(doc.body);
    return doc.body.innerHTML.trim();
}

function getPlainTextFromHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return String(doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function hasMeaningfulRichText(html) {
    return getPlainTextFromHtml(html).length > 0 || /<img\s/i.test(String(html || ''));
}

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^\w가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 90);
}

function formatPostDate(value) {
    const date = value?.toDate ? value.toDate() : (value instanceof Date ? value : null);
    if (!date) return '';
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function setAdminStatus(message = '', type = 'info') {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.dataset.type = type;
}

function revokeCoverPreviewObjectUrl() {
    if (!coverPreviewObjectUrl) return;
    URL.revokeObjectURL(coverPreviewObjectUrl);
    coverPreviewObjectUrl = '';
}

function normalizeCoverPreviewSrc(value) {
    const src = String(value || '').trim();
    if (src.startsWith('blob:') || /^data:image\//i.test(src)) return src;
    return normalizeMediaSrc(src);
}

function setCoverPreview(value = '') {
    const src = normalizeCoverPreviewSrc(value);
    if (els.coverPreviewImage) els.coverPreviewImage.src = src || '';
    els.coverPreview?.classList.toggle('hidden', !src);
}

function resetCoverInput() {
    revokeCoverPreviewObjectUrl();
    if (els.cover) els.cover.value = '';
    if (els.coverFile) els.coverFile.value = '';
    setCoverPreview('');
}

function getSelectedCoverFile() {
    return els.coverFile?.files?.[0] || null;
}

function validateCoverFile(file) {
    if (!file) return '';
    if (!BLOG_COVER_ALLOWED_TYPES.has(file.type)) {
        return '대표 이미지는 JPG, PNG, WebP, GIF 파일만 올릴 수 있습니다.';
    }
    if (file.size > BLOG_COVER_MAX_BYTES) {
        return '대표 이미지는 5MB 이하 파일로 올려 주세요.';
    }
    return '';
}

function getCoverFileExtension(file) {
    const typeMap = {
        'image/gif': 'gif',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    };
    if (typeMap[file.type]) return typeMap[file.type];
    const extension = String(file.name || '').split('.').pop()?.toLowerCase();
    return extension && /^[a-z0-9]{2,5}$/.test(extension) ? extension : 'jpg';
}

function handleCoverFileChange() {
    const file = getSelectedCoverFile();
    const validationMessage = validateCoverFile(file);
    if (validationMessage) {
        if (els.coverFile) els.coverFile.value = '';
        setAdminStatus(validationMessage, 'error');
        return;
    }

    if (!file) return;
    revokeCoverPreviewObjectUrl();
    coverPreviewObjectUrl = URL.createObjectURL(file);
    setCoverPreview(coverPreviewObjectUrl);
    setAdminStatus('대표 이미지는 저장할 때 업로드됩니다.');
}

async function resolveCoverImage() {
    const file = getSelectedCoverFile();
    const validationMessage = validateCoverFile(file);
    if (validationMessage) {
        throw new Error(validationMessage);
    }

    if (!file) {
        return normalizeMediaSrc(els.cover?.value || DEFAULT_BLOG_COVER_IMAGE);
    }

    if (!state.currentUser?.uid) {
        throw new Error('로그인 후 대표 이미지를 올릴 수 있습니다.');
    }

    const extension = getCoverFileExtension(file);
    const fileName = `cover_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const imageRef = storageRef(storage, `blog-covers/${state.currentUser.uid}/${fileName}`);
    const snapshot = await uploadBytes(imageRef, file, {
        contentType: file.type || 'image/jpeg',
        customMetadata: {
            feature: 'blog-cover'
        }
    });
    const url = await getDownloadURL(snapshot.ref);
    if (els.cover) els.cover.value = url;
    if (els.coverFile) els.coverFile.value = '';
    revokeCoverPreviewObjectUrl();
    setCoverPreview(url);
    return url;
}

function setBlogEditorVisible(isVisible) {
    els.adminPanel?.classList.toggle('hidden', !isVisible);
    els.listSection?.classList.toggle('hidden', isVisible);
    els.detailSection?.classList.add('hidden');
    els.write?.classList.toggle('hidden', isVisible || !state.isAdmin);
    if (isVisible) {
        window.requestAnimationFrame(() => {
            els.adminPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
}

async function ensureBlogEditor() {
    if (blogEditor) return blogEditor;
    if (blogEditorInitPromise) return blogEditorInitPromise;

    blogEditorInitPromise = tinymce.init({
        selector: '#blog-body-input',
        menubar: false,
        branding: false,
        promotion: false,
        license_key: 'gpl',
        plugins: 'advlist autolink autoresize code fullscreen image link lists preview table wordcount',
        toolbar: 'undo redo | blocks | bold italic underline | bullist numlist blockquote | link image table | preview fullscreen code',
        min_height: 360,
        max_height: 720,
        autoresize_bottom_margin: 16,
        language: 'ko_KR',
        content_style: 'body { font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 16px; line-height: 1.7; color: #1a1c20; } img { max-width: 100%; height: auto; }',
        image_caption: true,
        convert_urls: false,
        setup(editor) {
            editor.on('init', () => {
                blogEditor = editor;
            });
        }
    }).then((editors) => {
        blogEditor = editors[0] || null;
        return blogEditor;
    }).finally(() => {
        blogEditorInitPromise = null;
    });

    return blogEditorInitPromise;
}

function setRichTextEditorContent(html = '') {
    if (blogEditor) {
        blogEditor.setContent(html);
        blogEditor.save();
    } else if (els.body) {
        els.body.value = html;
    }
}

function getRichTextEditorContent() {
    if (blogEditor) {
        blogEditor.save();
        return blogEditor.getContent({ format: 'html' });
    }
    return els.body?.value || '';
}

function setFormBusy(isBusy) {
    [els.category, els.title, els.coverFile, els.coverClear, els.summary, els.body, els.featured, els.submit]
        .forEach((element) => {
            if (!element) return;
            if (isBusy) element.setAttribute('disabled', 'disabled');
            else element.removeAttribute('disabled');
        });

    try {
        blogEditor?.mode?.set(isBusy ? 'readonly' : 'design');
    } catch {}
}

function resetBlogForm() {
    els.form?.reset();
    if (els.editId) els.editId.value = '';
    resetCoverInput();
    setRichTextEditorContent('');
    if (els.submit) els.submit.textContent = '글 발행';
    if (els.editorTitle) els.editorTitle.textContent = '블로그 작성';
    setAdminStatus('');
}

function normalizePostDoc(snapshot) {
    const data = snapshot.data() || {};
    const bodyHtml = sanitizeRichTextHtml(data.bodyHtml || '');
    return {
        id: snapshot.id,
        title: String(data.title || '제목 없는 글').trim(),
        slug: String(data.slug || snapshot.id).trim(),
        category: String(data.category || 'Product Note').trim(),
        summary: String(data.summary || getPlainTextFromHtml(bodyHtml).slice(0, 120)).trim(),
        coverImage: normalizeMediaSrc(data.coverImage || DEFAULT_BLOG_COVER_IMAGE),
        bodyHtml,
        featured: data.featured === true,
        authorName: '관리자',
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        publishedAt: data.publishedAt || data.createdAt || null
    };
}

function getPostEditableHtml(post) {
    return post?.bodyHtml ? sanitizeRichTextHtml(post.bodyHtml) : '';
}

async function openBlogEditor(post = null) {
    if (!state.isAdmin) {
        setAdminStatus('이 계정에서는 블로그를 작성할 수 없습니다.', 'error');
        return;
    }

    setBlogEditorVisible(true);
    await ensureBlogEditor();

    if (els.editId) els.editId.value = post?.id || '';
    if (els.category) els.category.value = post?.category || 'Product Note';
    if (els.title) els.title.value = post?.title || '';
    if (els.cover) els.cover.value = post?.coverImage || '';
    if (els.coverFile) els.coverFile.value = '';
    revokeCoverPreviewObjectUrl();
    setCoverPreview(post?.coverImage || '');
    if (els.summary) els.summary.value = post?.summary || '';
    if (els.featured) els.featured.checked = post?.featured === true;
    setRichTextEditorContent(getPostEditableHtml(post));
    if (els.submit) els.submit.textContent = post ? '글 수정' : '글 발행';
    if (els.editorTitle) els.editorTitle.textContent = post ? '블로그 수정' : '블로그 작성';
    setAdminStatus(post ? '블로그 글을 수정하고 저장하세요.' : '');
    els.title?.focus({ preventScroll: true });
}

function closeBlogEditor() {
    resetBlogForm();
    setBlogEditorVisible(false);
    window.requestAnimationFrame(() => {
        els.listSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function buildAdminActions(postId) {
    if (!state.isAdmin) return '';
    return `
        <div class="notice-card-actions">
            <button type="button" data-blog-action="edit" data-blog-id="${escapeHtml(postId)}">수정</button>
            <button type="button" data-blog-action="delete" data-blog-id="${escapeHtml(postId)}">삭제</button>
        </div>
    `;
}

function buildBlogCard(post) {
    const dateLabel = formatPostDate(post.publishedAt || post.updatedAt || post.createdAt);
    return `
        <article class="blog-card">
            <button type="button" class="blog-card-button" data-blog-action="view" data-blog-id="${escapeHtml(post.id)}">
                <div class="blog-card-image">
                    <img src="${escapeHtml(post.coverImage)}" alt="">
                </div>
                <div class="blog-card-copy">
                    <p class="blog-kicker">${escapeHtml(post.category)}</p>
                    <h2>${escapeHtml(post.title)}</h2>
                    <p>${escapeHtml(post.summary)}</p>
                    <span class="blog-meta">${escapeHtml(dateLabel || 'PLIN Blog')}</span>
                </div>
            </button>
            ${buildAdminActions(post.id)}
        </article>
    `;
}

function buildBlogDetail(post) {
    const dateLabel = formatPostDate(post.publishedAt || post.updatedAt || post.createdAt);
    return `
        <article class="notice-detail-card ${post.featured ? 'is-pinned' : ''}">
            <div class="notice-detail-head">
                <div class="notice-detail-copy">
                    <div class="notice-card-meta">
                        <span>${escapeHtml(post.category)}</span>
                        ${post.featured ? '<span class="notice-pin-badge">대표 글</span>' : ''}
                    </div>
                    <h2>${escapeHtml(post.title)}</h2>
                    <p class="notice-card-date">${escapeHtml(dateLabel)} · 관리자</p>
                </div>
                ${buildAdminActions(post.id)}
            </div>
            ${post.coverImage ? `<div class="blog-feature-image"><img src="${escapeHtml(post.coverImage)}" alt=""></div>` : ''}
            <div class="notice-detail-body notice-markdown">${post.bodyHtml}</div>
        </article>
    `;
}

function renderBlogList() {
    if (!els.list) return;
    if (!state.posts.length) {
        els.list.innerHTML = `
            <article class="notice-empty-card">
                <strong>아직 발행된 블로그 글이 없습니다.</strong>
                <p>새 글을 준비하고 있습니다.</p>
            </article>
        `;
        return;
    }

    const posts = [...state.posts].sort((left, right) => {
        if (left.featured !== right.featured) return left.featured ? -1 : 1;
        const leftMs = (left.publishedAt?.toDate?.() || left.updatedAt?.toDate?.() || new Date(0)).getTime();
        const rightMs = (right.publishedAt?.toDate?.() || right.updatedAt?.toDate?.() || new Date(0)).getTime();
        return rightMs - leftMs;
    });
    els.list.innerHTML = posts.map(buildBlogCard).join('');
}

function openBlogDetail(postId) {
    const post = state.posts.find((entry) => entry.id === postId);
    if (!post || !els.detailContent) return;

    state.selectedPostId = postId;
    els.detailContent.innerHTML = buildBlogDetail(post);
    els.listSection?.classList.add('hidden');
    els.adminPanel?.classList.add('hidden');
    els.detailSection?.classList.remove('hidden');
    els.detailSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeBlogDetail() {
    state.selectedPostId = '';
    els.detailSection?.classList.add('hidden');
    els.listSection?.classList.remove('hidden');
    els.write?.classList.toggle('hidden', !state.isAdmin);
    els.listSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadBlogPosts() {
    if (!els.list) return;
    els.refresh?.setAttribute('disabled', 'disabled');
    els.list.innerHTML = `
        <article class="notice-loading-card">
            <strong>블로그 글을 불러오는 중입니다.</strong>
            <p>잠시만 기다려 주세요.</p>
        </article>
    `;

    try {
        const snapshot = await getDocs(query(blogPostsRef, orderBy('updatedAt', 'desc'), limit(BLOG_LIMIT)));
        state.posts = snapshot.docs.map(normalizePostDoc);
        if (state.selectedPostId) {
            const stillExists = state.posts.some((post) => post.id === state.selectedPostId);
            if (stillExists) openBlogDetail(state.selectedPostId);
            else closeBlogDetail();
        } else {
            renderBlogList();
        }
    } catch (error) {
        console.error('블로그 조회 실패:', error);
        els.list.innerHTML = `
            <article class="notice-empty-card is-error">
                <strong>블로그 글을 불러오지 못했습니다.</strong>
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
        resetBlogForm();
        setBlogEditorVisible(false);
        renderBlogList();
        return;
    }

    const editorWasOpen = els.adminPanel && !els.adminPanel.classList.contains('hidden');
    const isEmailAdmin = user.emailVerified === true
        && BLOG_ADMIN_EMAILS.has(String(user.email || '').trim().toLowerCase());
    let isTokenAdmin = false;

    try {
        const tokenResult = await user.getIdTokenResult();
        isTokenAdmin = tokenResult?.claims?.admin === true;
    } catch {}

    try {
        const profile = await fetchUserProfile(user.uid);
        const role = String(profile.data()?.role || '').trim().toLowerCase();
        state.isAdmin = isTokenAdmin || isEmailAdmin || role === 'admin';
    } catch (error) {
        console.warn('블로그 작성 권한 확인 실패:', error);
        state.isAdmin = isTokenAdmin || isEmailAdmin;
    }

    setBlogEditorVisible(state.isAdmin && editorWasOpen);
    renderBlogList();

    if (state.isAdmin && openWriterFromUrl) {
        openWriterFromUrl = false;
        openBlogEditor();
    }
}

function readFormValues() {
    const bodyHtml = sanitizeRichTextHtml(getRichTextEditorContent());
    const bodyText = getPlainTextFromHtml(bodyHtml);
    const title = String(els.title?.value || '').trim();
    return {
        category: String(els.category?.value || 'Product Note').trim() || 'Product Note',
        title,
        slug: slugify(title) || `post-${Date.now()}`,
        summary: String(els.summary?.value || bodyText.slice(0, 140)).trim(),
        bodyHtml,
        body: bodyText,
        featured: els.featured?.checked === true
    };
}

async function handleBlogSubmit(event) {
    event.preventDefault();
    if (!state.isAdmin || !state.currentUser) {
        setAdminStatus('이 계정에서는 블로그를 작성할 수 없습니다.', 'error');
        return;
    }

    const values = readFormValues();
    const editId = String(els.editId?.value || '').trim();

    if (!values.title || !values.bodyHtml || !hasMeaningfulRichText(values.bodyHtml)) {
        setAdminStatus('제목과 본문을 입력해 주세요.', 'error');
        return;
    }

    if (values.bodyHtml.length > BLOG_BODY_HTML_LIMIT) {
        setAdminStatus('본문이 너무 깁니다. 이미지와 표를 줄인 뒤 다시 저장해 주세요.', 'error');
        return;
    }

    try {
        setFormBusy(true);
        setAdminStatus(editId ? '블로그 수정 중입니다.' : '블로그 발행 중입니다.');
        const coverImage = await resolveCoverImage();

        const payload = {
            ...values,
            coverImage,
            bodyFormat: 'html',
            authorUid: state.currentUser.uid,
            authorName: '관리자',
            updatedAt: serverTimestamp()
        };

        if (editId) {
            await updateDoc(doc(db, 'blogPosts', editId), payload);
            setAdminStatus('블로그 수정이 완료되었습니다.', 'success');
        } else {
            await addDoc(blogPostsRef, {
                ...payload,
                createdAt: serverTimestamp(),
                publishedAt: serverTimestamp()
            });
            setAdminStatus('블로그 발행이 완료되었습니다.', 'success');
        }

        closeBlogEditor();
        await loadBlogPosts();
    } catch (error) {
        console.error('블로그 저장 실패:', error);
        setAdminStatus('블로그 저장에 실패했습니다. 로그인 상태 또는 네트워크를 확인해 주세요.', 'error');
    } finally {
        setFormBusy(false);
    }
}

function startEditPost(postId) {
    const post = state.posts.find((entry) => entry.id === postId);
    if (!post) return;
    openBlogEditor(post);
}

async function deletePost(postId) {
    if (!state.isAdmin) return;
    const post = state.posts.find((entry) => entry.id === postId);
    const label = post?.title ? `"${post.title}" 글을 삭제할까요?` : '이 블로그 글을 삭제할까요?';
    if (!window.confirm(label)) return;

    try {
        await deleteDoc(doc(db, 'blogPosts', postId));
        resetBlogForm();
        await loadBlogPosts();
    } catch (error) {
        console.error('블로그 삭제 실패:', error);
        setAdminStatus('블로그 삭제에 실패했습니다.', 'error');
    }
}

function handleBlogAction(event) {
    const button = event.target.closest('[data-blog-action]');
    if (!button) return;

    const postId = button.dataset.blogId || '';
    if (button.dataset.blogAction === 'view') {
        openBlogDetail(postId);
    } else if (button.dataset.blogAction === 'edit') {
        startEditPost(postId);
    } else if (button.dataset.blogAction === 'delete') {
        deletePost(postId);
    }
}

function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    els.form?.addEventListener('submit', handleBlogSubmit);
    els.write?.addEventListener('click', () => openBlogEditor());
    els.cancelEdit?.addEventListener('click', closeBlogEditor);
    els.coverFile?.addEventListener('change', handleCoverFileChange);
    els.coverClear?.addEventListener('click', () => {
        resetCoverInput();
        setAdminStatus('대표 이미지를 지웠습니다. 저장하면 기본 이미지로 표시됩니다.');
    });
    els.refresh?.addEventListener('click', loadBlogPosts);
    els.detailBack?.addEventListener('click', closeBlogDetail);
    els.list?.addEventListener('click', handleBlogAction);
    els.detailContent?.addEventListener('click', handleBlogAction);
}

async function runBlogInit() {
    if (!els.list) return;

    bindEvents();
    setBlogEditorVisible(false);
    await loadBlogPosts();

    if (authObserverStarted) return;
    authObserverStarted = true;

    try {
        await firebaseReady;
        assertAuthServicesReady();
        observeAuthState(readAdminState);
    } catch (error) {
        console.warn('블로그 작성 권한 초기화 실패:', error);
    }
}

export function initBlogPage() {
    if (initPromise) return initPromise;
    initPromise = runBlogInit().finally(() => {
        initPromise = null;
    });
    return initPromise;
}

if (document.getElementById('blog-list')) {
    initBlogPage();
}

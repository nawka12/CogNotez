// Shared helpers for markdown rendering, sanitization, and i18n wrapper
const { marked } = require('marked');

marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
});

function t(key, fallbackOrParams, params) {
    const hasFallback = typeof fallbackOrParams === 'string';
    const fallback = hasFallback ? fallbackOrParams : undefined;
    const finalParams = hasFallback ? params : fallbackOrParams;

    if (!global.window || !window.i18n || typeof window.i18n.t !== 'function') {
        return fallback || key;
    }

    try {
        const translated = window.i18n.t(key, finalParams);
        if ((!translated || translated === key) && fallback) {
            return fallback;
        }
        return translated || fallback || key;
    } catch (err) {
        console.warn('[i18n] translation error for key:', key, err);
        return fallback || key;
    }
}

if (typeof window !== 'undefined') {
    window.t = t;
}

const SAFE_URI_PATTERN = /^(https?:|mailto:|tel:|data:image\/|cognotez-media:)/i;
const UNSAFE_STYLE_PATTERN = /expression|url\(\s*['"]?javascript:|url\(\s*['"]?data:text\/html/i;

function sanitizeHTML(dirty) {
    if (!dirty) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(dirty, 'text/html');

    const blockedTags = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'];
    doc.body.querySelectorAll(blockedTags.join(',')).forEach(node => node.remove());

    const sanitizeAttributes = (el) => {
        Array.from(el.attributes).forEach(attr => {
            const name = attr.name.toLowerCase();
            const value = attr.value || '';

            if (name.startsWith('on')) {
                el.removeAttribute(attr.name);
                return;
            }

            if (['src', 'href', 'xlink:href'].includes(name)) {
                if (!SAFE_URI_PATTERN.test(value.trim())) {
                    el.removeAttribute(attr.name);
                }
                return;
            }

            if (name === 'style') {
                if (UNSAFE_STYLE_PATTERN.test(value.toLowerCase())) {
                    el.removeAttribute(attr.name);
                }
                return;
            }
        });
    };

    const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
    while (walker.nextNode()) {
        sanitizeAttributes(walker.currentNode);
    }

    return doc.body.innerHTML;
}

function setSafeInnerHTML(element, html) {
    if (!element) return;
    element.innerHTML = sanitizeHTML(html);
}

function renderMarkdown(text) {
    if (!text) return '';
    const rendered = marked.parse(text);
    return sanitizeHTML(rendered);
}

module.exports = {
    t,
    sanitizeHTML,
    setSafeInnerHTML,
    renderMarkdown,
    SAFE_URI_PATTERN,
    UNSAFE_STYLE_PATTERN
};

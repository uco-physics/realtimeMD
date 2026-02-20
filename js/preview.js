/**
 * preview.js — Live Preview Renderer
 * Renders Markdown to HTML with DOMPurify sanitization,
 * MathJax typesetting, Mermaid diagram rendering, and image resolution.
 */
import { MarkdownParser } from './markdown.js';
import { resolveRelativeAssetPath } from './pathutils.js';

export class Preview {
    constructor(app) {
        this.app = app;
        this.container = document.getElementById('preview-content');
        this.wrapper = document.getElementById('preview-wrapper');
        this.parser = new MarkdownParser({
            resolveImagePath: (src) => this._resolveImage(src)
        });

        // Debounce timers
        this._mathjaxTimer = null;
        this._mermaidTimer = null;
        this._mermaidCache = new Map(); // id → source hash

        this.app.eventBus.on('editor:input', (md) => this.render(md));
        this.app.eventBus.on('files:changed', () => this._rerender());
    }

    render(md) {
        this._currentMd = md;
        let html = this.parser.parse(md);

        // Sanitize HTML output with DOMPurify (if loaded)
        if (typeof DOMPurify !== 'undefined') {
            html = DOMPurify.sanitize(html, {
                // Allow safe subset of HTML
                ALLOWED_TAGS: [
                    // Block
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    'p', 'div', 'span', 'section', 'article', 'aside',
                    'header', 'footer', 'nav', 'main',
                    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
                    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
                    'caption', 'colgroup', 'col',
                    'blockquote', 'pre', 'code', 'hr', 'br',
                    'details', 'summary',
                    'figure', 'figcaption',
                    // Inline
                    'a', 'img', 'em', 'strong', 'b', 'i', 'u', 's',
                    'del', 'ins', 'sub', 'sup', 'mark', 'small',
                    'abbr', 'cite', 'dfn', 'time', 'kbd', 'var', 'samp',
                    'ruby', 'rt', 'rp',
                    // Forms (readonly)
                    'input', 'label',
                    // Media
                    'video', 'audio', 'source', 'picture',
                    // SVG for mermaid
                    'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline',
                    'polygon', 'text', 'tspan', 'defs', 'marker', 'use',
                    'foreignObject', 'clipPath', 'mask', 'pattern',
                    'linearGradient', 'radialGradient', 'stop',
                    'desc', 'title', 'metadata', 'symbol',
                ],
                ALLOWED_ATTR: [
                    'href', 'src', 'alt', 'title', 'class', 'id',
                    'style', 'target', 'rel', 'loading',
                    'type', 'checked', 'disabled',
                    'width', 'height', 'align', 'valign', 'colspan', 'rowspan',
                    'datetime', 'cite', 'lang', 'dir',
                    'open', 'start', 'reversed',
                    'controls', 'autoplay', 'loop', 'muted', 'preload',
                    // SVG attributes
                    'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width',
                    'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
                    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
                    'points', 'transform', 'opacity', 'font-size', 'font-family',
                    'font-weight', 'text-anchor', 'dominant-baseline',
                    'marker-end', 'marker-start', 'marker-mid',
                    'clip-path', 'mask', 'gradientUnits', 'gradientTransform',
                    'offset', 'stop-color', 'stop-opacity',
                    'xlink:href', 'preserveAspectRatio',
                    'data-tooltip', 'aria-label', 'role',
                ],
                // Forbid dangerous elements
                FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style'],
                FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus',
                    'onblur', 'onsubmit', 'onchange', 'oninput', 'onkeydown',
                    'onkeyup', 'onkeypress', 'onmousedown', 'onmouseup'],
                ADD_ATTR: ['target'],
                KEEP_CONTENT: true,
            });
        }

        this.container.innerHTML = html;

        // Post-processing: MathJax and Mermaid
        this._triggerMathJax();
        this._triggerMermaid();
    }

    _rerender() {
        if (this._currentMd) {
            this.render(this._currentMd);
        }
    }

    _resolveImage(src) {
        // If it's an absolute URL or data URI, return directly
        if (/^https?:\/\//.test(src) || src.startsWith('data:')) {
            return src;
        }

        // Resolve relative path against active Markdown file's directory
        const activePath = this.app.workspace?.getActiveFilePath() || '/';
        const resolvedPath = resolveRelativeAssetPath(activePath, src);

        // Try to find a blob URL for the resolved virtual path
        const fileManager = this.app.fileManager;
        if (fileManager) {
            const blobUrl = fileManager.getBlobUrl(resolvedPath);
            if (blobUrl) return blobUrl;
        }

        // Graceful fallback
        return src;
    }

    /**
     * Debounced MathJax typesetting
     */
    _triggerMathJax() {
        clearTimeout(this._mathjaxTimer);
        this._mathjaxTimer = setTimeout(() => {
            if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
                MathJax.typesetPromise([this.container]).catch(err => {
                    console.warn('MathJax typeset error:', err);
                });
            }
        }, 150);
    }

    /**
     * Debounced Mermaid rendering.
     * Only re-renders diagrams whose source has changed.
     */
    _triggerMermaid() {
        clearTimeout(this._mermaidTimer);
        this._mermaidTimer = setTimeout(() => {
            if (typeof mermaid === 'undefined') return;

            const mermaidEls = this.container.querySelectorAll('div.mermaid');
            if (mermaidEls.length === 0) return;

            mermaidEls.forEach((el, idx) => {
                const source = el.textContent.trim();
                const id = `mermaid-${idx}`;
                const hash = this._simpleHash(source);

                // Skip if unchanged
                if (this._mermaidCache.get(id) === hash && el.querySelector('svg')) {
                    return;
                }

                this._mermaidCache.set(id, hash);

                try {
                    // Use mermaid.render to generate SVG
                    const renderResult = mermaid.render(id, source);

                    // mermaid.render may return a Promise or { svg } depending on version
                    if (renderResult && typeof renderResult.then === 'function') {
                        renderResult.then(({ svg }) => {
                            el.innerHTML = svg;
                        }).catch(err => {
                            console.warn('Mermaid render error:', err);
                            el.innerHTML = `<pre class="mermaid-error">${this._escapeForDisplay(err.message || String(err))}</pre>`;
                        });
                    } else if (renderResult && renderResult.svg) {
                        el.innerHTML = renderResult.svg;
                    }
                } catch (err) {
                    console.warn('Mermaid render error:', err);
                    el.innerHTML = `<pre class="mermaid-error">${this._escapeForDisplay(err.message || String(err))}</pre>`;
                }
            });
        }, 200);
    }

    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    _escapeForDisplay(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    scrollToPercent(percent) {
        const maxScroll = this.wrapper.scrollHeight - this.wrapper.clientHeight;
        this.wrapper.scrollTop = maxScroll * percent;
    }

    destroy() {
        clearTimeout(this._mathjaxTimer);
        clearTimeout(this._mermaidTimer);
        this.container.innerHTML = '';
    }
}

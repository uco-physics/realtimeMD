/**
 * preview.js — Live Preview Renderer
 * Renders Markdown to HTML in real-time with scroll sync and image resolution.
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

        this.app.eventBus.on('editor:input', (md) => this.render(md));
        this.app.eventBus.on('files:changed', () => this._rerender());
    }

    render(md) {
        this._currentMd = md;
        const html = this.parser.parse(md);
        this.container.innerHTML = html;
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

        // Graceful fallback — return resolved path (will show broken image, no crash)
        return src;
    }

    scrollToPercent(percent) {
        const maxScroll = this.wrapper.scrollHeight - this.wrapper.clientHeight;
        this.wrapper.scrollTop = maxScroll * percent;
    }

    destroy() {
        this.container.innerHTML = '';
    }
}

/**
 * app.js — Main Application Orchestrator
 * Initializes all components, manages global state, and provides event bus.
 */
import { Editor } from './editor.js';
import { Preview } from './preview.js';
import { FileManager } from './filemanager.js';
import { Workspace } from './workspace.js';
import { Storage } from './storage.js';
import { ExtensionManager } from './extensions.js';
import { initI18n, setLang, getLang, t, applyTranslations } from './i18n.js';

/* ---- Simple Event Bus ---- */
class EventBus {
    constructor() {
        this._listeners = {};
    }
    on(event, fn) {
        (this._listeners[event] = this._listeners[event] || []).push(fn);
    }
    off(event, fn) {
        const list = this._listeners[event];
        if (list) this._listeners[event] = list.filter(f => f !== fn);
    }
    emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => {
            try { fn(...args); } catch (e) { console.error(`EventBus error [${event}]:`, e); }
        });
    }
}

const THEME_KEY = 'realtimemd-theme';

/* ---- App ---- */
class App {
    constructor() {
        this.eventBus = new EventBus();
        this.isSidebarOpen = false;
        this.editor = null;
        this.preview = null;
        this.fileManager = null;
        this.workspace = null;
        this.storage = null;
        this.extensions = null;
    }

    async init() {
        // Init i18n first (reads localStorage, applies translations)
        initI18n();

        // Init file manager first (needs IndexedDB ready)
        this.fileManager = new FileManager(this);
        await this.fileManager.ready();
        await this.fileManager.initBlobUrls();

        // Init components
        this.editor = new Editor(this);
        this.preview = new Preview(this);
        this.workspace = new Workspace(this);
        this.storage = new Storage(this);
        this.extensions = new ExtensionManager(this);

        // Wire up events
        this._bindToolbar();
        this._bindRibbon();
        this._bindStatusBar();
        this._bindEditorEvents();
        this._bindResizeHandle();
        this._initTheme();
        this._initLangSelector();
        this._bindMobile();

        // Restore session or initialize fresh
        const restored = await this.storage.restoreSession();
        if (restored) {
            // Ensure the default file exists and is synced
            await this._ensureDefaultFile();
            await this.workspace.refresh();
            this.eventBus.emit('editor:input', this.editor.getValue());
        } else {
            // First launch — create default file with welcome content
            const defaultContent = this._getDefaultContent();
            await this._createDefaultFile(defaultContent);
            this.editor.setValue(defaultContent);
            this.editor.markSaved();
            this.eventBus.emit('editor:input', this.editor.getValue());
        }

        // Run extension init hook
        this.extensions.runHook('onInit');

        // Update status bar
        this._updateStatusBar();

        // Re-apply translations (some elements may have been created dynamically)
        applyTranslations();

        console.log('RealtimeMD initialized');
    }

    /**
     * Create the default untitled.md in the virtual filesystem
     */
    async _createDefaultFile(content) {
        const path = '/untitled.md';
        const name = 'untitled.md';
        await this.fileManager.saveFile(path, name, 'text/markdown', content, 'file');
        this.workspace.activeFilePath = path;
        this.editor.setFileName(name);
        await this.workspace.refresh();
    }

    /**
     * Ensure default file exists (on session restore, check if there's an active file)
     */
    async _ensureDefaultFile() {
        const files = await this.fileManager.getAllFiles();
        if (files.length === 0) {
            // No files at all — create default
            await this._createDefaultFile(this.editor.getValue() || this._getDefaultContent());
        } else if (!this.workspace.activeFilePath) {
            // Files exist but none is active — open the first .md file
            const mdFile = files.find(f => f.name.endsWith('.md') && f.kind === 'file');
            if (mdFile) {
                this.workspace.activeFilePath = mdFile.path;
                this.editor.setFileName(mdFile.name);
            }
        }
    }

    _bindToolbar() {
        // Formatting buttons
        document.getElementById('btn-bold')?.addEventListener('click', () => {
            this.editor.insertAtCursor('**', '**');
        });
        document.getElementById('btn-italic')?.addEventListener('click', () => {
            this.editor.insertAtCursor('*', '*');
        });
        document.getElementById('btn-strikethrough')?.addEventListener('click', () => {
            this.editor.insertAtCursor('~~', '~~');
        });
        document.getElementById('btn-code')?.addEventListener('click', () => {
            this.editor.insertAtCursor('`', '`');
        });
        document.getElementById('btn-codeblock')?.addEventListener('click', () => {
            this.editor.insertAtCursor('```\n', '\n```');
        });
        document.getElementById('btn-link')?.addEventListener('click', () => {
            this.editor.insertAtCursor('[', '](url)');
        });
        document.getElementById('btn-image')?.addEventListener('click', () => {
            this.editor.insertAtCursor('![alt](', ')');
        });
        document.getElementById('btn-heading')?.addEventListener('click', () => {
            this.editor.insertAtLineStart('## ');
        });
        document.getElementById('btn-quote')?.addEventListener('click', () => {
            this.editor.insertAtLineStart('> ');
        });
        document.getElementById('btn-ul')?.addEventListener('click', () => {
            this.editor.insertAtLineStart('- ');
        });
        document.getElementById('btn-ol')?.addEventListener('click', () => {
            this.editor.insertAtLineStart('1. ');
        });
        document.getElementById('btn-checklist')?.addEventListener('click', () => {
            this.editor.insertAtLineStart('- [ ] ');
        });
        document.getElementById('btn-hr')?.addEventListener('click', () => {
            this.editor.insertAtCursor('\n---\n', '');
        });
        document.getElementById('btn-table')?.addEventListener('click', () => {
            this.editor.insertAtCursor('\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n', '');
        });

        // Undo/Redo
        document.getElementById('btn-undo')?.addEventListener('click', () => this.editor.undo());
        document.getElementById('btn-redo')?.addEventListener('click', () => this.editor.redo());

        // Save
        document.getElementById('btn-save')?.addEventListener('click', () => {
            this.eventBus.emit('editor:save');
        });
    }

    _bindRibbon() {
        const ribbonExplorer = document.getElementById('ribbon-explorer');
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');

        const toggleSidebar = () => {
            this.isSidebarOpen = !this.isSidebarOpen;
            sidebar.classList.toggle('open', this.isSidebarOpen);
            ribbonExplorer?.classList.toggle('active', this.isSidebarOpen);
            backdrop?.classList.toggle('visible', this.isSidebarOpen);
            if (this.isSidebarOpen) {
                this.workspace.refresh();
            }
        };

        ribbonExplorer?.addEventListener('click', toggleSidebar);
        backdrop?.addEventListener('click', toggleSidebar);

        // Mobile menu button
        document.getElementById('btn-mobile-menu')?.addEventListener('click', toggleSidebar);

        // Theme toggle
        document.getElementById('ribbon-theme')?.addEventListener('click', () => {
            this._toggleTheme();
        });

        // Export/Import (JSON)
        document.getElementById('ribbon-export')?.addEventListener('click', () => {
            this.storage.exportWorkspace();
        });
        document.getElementById('ribbon-import')?.addEventListener('click', () => {
            this.storage.importWorkspace();
        });

        // Export as ZIP
        document.getElementById('ribbon-export-zip')?.addEventListener('click', () => {
            this._exportAsZip();
        });

        // Save preview as PDF
        document.getElementById('ribbon-pdf')?.addEventListener('click', () => {
            this._savePreviewAsPdf();
        });

        // Reset session
        document.getElementById('ribbon-reset')?.addEventListener('click', () => {
            this._showResetDialog();
        });

        // GigaReset
        document.getElementById('ribbon-gigareset')?.addEventListener('click', () => {
            this._showGigaResetDialog();
        });

        // Help
        document.getElementById('ribbon-help')?.addEventListener('click', () => {
            this._showHelp();
        });
    }

    _bindMobileActionBar() {
        // Mobile action bar mirrors key ribbon actions
        document.getElementById('mob-theme')?.addEventListener('click', () => {
            this._toggleTheme();
        });
        document.getElementById('mob-pdf')?.addEventListener('click', () => {
            this._savePreviewAsPdf();
        });
        document.getElementById('mob-zip')?.addEventListener('click', () => {
            this._exportAsZip();
        });
        document.getElementById('mob-reset')?.addEventListener('click', () => {
            this._showResetDialog();
        });
        document.getElementById('mob-gigareset')?.addEventListener('click', () => {
            this._showGigaResetDialog();
        });
        document.getElementById('mob-help')?.addEventListener('click', () => {
            this._showHelp();
        });

        // Mobile language selector
        const mobLang = document.getElementById('mob-lang');
        if (mobLang) {
            mobLang.value = getLang();
            mobLang.addEventListener('change', () => {
                setLang(mobLang.value);
                // Sync desktop selector too
                const desktopLang = document.getElementById('ribbon-lang');
                if (desktopLang) desktopLang.value = mobLang.value;
            });
        }
    }

    _bindStatusBar() {
        this.editor.textarea.addEventListener('keyup', () => this._updateStatusBar());
        this.editor.textarea.addEventListener('click', () => this._updateStatusBar());
        this.editor.textarea.addEventListener('input', () => this._updateStatusBar());
    }

    _updateStatusBar() {
        const info = this.editor.getCursorInfo();
        const counts = this.editor.getWordCount();
        const posEl = document.getElementById('status-position');
        const countEl = document.getElementById('status-count');
        if (posEl) posEl.textContent = `Ln ${info.line}, Col ${info.col}`;
        if (countEl) countEl.textContent = `${counts.words} words, ${counts.chars} chars`;
    }

    _bindEditorEvents() {
        this.eventBus.on('editor:save', async () => {
            await this.workspace.saveCurrentFile();
        });

        // Scroll sync (editor → preview)
        let scrollSyncTimer = null;
        this.editor.textarea.addEventListener('scroll', () => {
            clearTimeout(scrollSyncTimer);
            scrollSyncTimer = setTimeout(() => {
                const el = this.editor.textarea;
                const maxScroll = el.scrollHeight - el.clientHeight;
                if (maxScroll > 0) {
                    const percent = el.scrollTop / maxScroll;
                    this.preview.scrollToPercent(percent);
                }
            }, 16);
        });
    }

    _bindResizeHandle() {
        const handle = document.getElementById('resize-handle');
        const container = document.querySelector('.editor-preview-container');
        const editorPane = document.querySelector('.editor-pane');
        const previewPane = document.querySelector('.preview-pane');

        if (!handle || !container) return;

        let isResizing = false;
        let startX = 0;
        let startEditorWidth = 0;

        const onMouseDown = (e) => {
            isResizing = true;
            startX = e.clientX || e.touches?.[0]?.clientX || 0;
            startEditorWidth = editorPane.getBoundingClientRect().width;
            handle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;
            const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
            const rect = container.getBoundingClientRect();
            const percent = ((clientX - rect.left) / rect.width) * 100;
            const clamped = Math.max(20, Math.min(80, percent));
            editorPane.style.flex = `0 0 ${clamped}%`;
            previewPane.style.flex = `0 0 ${100 - clamped}%`;
        };

        const onMouseUp = () => {
            if (isResizing) {
                isResizing = false;
                handle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };

        handle.addEventListener('mousedown', onMouseDown);
        handle.addEventListener('touchstart', onMouseDown, { passive: false });
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('touchmove', onMouseMove, { passive: false });
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('touchend', onMouseUp);
    }

    // ========== Theme ==========

    _initTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        const theme = (saved === 'light' || saved === 'dark') ? saved : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
    }

    _toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(THEME_KEY, next);
        this.extensions.runHook('onThemeChange', { theme: next });

        // Re-initialize mermaid with new theme
        if (typeof mermaid !== 'undefined') {
            try {
                mermaid.initialize({
                    startOnLoad: false,
                    theme: next === 'light' ? 'default' : 'dark',
                    securityLevel: 'strict'
                });
            } catch (e) { /* ignore */ }
            // Force re-render of preview to pick up new mermaid theme
            if (this.preview?._currentMd) {
                this.preview._mermaidCache.clear();
                this.preview.render(this.preview._currentMd);
            }
        }

        this.showToast(t(next === 'dark' ? 'toast.themeDark' : 'toast.themeLight'), 'info');
    }

    // ========== Language Selector ==========

    _initLangSelector() {
        const select = document.getElementById('ribbon-lang');
        if (!select) return;

        // Set current value
        select.value = getLang();

        select.addEventListener('change', () => {
            setLang(select.value);
            // Sync mobile selector
            const mobLang = document.getElementById('mob-lang');
            if (mobLang) mobLang.value = select.value;
        });
    }

    // ========== Export as ZIP ==========

    async _exportAsZip() {
        if (typeof JSZip === 'undefined') {
            this.showToast(t('toast.exportZipError') + ' (JSZip not loaded)', 'error');
            return;
        }

        try {
            const zip = new JSZip();
            const files = await this.fileManager.getAllFiles();

            for (const file of files) {
                if (file.kind === 'directory') continue;

                // Remove leading slash for zip path
                const zipPath = file.path.startsWith('/') ? file.path.substring(1) : file.path;

                if (file.content instanceof ArrayBuffer) {
                    zip.file(zipPath, file.content);
                } else if (typeof file.content === 'string') {
                    zip.file(zipPath, file.content);
                }
            }

            const now = new Date();
            const dateStr = now.getFullYear().toString() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0');
            const fileName = `realtimeMD-workspace-${dateStr}.zip`;

            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);

            this.showToast(t('toast.exportZipOk'), 'success');
        } catch (err) {
            console.error('ZIP export failed:', err);
            this.showToast(t('toast.exportZipError'), 'error');
        }
    }

    // ========== Save Preview as PDF ==========

    _savePreviewAsPdf() {
        // Detect mobile: narrow viewport + touch/mobile UA
        const isMobile = this._isMobileDevice();

        if (isMobile) {
            this._generateMobilePdf();
        } else {
            this._desktopPrintPdf();
        }
    }

    /**
     * Detect mobile device using viewport + UA heuristics
     */
    _isMobileDevice() {
        const narrowViewport = window.innerWidth <= 768;
        const touchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const mobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        return narrowViewport && (touchDevice || mobileUA);
    }

    /**
     * Desktop: open new window with clean preview HTML and trigger print dialog
     */
    _desktopPrintPdf() {
        this.showToast(t('toast.pdfInfo'), 'info');

        const previewEl = document.querySelector('.preview-content');
        if (!previewEl) return;

        const previewHtml = previewEl.innerHTML;
        const printWin = window.open('', '_blank');
        if (!printWin) {
            this.showToast('Pop-up blocked. Please allow pop-ups for this site.', 'error');
            return;
        }

        const hasMath = previewHtml.includes('math-inline') || previewHtml.includes('math-display');

        printWin.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>RealtimeMD — Print Preview</title>
<style>
  @page { margin: 12mm; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    height: auto !important;
    overflow: visible !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #222;
    background: #fff;
  }
  .print-content {
    max-width: 720px;
    margin: 0 auto;
    padding: 20px;
  }
  h1, h2, h3, h4, h5, h6 { color: #111; margin-top: 1.2em; margin-bottom: 0.4em; }
  h1 { font-size: 1.8em; border-bottom: 2px solid #ddd; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
  a { color: #1e66f5; text-decoration: underline; }
  code {
    background: #f0f0f0; color: #333;
    border: 1px solid #ddd; border-radius: 3px;
    padding: 0.15em 0.3em; font-size: 0.9em;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  }
  pre {
    background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;
    padding: 12px; overflow-x: auto;
    break-inside: avoid; page-break-inside: avoid;
  }
  pre code { border: none; padding: 0; background: none; }
  blockquote {
    border-left: 4px solid #999; margin: 1em 0; padding: 0.5em 1em;
    color: #555; break-inside: avoid;
  }
  table {
    border-collapse: collapse; width: 100%; margin: 1em 0;
    break-inside: avoid; page-break-inside: avoid;
  }
  th, td { border: 1px solid #ccc; padding: 6px 10px; color: #333; }
  th { background: #f0f0f0; font-weight: 600; }
  img {
    max-width: 100% !important; height: auto !important;
    page-break-inside: avoid; break-inside: avoid;
  }
  .mermaid {
    text-align: center; margin: 1em 0; padding: 8px;
    break-inside: avoid; page-break-inside: avoid;
  }
  .mermaid svg { max-width: 100%; height: auto; }
  .math-display {
    text-align: center; margin: 1em 0; overflow-x: auto;
    break-inside: avoid; page-break-inside: avoid;
  }
  mjx-container { break-inside: avoid; }
  ul, ol { padding-left: 1.5em; }
  li { margin-bottom: 0.3em; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
  mark { background: #fef08a; padding: 0.1em 0.2em; }
  kbd {
    background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px;
    padding: 0.1em 0.4em; font-size: 0.85em;
    font-family: 'Consolas', monospace;
  }
  @media print {
    html, body { height: auto !important; overflow: visible !important; }
    .print-content { max-width: none; padding: 0; }
  }
</style>
${hasMath ? '<script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]],displayMath:[["\\\\[","\\\\]"]]},startup:{typeset:false}};</script><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>' : ''}
</head>
<body>
<div class="print-content">${previewHtml}</div>
<script>
(async function() {
  const imgs = document.querySelectorAll('img');
  if (imgs.length > 0) {
    await Promise.all(Array.from(imgs).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(r => { img.onload = r; img.onerror = r; });
    }));
  }
  if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
    try { await MathJax.typesetPromise(); } catch(e) { console.warn('MathJax error:', e); }
  }
  setTimeout(function() {
    window.focus();
    window.print();
    setTimeout(function() { window.close(); }, 500);
  }, 300);
})();
</script>
</body>
</html>`);
        printWin.document.close();
    }

    /**
     * Ensure html2canvas and jsPDF are loaded. Local vendor scripts should already
     * be loaded synchronously, but this acts as a safety gate + dynamic fallback.
     */
    async _ensurePdfLibsLoaded() {
        const H2C_LOCAL = 'vendor/html2canvas.min.js';
        const PDF_LOCAL = 'vendor/jspdf.umd.min.js';
        const H2C_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        const PDF_CDN = 'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js';

        const loadScript = (src) => new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => { console.log('[PDF] loaded: ' + src); resolve(); };
            s.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(s);
        });

        // html2canvas
        if (typeof window.html2canvas !== 'function') {
            console.warn('[PDF] html2canvas not on window, injecting...');
            try {
                await loadScript(H2C_LOCAL);
            } catch (e) {
                console.warn('[PDF] local html2canvas failed, trying CDN');
                await loadScript(H2C_CDN);
            }
        }

        // jsPDF
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf?.jsPDF !== 'function') {
            console.warn('[PDF] jsPDF not on window, injecting...');
            try {
                await loadScript(PDF_LOCAL);
            } catch (e) {
                console.warn('[PDF] local jsPDF failed, trying CDN');
                await loadScript(PDF_CDN);
            }
        }

        // Final check with timeout
        const deadline = Date.now() + 8000;
        while (typeof window.html2canvas !== 'function' || typeof window.jspdf?.jsPDF !== 'function') {
            if (Date.now() > deadline) {
                throw new Error('PDF libraries failed to load after 8s');
            }
            await new Promise(r => setTimeout(r, 100));
        }

        console.log('[PDF] libs ready: html2canvas=' + typeof window.html2canvas + ', jsPDF=' + typeof window.jspdf?.jsPDF);
    }

    /**
     * Mobile: generate PDF client-side using html2canvas + jsPDF (local vendor)
     * Uses a visible-but-unobtrusive export container so html2canvas can render it.
     */
    async _generateMobilePdf() {
        // Gate: ensure libs are loaded before anything else
        try {
            await this._ensurePdfLibsLoaded();
        } catch (e) {
            this.showToast('PDF export is unavailable because required libraries failed to load. Try again or use desktop.', 'error');
            console.error('[PDF]', e);
            return;
        }

        const previewEl = document.querySelector('.preview-content');
        if (!previewEl || !previewEl.innerHTML.trim()) {
            this.showToast('Nothing to export.', 'error');
            return;
        }

        this.showToast('Preparing…', 'info');

        let exportContainer = null;
        try {
            // ── 1. Build visible export DOM ──
            exportContainer = document.createElement('div');
            exportContainer.id = 'pdf-export-container';
            exportContainer.style.cssText = [
                'position: fixed',
                'left: 0', 'top: 0',
                'width: 794px',          // ~A4 at 96 DPI (210mm)
                'padding: 24px',
                'background: #ffffff',
                'color: #222',
                'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                'font-size: 12pt',
                'line-height: 1.6',
                'height: auto !important',
                'max-height: none !important',
                'overflow: visible !important',
                'opacity: 0',
                'pointer-events: none',
                'z-index: 999999',
            ].join('; ');
            exportContainer.innerHTML = previewEl.innerHTML;

            // Force light-theme inline styles on cloned content
            this._applyPrintStyles(exportContainer);

            document.body.appendChild(exportContainer);

            console.log('[PDF] export container appended, scrollW=' + exportContainer.scrollWidth + ', scrollH=' + exportContainer.scrollHeight + ', childNodes=' + exportContainer.childNodes.length);

            // ── 2. readyForExport pipeline ──
            this.showToast('Rendering…', 'info');

            // 2a. Fonts
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }

            // 2b. Images
            const imgs = exportContainer.querySelectorAll('img');
            if (imgs.length > 0) {
                await Promise.all(Array.from(imgs).map(img => {
                    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
                    return new Promise(r => { img.onload = r; img.onerror = r; });
                }));
            }

            // 2c. MathJax
            if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
                try { await MathJax.typesetPromise([exportContainer]); } catch (e) {
                    console.warn('MathJax typeset in export failed:', e);
                }
            }

            // 2d. Mermaid
            if (typeof mermaid !== 'undefined') {
                const mermaidEls = exportContainer.querySelectorAll('.mermaid:not([data-processed])');
                if (mermaidEls.length > 0) {
                    try { await mermaid.run({ nodes: mermaidEls }); } catch (e) {
                        console.warn('Mermaid render in export failed:', e);
                    }
                }
            }

            // 2e. Two rAF frames for layout paint
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            console.log('[PDF] readyForExport done, scrollW=' + exportContainer.scrollWidth + ', scrollH=' + exportContainer.scrollHeight);

            // ── 3. Capture with html2canvas ──
            this.showToast('Generating PDF…', 'info');

            let canvas;
            try {
                canvas = await this._captureCanvas(exportContainer, 2);
                console.log('[PDF] canvas captured at scale 2: ' + canvas.width + 'x' + canvas.height);
            } catch (captureErr) {
                console.warn('[PDF] scale 2 capture failed:', captureErr.message);
                canvas = await this._captureCanvas(exportContainer, 1);
                console.log('[PDF] canvas captured at scale 1: ' + canvas.width + 'x' + canvas.height);
            }

            // ── 4. Sanity check ──
            if (!this._isCanvasValid(canvas)) {
                console.warn('[PDF] capture blank at initial scale, retrying at scale 1');
                canvas = await this._captureCanvas(exportContainer, 1);
                console.log('[PDF] retry canvas: ' + canvas.width + 'x' + canvas.height);
            }

            if (!this._isCanvasValid(canvas)) {
                throw new Error('Canvas capture produced blank output after retries');
            }

            // ── 5. Convert canvas to multi-page PDF ──
            const fileName = this._getPdfFileName();
            console.log('[PDF] converting canvas ' + canvas.width + 'x' + canvas.height + ' to multi-page PDF');
            const pdfBlob = this._canvasToMultiPagePdf(canvas, fileName);
            console.log('[PDF] blob created, size=' + pdfBlob.size + ' bytes');

            // ── 6. Download/share ──
            this._downloadOrSharePdf(pdfBlob, fileName);
            this.showToast(t('toast.saved'), 'success');

        } catch (err) {
            console.error('Mobile PDF generation failed:', err);
            const detail = err?.message || String(err);
            this.showToast(
                `PDF failed: ${detail}`,
                'error'
            );
        } finally {
            // ── 7. Always clean up ──
            if (exportContainer && exportContainer.parentNode) {
                exportContainer.parentNode.removeChild(exportContainer);
            }
        }
    }

    /**
     * Apply light-theme inline styles to an export container for print readability
     */
    _applyPrintStyles(container) {
        container.querySelectorAll('pre').forEach(el => {
            el.style.cssText = 'background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:12px;overflow-x:auto;color:#333;white-space:pre-wrap;word-wrap:break-word;';
        });
        container.querySelectorAll('code').forEach(el => {
            if (el.parentElement?.tagName !== 'PRE') {
                el.style.cssText = 'background:#f0f0f0;color:#333;border:1px solid #ddd;border-radius:3px;padding:0.15em 0.3em;';
            }
        });
        container.querySelectorAll('blockquote').forEach(el => {
            el.style.cssText = 'border-left:4px solid #999;margin:1em 0;padding:0.5em 1em;color:#555;';
        });
        container.querySelectorAll('th').forEach(el => {
            el.style.cssText = 'background:#f0f0f0;border:1px solid #ccc;padding:6px 10px;color:#333;font-weight:600;';
        });
        container.querySelectorAll('td').forEach(el => {
            el.style.cssText = 'border:1px solid #ccc;padding:6px 10px;color:#333;';
        });
        container.querySelectorAll('table').forEach(el => {
            el.style.cssText = 'border-collapse:collapse;width:100%;margin:1em 0;';
        });
        container.querySelectorAll('a').forEach(el => {
            el.style.cssText = 'color:#1e66f5;text-decoration:underline;';
        });
        container.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el => {
            el.style.color = '#111';
        });
        container.querySelectorAll('img').forEach(el => {
            el.style.cssText = 'max-width:100%;height:auto;';
        });
        container.querySelectorAll('.mermaid svg').forEach(el => {
            el.style.cssText = 'max-width:100%;height:auto;';
        });
    }

    /**
     * Capture container using html2canvas at given scale
     */
    async _captureCanvas(container, scale) {
        // html2canvas is guaranteed available via _ensurePdfLibsLoaded()
        const h2c = window.html2canvas;
        if (typeof h2c !== 'function') {
            throw new Error('html2canvas not available on window');
        }

        // Temporarily make export container visible for capture
        container.style.opacity = '1';

        const canvas = await h2c(container, {
            scale: scale,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            windowWidth: 794,
            width: container.scrollWidth,
            height: container.scrollHeight,
        });

        // Hide again immediately
        container.style.opacity = '0';

        return canvas;
    }

    /**
     * Check if canvas has actual rendered content (not blank)
     */
    _isCanvasValid(canvas) {
        if (!canvas || canvas.width === 0 || canvas.height === 0) return false;

        // Sample pixels from several locations to detect all-white/blank
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        const samplePoints = [
            [canvas.width * 0.5, canvas.height * 0.1],
            [canvas.width * 0.5, canvas.height * 0.3],
            [canvas.width * 0.5, canvas.height * 0.5],
            [canvas.width * 0.25, canvas.height * 0.5],
        ];

        let allWhite = true;
        for (const [x, y] of samplePoints) {
            const px = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
            // Check if pixel is NOT white (255,255,255) and NOT transparent (alpha 0)
            if (px[3] > 0 && (px[0] < 250 || px[1] < 250 || px[2] < 250)) {
                allWhite = false;
                break;
            }
        }

        if (allWhite) {
            console.warn('Canvas sanity check: all sampled pixels are white/transparent');
            return false;
        }

        return true;
    }

    /**
     * Convert a tall canvas into a multi-page A4 PDF using jsPDF
     * A4: 210mm × 297mm
     */
    _canvasToMultiPagePdf(canvas, fileName) {
        // jsPDF v2.5.2 UMD sets window.jspdf.jsPDF
        const JsPDF = window.jspdf?.jsPDF;
        if (!JsPDF) throw new Error('jsPDF not available on window');

        const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

        const pdfPageW = 210; // mm
        const pdfPageH = 297; // mm
        const margin = 10;   // mm
        const contentW = pdfPageW - 2 * margin; // 190mm printable width
        const contentH = pdfPageH - 2 * margin; // 277mm printable height

        // Scale canvas width to fit contentW
        const imgW = contentW;
        const imgH = (canvas.height / canvas.width) * imgW; // total image height in mm

        // Height per page in mm
        const pageContentH = contentH;

        // How many pages
        const totalPages = Math.ceil(imgH / pageContentH);

        // For each page, slice the source canvas
        const sourcePageH = canvas.height / totalPages; // px per page in source canvas

        for (let i = 0; i < totalPages; i++) {
            if (i > 0) pdf.addPage();

            // Create a page-sized canvas slice
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = Math.min(sourcePageH, canvas.height - i * sourcePageH);
            const sliceCtx = sliceCanvas.getContext('2d');

            // Fill white background
            sliceCtx.fillStyle = '#ffffff';
            sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

            // Draw the corresponding slice from the source canvas
            sliceCtx.drawImage(
                canvas,
                0, i * sourcePageH,                         // source x, y
                canvas.width, sliceCanvas.height,            // source w, h
                0, 0,                                        // dest x, y
                sliceCanvas.width, sliceCanvas.height         // dest w, h
            );

            const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
            const sliceH = (sliceCanvas.height / canvas.width) * imgW; // mm height of this slice
            pdf.addImage(sliceData, 'JPEG', margin, margin, contentW, sliceH);
        }

        return pdf.output('blob');
    }

    /**
     * Generate PDF filename from active file or default
     */
    _getPdfFileName() {
        const activeFile = this.storage?.getSession?.()?.activeFile;
        const baseName = activeFile
            ? activeFile.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '')
            : 'document';
        return `${baseName}.pdf`;
    }

    /**
     * Download PDF blob or share on iOS Safari where <a download> may not work
     */
    _downloadOrSharePdf(blob, fileName) {
        const url = URL.createObjectURL(blob);

        // Try <a download> first (works on most browsers)
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Detect iOS Safari where <a download> often doesn't work
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        if (isIOS) {
            // Try navigator.share first
            try {
                const file = new File([blob], fileName, { type: 'application/pdf' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    navigator.share({ files: [file], title: 'RealtimeMD PDF' }).catch(() => {
                        // Share cancelled — open in new tab as fallback
                        window.open(url, '_blank');
                        this.showToast('Tap Share → Save to Files', 'info');
                    });
                    return;
                }
            } catch (e) { /* File constructor may fail on older iOS */ }

            // Fallback: open blob URL in new tab
            window.open(url, '_blank');
            this.showToast('Tap Share → Save to Files', 'info');
        }

        // Revoke URL after delay to allow download to start
        setTimeout(() => URL.revokeObjectURL(url), 15000);
    }

    // ========== Reset Session ==========

    _showResetDialog() {
        const overlay = document.getElementById('reset-dialog-overlay');
        if (!overlay) return;
        overlay.classList.add('visible');

        const cancelBtn = document.getElementById('reset-cancel');
        const confirmBtn = document.getElementById('reset-confirm');

        const cleanup = () => {
            overlay.classList.remove('visible');
            cancelBtn?.removeEventListener('click', onCancel);
            confirmBtn?.removeEventListener('click', onConfirm);
        };

        const onCancel = () => cleanup();
        const onConfirm = async () => {
            cleanup();
            await this._resetSession();
        };

        cancelBtn?.addEventListener('click', onCancel);
        confirmBtn?.addEventListener('click', onConfirm);

        // Also close on overlay click (outside dialog)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup();
        }, { once: true });
    }

    async _resetSession() {
        try {
            // 1. Save theme + language preferences before clearing
            const themeVal = localStorage.getItem(THEME_KEY);
            const langVal = localStorage.getItem('realtimemd-lang');

            // 2. Clear ALL localStorage keys used by this app
            localStorage.removeItem('realtimemd-session');
            localStorage.removeItem(THEME_KEY);
            localStorage.removeItem('realtimemd-lang');

            // 3. Clear any sessionStorage entries
            sessionStorage.clear();

            // 4. Delete the entire IndexedDB database (not just clear stores)
            if (this.fileManager?.db) {
                this.fileManager.db.close();
            }
            await new Promise((resolve, reject) => {
                const req = indexedDB.deleteDatabase('realtimemd-workspace');
                req.onsuccess = () => resolve();
                req.onerror = (e) => reject(e);
                req.onblocked = () => resolve(); // proceed even if blocked
            });

            // 5. Restore preferences (theme + lang persist across reset)
            if (themeVal) localStorage.setItem(THEME_KEY, themeVal);
            if (langVal) localStorage.setItem('realtimemd-lang', langVal);

            // 6. Force clean navigation (replaces current history entry)
            location.replace(location.pathname);
        } catch (e) {
            console.error('Reset session error:', e);
            // Fallback: force reload anyway
            location.replace(location.pathname);
        }
    }

    // ========== GigaReset (Nuclear Wipe) ==========

    _showGigaResetDialog() {
        const overlay = document.getElementById('gigareset-dialog-overlay');
        if (!overlay) return;
        overlay.classList.add('visible');

        const cancelBtn = document.getElementById('gigareset-cancel');
        const confirmBtn = document.getElementById('gigareset-confirm');

        const cleanup = () => {
            overlay.classList.remove('visible');
            cancelBtn?.removeEventListener('click', onCancel);
            confirmBtn?.removeEventListener('click', onConfirm);
        };

        const onCancel = () => cleanup();
        const onConfirm = async () => {
            cleanup();
            await this._gigaReset();
        };

        cancelBtn?.addEventListener('click', onCancel);
        confirmBtn?.addEventListener('click', onConfirm);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup();
        }, { once: true });
    }

    async _gigaReset() {
        this.showToast('Erasing all data…', 'info');

        try {
            // 1. Clear Web Storage
            localStorage.clear();
            sessionStorage.clear();

            // 2. Clear IndexedDB — enumerate all databases and delete each
            if (this.fileManager?.db) {
                this.fileManager.db.close();
            }
            if (indexedDB.databases) {
                try {
                    const dbs = await indexedDB.databases();
                    await Promise.all(dbs.map(db => new Promise((resolve) => {
                        const req = indexedDB.deleteDatabase(db.name);
                        req.onsuccess = () => resolve();
                        req.onerror = () => resolve();
                        req.onblocked = () => resolve();
                    })));
                } catch (e) {
                    console.warn('GigaReset: indexedDB.databases() failed:', e);
                }
            }
            // Always try known DB name as fallback
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase('realtimemd-workspace');
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
            });

            // 3. Clear Cache Storage (Service Worker caches)
            if ('caches' in window) {
                try {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(key => caches.delete(key)));
                } catch (e) {
                    console.warn('GigaReset: caches clear failed:', e);
                }
            }

            // 4. Clear Service Worker registrations
            if ('serviceWorker' in navigator) {
                try {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map(r => r.unregister()));
                } catch (e) {
                    console.warn('GigaReset: SW unregister failed:', e);
                }
            }

            // 5. Clear cookies (best-effort)
            try {
                const cookies = document.cookie.split(';');
                for (const cookie of cookies) {
                    const name = cookie.split('=')[0].trim();
                    if (!name) continue;
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${location.pathname}`;
                }
            } catch (e) {
                console.warn('GigaReset: cookie clear failed:', e);
            }

            console.log('GigaReset: all clearable data erased. Some browser-managed data may remain due to platform restrictions.');

        } catch (e) {
            console.error('GigaReset error:', e);
        }

        // 6. Hard reload — always execute even if some steps failed
        location.replace(location.pathname + location.search);
    }

    // ========== Help Panel ==========

    _showHelp() {
        const overlay = document.getElementById('help-overlay');
        if (!overlay) return;

        // Populate content
        const body = document.getElementById('help-body');
        if (body) body.innerHTML = this._getHelpContent();

        overlay.classList.add('visible');

        // Close handlers
        const closeBtn = document.getElementById('help-close');
        const onClose = () => {
            overlay.classList.remove('visible');
            closeBtn?.removeEventListener('click', onClose);
            document.removeEventListener('keydown', onEsc);
        };
        const onEsc = (e) => { if (e.key === 'Escape') onClose(); };

        closeBtn?.addEventListener('click', onClose);
        document.addEventListener('keydown', onEsc);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) onClose();
        }, { once: true });
    }

    _getHelpContent() {
        return `
<section>
  <h4>${t('help.images')}</h4>
  <p>${t('help.imagesDesc')}</p>
  <pre><code>![${t('help.altText')}](relative/path/to/image.png)</code></pre>
  <p><small>${t('help.imageFormats')}</small></p>
  <p><small>${t('help.imageTip')}</small></p>
</section>
<section>
  <h4>${t('help.math')}</h4>
  <p>${t('help.mathDesc')}</p>
  <pre><code>${t('help.mathInlineLabel')}: $E=mc^2$

${t('help.mathDisplayLabel')}:
$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$</code></pre>
  <p><small>${t('help.mathEscape')}</small></p>
</section>
<section>
  <h4>${t('help.mermaid')}</h4>
  <p>${t('help.mermaidDesc')}</p>
  <pre><code>\`\`\`mermaid
graph TD
  A[${t('help.mermaidStart')}] --> B[${t('help.mermaidProcess')}]
  B --> C[${t('help.mermaidEnd')}]
\`\`\`</code></pre>
</section>
<section>
  <h4>${t('help.pdf')}</h4>
  <p>${t('help.pdfDesc')}</p>
</section>`;
    }

    _bindMobile() {
        this._bindMobileActionBar();
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-removing');
            setTimeout(() => toast.remove(), 200);
        }, 3000);
    }

    _getDefaultContent() {
        return `# Welcome to RealtimeMD ✨

A real-time Markdown editor in your browser!

## Features

- **Live Preview** — Renders as you type
- **Virtual Workspace** — Manage files from the sidebar
- **Image Upload** — Drag & drop to upload files
- **Session Persistence** — Data survives browser close
- **Theme Toggle** — Dark / Light mode
- **Language Switcher** — EN / JA / ZH / HI

## Markdown Syntax

### Text Formatting

**Bold** / *Italic* / ~~Strikethrough~~ / \`Inline Code\`

### Lists

- Bullet item 1
- Bullet item 2
  - Nested

1. Numbered 1
2. Numbered 2

### Checklist

- [x] Completed task
- [ ] Pending task

### Code Block

\`\`\`javascript
function hello() {
  console.log("Hello, RealtimeMD!");
}
\`\`\`

### Table

| Feature | Status |
| --- | --- |
| Editor | ✅ |
| Preview | ✅ |
| File Manager | ✅ |

### Blockquote

> This is a blockquote.
> Supports multiple lines.

---

Keyboard shortcuts: **Ctrl+B** (Bold), **Ctrl+I** (Italic), **Ctrl+K** (Link), **Ctrl+S** (Save)
`;
    }
}

// Boot
const app = new App();
app.init().catch(console.error);

// Expose for debugging & plugin access
window.realtimeMD = app;

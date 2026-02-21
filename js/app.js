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
import { FindReplace } from './findreplace.js';
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
        this.findReplace = null;
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
        this.findReplace = new FindReplace(this.editor);

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

    _savePreviewAsPdf() {
        if (this._isMobileDevice()) {
            this.showToast('Use the print dialog to save as PDF.', 'info');
        }
        this._desktopPrintPdf();
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
     * Open new window with clean preview HTML and trigger print dialog.
     * Used for both desktop and mobile PDF export.
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
  }, 300);
})();
</script>
</body>
</html>`);
        printWin.document.close();
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

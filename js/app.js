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
        this._bindTheme();
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

        // Export/Import
        document.getElementById('ribbon-export')?.addEventListener('click', () => {
            this.storage.exportWorkspace();
        });
        document.getElementById('ribbon-import')?.addEventListener('click', () => {
            this.storage.importWorkspace();
        });
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

    _bindTheme() {
        if (!document.documentElement.getAttribute('data-theme')) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    _toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        this.extensions.runHook('onThemeChange', { theme: next });
        this.showToast(`テーマ: ${next === 'dark' ? 'ダーク' : 'ライト'}`, 'info');
    }

    _bindMobile() {
        // Nothing extra — CSS handles layout
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

リアルタイムMarkdownエディターへようこそ！

## Features

- **リアルタイムプレビュー** — 入力と同時にレンダリング
- **仮想ワークスペース** — 左のサイドバーからファイルを管理
- **画像アップロード** — ドラッグ&ドロップでファイルをアップロード
- **セッション保存** — ブラウザを閉じてもデータが残る
- **テーマ切替** — ダーク / ライトモード対応

## Markdown Syntax

### テキスト装飾

**太字** / *斜体* / ~~取り消し線~~ / \`インラインコード\`

### リスト

- 箇条書き1
- 箇条書き2
  - ネスト

1. 番号付き1
2. 番号付き2

### チェックリスト

- [x] 完了タスク
- [ ] 未完了タスク

### コードブロック

\`\`\`javascript
function hello() {
  console.log("Hello, RealtimeMD!");
}
\`\`\`

### テーブル

| 機能 | 状態 |
| --- | --- |
| エディター | ✅ |
| プレビュー | ✅ |
| ファイル管理 | ✅ |

### 引用

> これは引用文です。
> 複数行対応。

---

キーボードショートカット: **Ctrl+B** (太字), **Ctrl+I** (斜体), **Ctrl+K** (リンク), **Ctrl+S** (保存)
`;
    }
}

// Boot
const app = new App();
app.init().catch(console.error);

// Expose for debugging & plugin access
window.realtimeMD = app;

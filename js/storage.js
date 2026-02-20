/**
 * storage.js — Session Persistence & Workspace Export/Import
 * Uses localStorage for editor state and IndexedDB (via FileManager) for files.
 */
import { t } from './i18n.js';
const STORAGE_KEY = 'realtimemd-session';
const SESSION_VERSION = 1;

export class Storage {
    constructor(app) {
        this.app = app;
        this._autoSaveTimer = null;
        this._init();
    }

    _init() {
        // Auto-save on editor changes
        this.app.eventBus.on('editor:change', () => this._autoSave());

        // Save before unload
        window.addEventListener('beforeunload', () => {
            this._saveSessionSync();
        });

        // Periodic auto-save every 30 seconds
        this._autoSaveTimer = setInterval(() => this._saveSession(), 30000);
    }

    _autoSave() {
        clearTimeout(this._debounce);
        this._debounce = setTimeout(() => {
            this._saveSession();
            this._persistActiveFile();
        }, 1000);
    }

    /**
     * Persist the current editor content to IndexedDB for the active file
     */
    async _persistActiveFile() {
        try {
            const ws = this.app.workspace;
            const fm = this.app.fileManager;
            if (!ws || !fm || !ws.activeFilePath) return;

            const content = this.app.editor.getValue();
            const file = await fm.getFile(ws.activeFilePath);
            if (file) {
                await fm.saveFile(file.path, file.name, file.type, content, 'file');
            }
        } catch (e) {
            console.warn('Auto-persist error:', e);
        }
    }

    _saveSession() {
        try {
            const session = {
                version: SESSION_VERSION,
                timestamp: Date.now(),
                editorContent: this.app.editor.getValue(),
                activeFilePath: this.app.workspace?.getActiveFilePath() || null,
                sidebarOpen: this.app.isSidebarOpen || false,
                theme: document.documentElement.getAttribute('data-theme') || 'dark',
                expandedDirs: Array.from(this.app.workspace?.expandedDirs || [])
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (e) {
            console.warn('Session save error:', e);
        }
    }

    _saveSessionSync() {
        // Synchronous version for beforeunload
        this._saveSession();
    }

    getSession() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            if (session.version !== SESSION_VERSION) return null;
            return session;
        } catch (e) {
            return null;
        }
    }

    async restoreSession() {
        const session = this.getSession();
        if (!session) return false;

        // Restore theme
        if (session.theme) {
            document.documentElement.setAttribute('data-theme', session.theme);
        }

        // Restore expanded dirs
        if (session.expandedDirs && this.app.workspace) {
            this.app.workspace.expandedDirs = new Set(session.expandedDirs);
        }

        // Restore editor content
        if (session.editorContent !== undefined) {
            this.app.editor.setValue(session.editorContent);
            this.app.editor.markSaved();
        }

        // Restore active file
        if (session.activeFilePath) {
            this.app.workspace.activeFilePath = session.activeFilePath;
            const fileName = session.activeFilePath.split('/').pop();
            this.app.editor.setFileName(fileName);
        }

        return true;
    }

    clearSession() {
        localStorage.removeItem(STORAGE_KEY);
    }

    /**
     * Export entire workspace as a JSON blob (downloadable file)
     */
    async exportWorkspace() {
        const fm = this.app.fileManager;
        if (!fm) return;

        const filesData = await fm.exportAllAsObj();
        const session = this.getSession() || {};

        const exportData = {
            version: SESSION_VERSION,
            exportedAt: new Date().toISOString(),
            session: {
                editorContent: this.app.editor.getValue(),
                activeFilePath: this.app.workspace?.getActiveFilePath() || null,
                theme: document.documentElement.getAttribute('data-theme') || 'dark',
                expandedDirs: Array.from(this.app.workspace?.expandedDirs || [])
            },
            files: filesData
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `realtimemd-workspace-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.app.showToast(t('toast.exportOk'), 'success');
    }

    /**
     * Import workspace from a JSON file
     */
    async importWorkspace() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (!data.version || !data.files) {
                    this.app.showToast(t('toast.invalidWorkspace'), 'error');
                    return;
                }

                const fm = this.app.fileManager;

                // Ask if user wants to merge or replace
                const replace = confirm(t('dialog.replaceOrMerge'));

                if (replace) {
                    await fm.clearAll();
                }

                await fm.importFromObj(data.files);

                // Restore session state
                if (data.session) {
                    if (data.session.editorContent !== undefined) {
                        this.app.editor.setValue(data.session.editorContent);
                    }
                    if (data.session.theme) {
                        document.documentElement.setAttribute('data-theme', data.session.theme);
                    }
                    if (data.session.expandedDirs && this.app.workspace) {
                        this.app.workspace.expandedDirs = new Set(data.session.expandedDirs);
                    }
                    if (data.session.activeFilePath && this.app.workspace) {
                        this.app.workspace.activeFilePath = data.session.activeFilePath;
                        const fileName = data.session.activeFilePath.split('/').pop();
                        this.app.editor.setFileName(fileName);
                    }
                }

                await this.app.workspace?.refresh();
                this.app.eventBus.emit('files:changed');
                this.app.showToast(t('toast.importOk'), 'success');
            } catch (e) {
                console.error('Import error:', e);
                this.app.showToast(t('toast.importError'), 'error');
            }
        };

        input.click();
    }

    destroy() {
        clearInterval(this._autoSaveTimer);
        clearTimeout(this._debounce);
    }
}

/**
 * workspace.js — VSCode-like Virtual Workspace / File Explorer Sidebar
 */
export class Workspace {
    constructor(app) {
        this.app = app;
        this.sidebar = document.getElementById('sidebar');
        this.fileTreeEl = document.getElementById('file-tree');
        this.expandedDirs = new Set(['/']);
        this.activeFilePath = null;
        this.contextMenu = document.getElementById('context-menu');
        this._contextTarget = null;

        this._bindEvents();
    }

    _bindEvents() {
        // Context menu close
        document.addEventListener('click', () => this._hideContextMenu());
        document.addEventListener('contextmenu', (e) => {
            if (!this.fileTreeEl.contains(e.target)) {
                this._hideContextMenu();
            }
        });

        // Sidebar header actions
        document.getElementById('btn-new-file')?.addEventListener('click', () => this.createNewFile());
        document.getElementById('btn-new-folder')?.addEventListener('click', () => this.createNewFolder());
        document.getElementById('btn-upload-file')?.addEventListener('click', () => this.uploadFiles());

        // Drag and drop
        const mainContainer = document.querySelector('.main-container');
        const dropOverlay = document.getElementById('drop-zone-overlay');

        mainContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropOverlay.classList.add('visible');
        });

        mainContainer.addEventListener('dragleave', (e) => {
            if (!mainContainer.contains(e.relatedTarget)) {
                dropOverlay.classList.remove('visible');
            }
        });

        mainContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropOverlay.classList.remove('visible');
            this._handleDrop(e);
        });

        // Context menu actions
        document.getElementById('ctx-rename')?.addEventListener('click', () => this._renameItem());
        document.getElementById('ctx-delete')?.addEventListener('click', () => this._deleteItem());
        document.getElementById('ctx-new-file')?.addEventListener('click', () => this.createNewFile(this._contextTarget));
        document.getElementById('ctx-new-folder')?.addEventListener('click', () => this.createNewFolder(this._contextTarget));
    }

    async refresh() {
        const fm = this.app.fileManager;
        if (!fm) return;

        const tree = await fm.buildFileTree();
        this.fileTreeEl.innerHTML = '';
        this._renderTree(tree.children, this.fileTreeEl, 0);
    }

    _renderTree(items, parentEl, depth) {
        for (const item of items) {
            const el = document.createElement('div');
            el.className = 'file-tree-item';
            if (item.path === this.activeFilePath) el.classList.add('active');
            el.style.setProperty('--depth', depth);
            el.dataset.path = item.path;
            el.dataset.kind = item.kind;

            if (item.kind === 'directory') {
                const isExpanded = this.expandedDirs.has(item.path);
                el.innerHTML = `
          <svg class="chevron ${isExpanded ? 'expanded' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span class="file-tree-item-name">${this._escapeHtml(item.name)}</span>
          <span class="file-tree-item-actions">
            <button title="Delete" data-action="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </span>
        `;

                el.addEventListener('click', (e) => {
                    if (e.target.closest('[data-action]')) return;
                    this._toggleDir(item.path);
                });

                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this._showContextMenu(e, item);
                });

                // Delete button
                el.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._contextTarget = item;
                    this._deleteItem();
                });

                parentEl.appendChild(el);

                if (isExpanded && item.children) {
                    this._renderTree(item.children, parentEl, depth + 1);
                }
            } else {
                const icon = this._getFileIcon(item.name, item.type);
                el.innerHTML = `
          ${icon}
          <span class="file-tree-item-name">${this._escapeHtml(item.name)}</span>
          <span class="file-tree-item-actions">
            <button title="Delete" data-action="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </span>
        `;

                el.addEventListener('click', (e) => {
                    if (e.target.closest('[data-action]')) return;
                    this._openFile(item);
                });

                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this._showContextMenu(e, item);
                });

                el.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._contextTarget = item;
                    this._deleteItem();
                });

                parentEl.appendChild(el);
            }
        }
    }

    _getFileIcon(name, type) {
        if (type && type.startsWith('image/')) {
            return '<svg class="image-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
        }
        if (name.endsWith('.md') || name.endsWith('.markdown')) {
            return '<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
        }
        return '<svg class="file-icon" style="color:var(--color-text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    }

    _toggleDir(path) {
        if (this.expandedDirs.has(path)) {
            this.expandedDirs.delete(path);
        } else {
            this.expandedDirs.add(path);
        }
        this.refresh();
    }

    async _openFile(item) {
        const fm = this.app.fileManager;
        const file = await fm.getFile(item.path);
        if (!file) return;

        this.activeFilePath = item.path;

        if (item.name.endsWith('.md') || item.name.endsWith('.markdown') ||
            (file.type && file.type.startsWith('text/'))) {
            let content = file.content;
            if (content instanceof ArrayBuffer) {
                content = new TextDecoder().decode(content);
            }
            this.app.editor.setValue(content);
            this.app.editor.setFileName(item.name);
            this.app.editor.markSaved();
        } else {
            this.app.showToast(`Cannot edit binary file: ${item.name}`, 'info');
        }

        this.refresh();
    }

    async createNewFile(parentItem = null) {
        const name = prompt('ファイル名を入力:', 'untitled.md');
        if (!name) return;

        const parentPath = parentItem ? (parentItem.kind === 'directory' ? parentItem.path : this._getDirPath(parentItem.path)) : '';
        const path = parentPath + '/' + name;

        const fm = this.app.fileManager;
        const type = name.endsWith('.md') ? 'text/markdown' : 'text/plain';
        await fm.saveFile(path, name, type, '', 'file');

        if (parentPath) this.expandedDirs.add(parentPath);
        await this.refresh();
        this.app.eventBus.emit('files:changed');

        // Open the new file
        this._openFile({ path, name, type });
    }

    async createNewFolder(parentItem = null) {
        const name = prompt('フォルダ名を入力:', 'new-folder');
        if (!name) return;

        const parentPath = parentItem ? (parentItem.kind === 'directory' ? parentItem.path : this._getDirPath(parentItem.path)) : '';
        const path = parentPath + '/' + name;

        const fm = this.app.fileManager;
        await fm.saveFile(path, name, '', null, 'directory');

        if (parentPath) this.expandedDirs.add(parentPath);
        this.expandedDirs.add(path);
        await this.refresh();
    }

    async uploadFiles() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '*/*';

        input.onchange = async () => {
            await this._processFiles(input.files, '');
        };

        input.click();
    }

    async _handleDrop(e) {
        const items = e.dataTransfer.items;
        if (!items) return;

        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    await this._uploadSingleFile(file, '');
                }
            }
        }

        await this.refresh();
        this.app.eventBus.emit('files:changed');
        this.app.showToast('ファイルをアップロードしました', 'success');
    }

    async _processFiles(files, parentPath) {
        for (const file of files) {
            await this._uploadSingleFile(file, parentPath);
        }
        await this.refresh();
        this.app.eventBus.emit('files:changed');
        this.app.showToast(`${files.length}個のファイルをアップロードしました`, 'success');
    }

    async _uploadSingleFile(file, parentPath) {
        const fm = this.app.fileManager;
        const path = parentPath + '/' + file.name;
        const content = await file.arrayBuffer();
        await fm.saveFile(path, file.name, file.type, content, 'file');
    }

    _showContextMenu(e, item) {
        this._contextTarget = item;
        this.contextMenu.style.left = e.clientX + 'px';
        this.contextMenu.style.top = e.clientY + 'px';
        this.contextMenu.classList.add('visible');

        // Show/hide directory-only options
        const newFileBtn = document.getElementById('ctx-new-file');
        const newFolderBtn = document.getElementById('ctx-new-folder');
        if (item.kind === 'directory') {
            newFileBtn && (newFileBtn.style.display = '');
            newFolderBtn && (newFolderBtn.style.display = '');
        } else {
            newFileBtn && (newFileBtn.style.display = 'none');
            newFolderBtn && (newFolderBtn.style.display = 'none');
        }
    }

    _hideContextMenu() {
        this.contextMenu.classList.remove('visible');
    }

    async _renameItem() {
        this._hideContextMenu();
        const item = this._contextTarget;
        if (!item) return;

        const newName = prompt('新しい名前:', item.name);
        if (!newName || newName === item.name) return;

        const fm = this.app.fileManager;
        const parentPath = this._getDirPath(item.path);
        const newPath = parentPath + '/' + newName;
        await fm.renameFile(item.path, newPath, newName);

        if (this.activeFilePath === item.path) {
            this.activeFilePath = newPath;
            this.app.editor.setFileName(newName);
        }

        await this.refresh();
        this.app.eventBus.emit('files:changed');
    }

    async _deleteItem() {
        this._hideContextMenu();
        const item = this._contextTarget;
        if (!item) return;

        if (!confirm(`"${item.name}" を削除しますか？`)) return;

        const fm = this.app.fileManager;
        await fm.deleteFile(item.path);

        if (this.activeFilePath === item.path) {
            this.activeFilePath = null;
            this.app.editor.setValue('');
            this.app.editor.setFileName('untitled.md');
        }

        await this.refresh();
        this.app.eventBus.emit('files:changed');
        this.app.showToast(`"${item.name}" を削除しました`, 'info');
    }

    _getDirPath(path) {
        const idx = path.lastIndexOf('/');
        return idx > 0 ? path.substring(0, idx) : '';
    }

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async saveCurrentFile() {
        if (!this.activeFilePath) {
            // Create a new file for current content
            await this.createNewFile();
            return;
        }

        const fm = this.app.fileManager;
        const content = this.app.editor.getValue();
        const file = await fm.getFile(this.activeFilePath);
        if (file) {
            await fm.saveFile(file.path, file.name, file.type, content, 'file');
            this.app.editor.markSaved();
            this.app.showToast('保存しました', 'success');
        }
    }

    getActiveFilePath() {
        return this.activeFilePath;
    }
}

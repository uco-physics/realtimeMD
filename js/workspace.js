/**
 * workspace.js — VSCode-like Virtual Workspace / File Explorer Sidebar
 * Full-featured: inline rename, context menu, drag-and-drop, file operations
 */
import { computeRelativePath, isImageFile } from './pathutils.js';
import { t } from './i18n.js';

export class Workspace {
    constructor(app) {
        this.app = app;
        this.sidebar = document.getElementById('sidebar');
        this.fileTreeEl = document.getElementById('file-tree');
        this.expandedDirs = new Set(['/']);
        this.activeFilePath = null;
        this.contextMenu = document.getElementById('context-menu');
        this._contextTarget = null;
        this._renameInput = null; // Currently active inline rename input

        this._bindEvents();
    }

    _bindEvents() {
        // Context menu close — but NOT if clicking inside the context menu itself
        document.addEventListener('click', (e) => {
            if (this.contextMenu && !this.contextMenu.contains(e.target)) {
                this._hideContextMenu();
            }
        });

        document.addEventListener('contextmenu', (e) => {
            if (!this.fileTreeEl.contains(e.target)) {
                this._hideContextMenu();
            }
        });

        // Keyboard shortcut for closing context menu
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this._hideContextMenu();
                this._cancelInlineRename();
            }
        });

        // Sidebar header actions
        document.getElementById('btn-new-file')?.addEventListener('click', () => this.createNewFile());
        document.getElementById('btn-new-folder')?.addEventListener('click', () => this.createNewFolder());
        document.getElementById('btn-upload-file')?.addEventListener('click', () => this.uploadFiles());
        document.getElementById('btn-collapse-all')?.addEventListener('click', () => this.collapseAll());

        // Drag and drop on the entire main container
        const mainContainer = document.querySelector('.main-container');
        const dropOverlay = document.getElementById('drop-zone-overlay');

        let dragCounter = 0;
        mainContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        mainContainer.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dragCounter++;
            dropOverlay.classList.add('visible');
        });

        mainContainer.addEventListener('dragleave', (e) => {
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                dropOverlay.classList.remove('visible');
            }
        });

        mainContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter = 0;
            dropOverlay.classList.remove('visible');
            this._handleDrop(e);
        });

        // Context menu item click handlers — with stopPropagation to prevent document click
        this._bindContextMenuItem('ctx-rename', () => this._startInlineRename());
        this._bindContextMenuItem('ctx-delete', () => this._deleteItem());
        this._bindContextMenuItem('ctx-new-file', () => this.createNewFile(this._contextTarget));
        this._bindContextMenuItem('ctx-new-folder', () => this.createNewFolder(this._contextTarget));
        this._bindContextMenuItem('ctx-duplicate', () => this._duplicateItem());
        this._bindContextMenuItem('ctx-download', () => this._downloadItem());
        this._bindContextMenuItem('ctx-copy-path', () => this._copyPath());
        this._bindContextMenuItem('ctx-copy-relative-path', () => this._copyRelativePath());
        this._bindContextMenuItem('ctx-copy-md-image', () => this._copyAsMarkdownImage());
    }

    _bindContextMenuItem(id, handler) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent document click from hiding menu before handler runs
            this._hideContextMenu();
            handler();
        });
    }

    // ========== File Tree Rendering ==========

    async refresh() {
        const fm = this.app.fileManager;
        if (!fm) return;

        const tree = await fm.buildFileTree();
        this.fileTreeEl.innerHTML = '';

        if (tree.children.length === 0) {
            this._renderEmptyState();
        } else {
            this._renderTree(tree.children, this.fileTreeEl, 0);
        }
    }

    _renderEmptyState() {
        const el = document.createElement('div');
        el.className = 'empty-state';
        el.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:36px;height:36px;opacity:0.3">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <p style="font-size:0.75rem;color:var(--color-text-muted)">${t('sidebar.empty')}<br>${t('sidebar.emptyHint').replace(/\n/g, '<br>')}</p>
    `;
        this.fileTreeEl.appendChild(el);
    }

    _renderTree(items, parentEl, depth) {
        for (const item of items) {
            const el = document.createElement('div');
            el.className = 'file-tree-item';
            if (item.path === this.activeFilePath) el.classList.add('active');
            el.style.setProperty('--depth', depth);
            el.dataset.path = item.path;
            el.dataset.kind = item.kind;
            el.dataset.name = item.name;

            if (item.kind === 'directory') {
                const isExpanded = this.expandedDirs.has(item.path);
                el.innerHTML = `
          <svg class="chevron ${isExpanded ? 'expanded' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span class="file-tree-item-name">${this._escapeHtml(item.name)}</span>
          <span class="file-tree-item-actions">
            <button title="名前を変更" data-action="rename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
            <button title="削除" data-action="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </span>
        `;

                el.addEventListener('click', (e) => {
                    if (e.target.closest('[data-action]')) return;
                    this._toggleDir(item.path);
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
            <button title="名前を変更" data-action="rename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
            <button title="削除" data-action="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </span>
        `;

                el.addEventListener('click', (e) => {
                    if (e.target.closest('[data-action]')) return;
                    this._openFile(item);
                });

                parentEl.appendChild(el);
            }

            // Shared event binding for both file and directory items
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showContextMenu(e, item);
            });

            // Double-click to start inline rename
            el.addEventListener('dblclick', (e) => {
                if (e.target.closest('[data-action]')) return;
                if (item.kind === 'file') {
                    // For files: double-click opens; use rename button or context menu for rename
                    return;
                }
                // For directories: double-click starts rename
                this._contextTarget = item;
                this._startInlineRename();
            });

            // Hover action buttons
            el.querySelector('[data-action="rename"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._contextTarget = item;
                this._startInlineRename();
            });

            el.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._contextTarget = item;
                this._deleteItem();
            });
        }
    }

    // ========== File Icons ==========

    _getFileIcon(name, type) {
        if (type && type.startsWith('image/')) {
            return '<svg class="image-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
        }
        const ext = name.split('.').pop().toLowerCase();
        const iconColors = {
            'md': 'var(--color-accent)',
            'markdown': 'var(--color-accent)',
            'js': 'var(--color-accent-yellow)',
            'ts': 'var(--color-accent)',
            'json': 'var(--color-accent-yellow)',
            'html': 'var(--color-accent-peach)',
            'css': 'var(--color-accent-secondary)',
            'svg': 'var(--color-accent-green)',
            'txt': 'var(--color-text-muted)',
            'xml': 'var(--color-accent-peach)',
            'yml': 'var(--color-accent-red)',
            'yaml': 'var(--color-accent-red)',
        };
        const color = iconColors[ext] || 'var(--color-text-muted)';

        if (ext === 'md' || ext === 'markdown') {
            return `<svg class="file-icon" style="color:${color}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
        }
        return `<svg class="file-icon" style="color:${color}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    }

    // ========== Directory Operations ==========

    _toggleDir(path) {
        if (this.expandedDirs.has(path)) {
            this.expandedDirs.delete(path);
        } else {
            this.expandedDirs.add(path);
        }
        this.refresh();
    }

    collapseAll() {
        this.expandedDirs.clear();
        this.expandedDirs.add('/'); // Keep root
        this.refresh();
        this.app.showToast(t('toast.collapsed'), 'info');
    }

    // ========== File Open ==========

    async _openFile(item) {
        const fm = this.app.fileManager;
        const file = await fm.getFile(item.path);
        if (!file) return;

        this.activeFilePath = item.path;

        if (this._isTextFile(item.name, file.type)) {
            let content = file.content;
            if (content instanceof ArrayBuffer) {
                content = new TextDecoder().decode(content);
            }
            if (typeof content !== 'string') content = '';
            this.app.editor.setValue(content);
            this.app.editor.setFileName(item.name);
            this.app.editor.markSaved();
        } else {
            this.app.showToast(t('toast.binaryNotEditable', { name: item.name }), 'info');
        }

        this.refresh();
    }

    _isTextFile(name, type) {
        if (type && type.startsWith('text/')) return true;
        const textExts = ['md', 'markdown', 'txt', 'json', 'js', 'ts', 'css', 'html', 'htm',
            'xml', 'svg', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'sh', 'bat',
            'py', 'rb', 'go', 'rs', 'c', 'cpp', 'h', 'java', 'php'];
        const ext = name.split('.').pop().toLowerCase();
        return textExts.includes(ext);
    }

    // ========== Create File / Folder ==========

    async createNewFile(parentItem = null) {
        const parentPath = this._getParentPath(parentItem);

        // Create file with temporary name, then start inline rename
        const tempName = this._getUniqueName(parentPath, 'untitled.md');
        const path = parentPath + '/' + tempName;

        const fm = this.app.fileManager;
        const type = tempName.endsWith('.md') ? 'text/markdown' : 'text/plain';
        await fm.saveFile(path, tempName, type, '', 'file');

        if (parentPath) this.expandedDirs.add(parentPath);
        await this.refresh();
        this.app.eventBus.emit('files:changed');

        // Start inline rename for the new file
        this._contextTarget = { path, name: tempName, kind: 'file', type };
        this._startInlineRename();
    }

    async createNewFolder(parentItem = null) {
        const parentPath = this._getParentPath(parentItem);

        const tempName = this._getUniqueName(parentPath, 'new-folder');
        const path = parentPath + '/' + tempName;

        const fm = this.app.fileManager;
        await fm.saveFile(path, tempName, '', null, 'directory');

        if (parentPath) this.expandedDirs.add(parentPath);
        this.expandedDirs.add(path);
        await this.refresh();

        // Start inline rename for the new folder
        this._contextTarget = { path, name: tempName, kind: 'directory' };
        this._startInlineRename();
    }

    _getParentPath(parentItem) {
        if (!parentItem) return '';
        return parentItem.kind === 'directory' ? parentItem.path : this._getDirPath(parentItem.path);
    }

    _getUniqueName(parentPath, baseName) {
        // Check if name already exists, append number if so
        // For simplicity, we'll just use the base name—user can rename
        return baseName;
    }

    // ========== Inline Rename ==========

    _startInlineRename() {
        const item = this._contextTarget;
        if (!item) return;

        // Find the tree item element
        const el = this.fileTreeEl.querySelector(`[data-path="${CSS.escape(item.path)}"]`);
        if (!el) return;

        const nameSpan = el.querySelector('.file-tree-item-name');
        if (!nameSpan) return;

        // Hide the name span and show an input
        const originalName = item.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'file-tree-rename-input';
        input.value = originalName;

        // Select filename without extension for files
        nameSpan.style.display = 'none';
        nameSpan.parentElement.insertBefore(input, nameSpan.nextSibling);
        input.focus();

        if (item.kind === 'file') {
            const dotIdx = originalName.lastIndexOf('.');
            if (dotIdx > 0) {
                input.setSelectionRange(0, dotIdx);
            } else {
                input.select();
            }
        } else {
            input.select();
        }

        // Hide actions while renaming
        const actions = el.querySelector('.file-tree-item-actions');
        if (actions) actions.style.display = 'none';

        this._renameInput = { input, nameSpan, actions, item, el };

        const finishRename = async (commit) => {
            if (!this._renameInput) return;

            const newName = input.value.trim();
            input.remove();
            nameSpan.style.display = '';
            if (actions) actions.style.display = '';
            this._renameInput = null;

            if (commit && newName && newName !== originalName) {
                await this._doRename(item, newName);
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishRename(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishRename(false);
            }
            e.stopPropagation(); // Don't trigger editor shortcuts
        });

        input.addEventListener('blur', () => {
            // Small timeout to allow click-based submit
            setTimeout(() => finishRename(true), 100);
        });

        // Prevent click on input from opening file
        input.addEventListener('click', (e) => e.stopPropagation());
    }

    _cancelInlineRename() {
        if (!this._renameInput) return;
        const { input, nameSpan, actions } = this._renameInput;
        input.remove();
        nameSpan.style.display = '';
        if (actions) actions.style.display = '';
        this._renameInput = null;
    }

    async _doRename(item, newName) {
        const fm = this.app.fileManager;
        const parentPath = this._getDirPath(item.path);
        const newPath = parentPath + '/' + newName;

        // Check if target already exists
        const existing = await fm.getFile(newPath);
        if (existing && existing.path !== item.path) {
            this.app.showToast(t('toast.existsError', { name: newName }), 'error');
            return;
        }

        await fm.renameFile(item.path, newPath, newName);

        if (this.activeFilePath === item.path) {
            this.activeFilePath = newPath;
            this.app.editor.setFileName(newName);
        }

        // Update expanded dirs if directory was renamed
        if (item.kind === 'directory') {
            const newExpanded = new Set();
            for (const dir of this.expandedDirs) {
                if (dir === item.path) {
                    newExpanded.add(newPath);
                } else if (dir.startsWith(item.path + '/')) {
                    newExpanded.add(newPath + dir.substring(item.path.length));
                } else {
                    newExpanded.add(dir);
                }
            }
            this.expandedDirs = newExpanded;
        }

        await this.refresh();
        this.app.eventBus.emit('files:changed');
        this.app.showToast(t('toast.renamed', { name: newName }), 'success');
    }

    // ========== Upload / Drop ==========

    async uploadFiles() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '*/*';

        input.onchange = async () => {
            if (input.files.length > 0) {
                await this._processFiles(input.files, '');
            }
        };

        input.click();
    }

    async _handleDrop(e) {
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const items = [];
        for (let i = 0; i < files.length; i++) {
            items.push(files[i]);
        }

        for (const file of items) {
            await this._uploadSingleFile(file, '');
        }

        await this.refresh();
        this.app.eventBus.emit('files:changed');
        this.app.showToast(t('toast.uploaded', { count: items.length }), 'success');
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

    // ========== Context Menu ==========

    _showContextMenu(e, item) {
        this._contextTarget = item;

        // Position context menu
        const menuWidth = 200;
        const menuHeight = 240;
        let x = e.clientX;
        let y = e.clientY;

        // Keep menu within viewport
        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;

        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';
        this.contextMenu.classList.add('visible');

        // Show/hide directory-only options
        const newFileBtn = document.getElementById('ctx-new-file');
        const newFolderBtn = document.getElementById('ctx-new-folder');
        const downloadBtn = document.getElementById('ctx-download');

        // New context menu elements
        const copyRelativeBtn = document.getElementById('ctx-copy-relative-path');
        const copyMdImageBtn = document.getElementById('ctx-copy-md-image');

        if (item.kind === 'directory') {
            newFileBtn && (newFileBtn.style.display = '');
            newFolderBtn && (newFolderBtn.style.display = '');
            downloadBtn && (downloadBtn.style.display = 'none');
            copyRelativeBtn && (copyRelativeBtn.style.display = 'none');
            copyMdImageBtn && (copyMdImageBtn.style.display = 'none');
        } else {
            newFileBtn && (newFileBtn.style.display = 'none');
            newFolderBtn && (newFolderBtn.style.display = 'none');
            downloadBtn && (downloadBtn.style.display = '');
            copyRelativeBtn && (copyRelativeBtn.style.display = '');
            // Only show "Copy as Markdown image" for image files
            copyMdImageBtn && (copyMdImageBtn.style.display = isImageFile(item.name) ? '' : 'none');
        }
    }

    _hideContextMenu() {
        this.contextMenu.classList.remove('visible');
    }

    // ========== Duplicate ==========

    async _duplicateItem() {
        const item = this._contextTarget;
        if (!item || item.kind === 'directory') return;

        const fm = this.app.fileManager;
        const file = await fm.getFile(item.path);
        if (!file) return;

        const parentPath = this._getDirPath(item.path);
        const ext = item.name.includes('.') ? '.' + item.name.split('.').pop() : '';
        const baseName = ext ? item.name.slice(0, -ext.length) : item.name;
        const newName = baseName + ' (copy)' + ext;
        const newPath = parentPath + '/' + newName;

        await fm.saveFile(newPath, newName, file.type, file.content, 'file');
        await this.refresh();
        this.app.eventBus.emit('files:changed');
        this.app.showToast(t('toast.duplicated', { name: newName }), 'success');
    }

    // ========== Download ==========

    async _downloadItem() {
        const item = this._contextTarget;
        if (!item || item.kind === 'directory') return;

        const fm = this.app.fileManager;
        const file = await fm.getFile(item.path);
        if (!file || file.content == null) return;

        const blob = new Blob([file.content], { type: file.type || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.name;
        a.click();
        URL.revokeObjectURL(url);
        this.app.showToast(t('toast.downloaded', { name: item.name }), 'success');
    }

    // ========== Copy Path ==========

    _copyPath() {
        const item = this._contextTarget;
        if (!item) return;

        navigator.clipboard.writeText(item.path).then(() => {
            this.app.showToast(t('toast.pathCopied'), 'info');
        }).catch(() => {
            this._fallbackCopy(item.path);
            this.app.showToast(t('toast.pathCopied'), 'info');
        });
    }

    // ========== Copy Relative Path ==========

    _copyRelativePath() {
        const item = this._contextTarget;
        if (!item) return;

        const relativePath = computeRelativePath(
            this.activeFilePath || '/',
            item.path
        );

        navigator.clipboard.writeText(relativePath).then(() => {
            this.app.showToast(t('toast.relativePathCopied'), 'info');
        }).catch(() => {
            this._fallbackCopy(relativePath);
            this.app.showToast(t('toast.relativePathCopied'), 'info');
        });
    }

    // ========== Copy as Markdown Image ==========

    _copyAsMarkdownImage() {
        const item = this._contextTarget;
        if (!item) return;

        const relativePath = computeRelativePath(
            this.activeFilePath || '/',
            item.path
        );
        const mdImage = `![${item.name}](${relativePath})`;

        navigator.clipboard.writeText(mdImage).then(() => {
            this.app.showToast(t('toast.mdImageCopied'), 'info');
        }).catch(() => {
            this._fallbackCopy(mdImage);
            this.app.showToast(t('toast.mdImageCopied'), 'info');
        });
    }

    // ========== Clipboard Fallback ==========

    _fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }

    // ========== Delete ==========

    async _deleteItem() {
        const item = this._contextTarget;
        if (!item) return;

        const itemType = item.kind === 'directory' ? t('dialog.folderType') : t('dialog.fileType');
        if (!confirm(t('dialog.deleteConfirm', { type: itemType, name: item.name }))) return;

        const fm = this.app.fileManager;
        await fm.deleteFile(item.path);

        if (this.activeFilePath === item.path) {
            this.activeFilePath = null;
            this.app.editor.setValue('');
            this.app.editor.setFileName('untitled.md');
        }

        // Remove expanded dir entry if directory
        if (item.kind === 'directory') {
            this.expandedDirs.delete(item.path);
            // Remove child dirs
            for (const dir of [...this.expandedDirs]) {
                if (dir.startsWith(item.path + '/')) {
                    this.expandedDirs.delete(dir);
                }
            }
        }

        await this.refresh();
        this.app.eventBus.emit('files:changed');
        this.app.showToast(t('toast.deleted', { name: item.name }), 'info');
    }

    // ========== Save Current File ==========

    async saveCurrentFile() {
        const fm = this.app.fileManager;
        const content = this.app.editor.getValue();

        if (!this.activeFilePath) {
            // No active file — silently create /untitled.md
            const path = '/untitled.md';
            const name = 'untitled.md';
            await fm.saveFile(path, name, 'text/markdown', content, 'file');
            this.activeFilePath = path;
            this.app.editor.setFileName(name);
            this.app.editor.markSaved();
            await this.refresh();
            this.app.eventBus.emit('files:changed');
            this.app.showToast(t('toast.saved'), 'success');
            return;
        }

        const file = await fm.getFile(this.activeFilePath);
        if (file) {
            await fm.saveFile(file.path, file.name, file.type, content, 'file');
            this.app.editor.markSaved();
            this.app.showToast(t('toast.saved'), 'success');
        } else {
            // File was deleted but path still set — recreate
            const name = this.activeFilePath.split('/').pop();
            await fm.saveFile(this.activeFilePath, name, 'text/markdown', content, 'file');
            this.app.editor.markSaved();
            await this.refresh();
            this.app.showToast('保存しました', 'success');
        }
    }

    // ========== Helpers ==========

    getActiveFilePath() {
        return this.activeFilePath;
    }

    _getDirPath(path) {
        const idx = path.lastIndexOf('/');
        return idx > 0 ? path.substring(0, idx) : '';
    }

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

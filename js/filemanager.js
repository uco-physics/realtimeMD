/**
 * filemanager.js — IndexedDB-based Virtual File System
 * Handles file storage, blob URL management, and path resolution.
 */
const DB_NAME = 'realtimemd-workspace';
const DB_VERSION = 1;
const STORE_FILES = 'files';

/** Map file extension to MIME type for common image formats */
const IMAGE_MIME_MAP = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml'
};

export class FileManager {
    constructor(app) {
        this.app = app;
        this.db = null;
        this.blobUrls = new Map(); // path -> blobUrl
        this._ready = this._initDB();
    }

    async _initDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_FILES)) {
                    db.createObjectStore(STORE_FILES, { keyPath: 'path' });
                }
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            req.onerror = (e) => {
                console.error('IndexedDB error:', e);
                reject(e);
            };
        });
    }

    async ready() {
        await this._ready;
    }

    /**
     * Save a file to IndexedDB
     * @param {string} path - Virtual file path (e.g., "/images/photo.png")
     * @param {string} name - File name
     * @param {string} type - MIME type
     * @param {ArrayBuffer|string} content - File content
     * @param {'file'|'directory'} kind - File or directory
     */
    async saveFile(path, name, type, content, kind = 'file') {
        await this._ready;

        // Infer image MIME type from extension if not provided
        if (kind === 'file' && content && (!type || !type.startsWith('image/'))) {
            const ext = (name || path).split('.').pop().toLowerCase();
            if (IMAGE_MIME_MAP[ext]) {
                type = IMAGE_MIME_MAP[ext];
            }
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_FILES, 'readwrite');
            const store = tx.objectStore(STORE_FILES);
            const entry = {
                path,
                name,
                type,
                content,
                kind,
                size: content ? (content.byteLength || content.length || 0) : 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const req = store.put(entry);
            req.onsuccess = () => {
                if (kind === 'file' && content && type && type.startsWith('image/')) {
                    this._createBlobUrl(path, content, type);
                }
                resolve(entry);
            };
            req.onerror = (e) => reject(e);
        });
    }

    async getFile(path) {
        await this._ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_FILES, 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const req = store.get(path);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e);
        });
    }

    async deleteFile(path) {
        await this._ready;

        // Also delete children if it's a directory
        const allFiles = await this.getAllFiles();
        const toDelete = allFiles.filter(f => f.path === path || f.path.startsWith(path + '/'));

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_FILES, 'readwrite');
            const store = tx.objectStore(STORE_FILES);
            let remaining = toDelete.length;
            if (remaining === 0) { resolve(); return; }

            for (const file of toDelete) {
                this._revokeBlobUrl(file.path);
                const req = store.delete(file.path);
                req.onsuccess = () => { if (--remaining === 0) resolve(); };
                req.onerror = (e) => reject(e);
            }
        });
    }

    async renameFile(oldPath, newPath, newName) {
        const file = await this.getFile(oldPath);
        if (!file) return null;

        // If it's a directory, rename all children too
        const allFiles = await this.getAllFiles();
        const toRename = allFiles.filter(f => f.path === oldPath || f.path.startsWith(oldPath + '/'));

        for (const f of toRename) {
            const relativePath = f.path.substring(oldPath.length);
            const renamedPath = newPath + relativePath;
            const renamedName = f.path === oldPath ? newName : f.name;
            await this.saveFile(renamedPath, renamedName, f.type, f.content, f.kind);
            await this.deleteFile(f.path);
        }

        return await this.getFile(newPath);
    }

    async getAllFiles() {
        await this._ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_FILES, 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });
    }

    async buildFileTree() {
        const files = await this.getAllFiles();
        const root = { name: 'workspace', path: '/', kind: 'directory', children: [] };

        for (const file of files) {
            const parts = file.path.split('/').filter(Boolean);
            let current = root;
            let currentPath = '';

            for (let i = 0; i < parts.length; i++) {
                currentPath += '/' + parts[i];
                const isLast = i === parts.length - 1;

                if (isLast) {
                    current.children.push({
                        name: file.name,
                        path: file.path,
                        kind: file.kind,
                        type: file.type,
                        size: file.size
                    });
                } else {
                    let dir = current.children.find(c => c.kind === 'directory' && c.name === parts[i]);
                    if (!dir) {
                        dir = { name: parts[i], path: currentPath, kind: 'directory', children: [] };
                        current.children.push(dir);
                    }
                    current = dir;
                }
            }
        }

        // Sort: directories first, then alphabetical
        const sortTree = (node) => {
            if (node.children) {
                node.children.sort((a, b) => {
                    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
                node.children.forEach(sortTree);
            }
        };
        sortTree(root);

        return root;
    }

    _createBlobUrl(path, content, type) {
        this._revokeBlobUrl(path);
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        this.blobUrls.set(path, url);
        return url;
    }

    _revokeBlobUrl(path) {
        const existingUrl = this.blobUrls.get(path);
        if (existingUrl) {
            URL.revokeObjectURL(existingUrl);
            this.blobUrls.delete(path);
        }
    }

    getBlobUrl(srcPath) {
        // Normalize: remove leading ./ if present
        let normalized = srcPath.replace(/^\.\//, '');
        if (!normalized.startsWith('/')) normalized = '/' + normalized;

        // Check exact path match (preferred)
        if (this.blobUrls.has(normalized)) {
            return this.blobUrls.get(normalized);
        }

        // Fallback: match by filename only (backward compat for flat workspaces)
        const srcFileName = normalized.split('/').pop();
        for (const [path, url] of this.blobUrls) {
            const fileName = path.split('/').pop();
            if (fileName === srcFileName) return url;
        }

        return null;
    }

    async initBlobUrls() {
        const files = await this.getAllFiles();
        for (const file of files) {
            if (file.kind === 'file' && file.content) {
                let type = file.type;
                // Infer type from extension if missing
                if (!type || !type.startsWith('image/')) {
                    const ext = (file.name || file.path).split('.').pop().toLowerCase();
                    if (IMAGE_MIME_MAP[ext]) type = IMAGE_MIME_MAP[ext];
                }
                if (type && type.startsWith('image/')) {
                    this._createBlobUrl(file.path, file.content, type);
                }
            }
        }
    }

    async exportAllAsObj() {
        const files = await this.getAllFiles();
        return files.map(f => ({
            path: f.path,
            name: f.name,
            type: f.type,
            kind: f.kind,
            size: f.size,
            content: f.kind === 'file' && f.content
                ? (f.type && f.type.startsWith('text/')
                    ? (typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content))
                    : this._arrayBufferToBase64(f.content))
                : null,
            isBase64: f.kind === 'file' && f.content && f.type && !f.type.startsWith('text/')
        }));
    }

    async importFromObj(filesObj) {
        for (const f of filesObj) {
            let content = f.content;
            if (f.isBase64 && content) {
                content = this._base64ToArrayBuffer(content);
            }
            await this.saveFile(f.path, f.name, f.type, content, f.kind);
        }
        await this.initBlobUrls();
    }

    _arrayBufferToBase64(buffer) {
        if (!buffer) return '';
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    _base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async clearAll() {
        await this._ready;
        // Revoke all blob URLs
        for (const [, url] of this.blobUrls) {
            URL.revokeObjectURL(url);
        }
        this.blobUrls.clear();

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_FILES, 'readwrite');
            const store = tx.objectStore(STORE_FILES);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    destroy() {
        for (const [, url] of this.blobUrls) {
            URL.revokeObjectURL(url);
        }
        this.blobUrls.clear();
    }
}

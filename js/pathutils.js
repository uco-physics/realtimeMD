/**
 * pathutils.js — Path Resolution Utilities
 * Pure functions for resolving relative paths within the virtual filesystem.
 * No external dependencies.
 */

/**
 * Supported image file extensions.
 */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

/**
 * Check whether a filename has an image extension.
 * @param {string} name - File name or path
 * @returns {boolean}
 */
export function isImageFile(name) {
    if (!name) return false;
    const ext = name.split('.').pop().toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Get the directory portion of a virtual path.
 * E.g. "/docs/notes.md" → "/docs", "/readme.md" → ""
 * @param {string} filePath
 * @returns {string}
 */
function dirname(filePath) {
    const idx = filePath.lastIndexOf('/');
    return idx > 0 ? filePath.substring(0, idx) : '';
}

/**
 * Normalize a virtual path by resolving `.` and `..` segments
 * and collapsing multiple slashes. Always uses forward slashes.
 * @param {string} path
 * @returns {string}
 */
function normalizePath(path) {
    // Replace backslashes with forward slashes
    path = path.replace(/\\/g, '/');

    const parts = path.split('/');
    const resolved = [];

    for (const part of parts) {
        if (part === '.' || part === '') {
            continue;
        } else if (part === '..') {
            resolved.pop();
        } else {
            resolved.push(part);
        }
    }

    const result = '/' + resolved.join('/');
    return result === '/' ? '' : result;
}

/**
 * Resolve a relative asset path relative to the active Markdown file's directory.
 *
 * @param {string} currentMdPath - Absolute virtual path of the active .md file
 *                                 (e.g. "/docs/notes.md")
 * @param {string} targetPath    - The path as written in Markdown
 *                                 (e.g. "../images/photo.png")
 * @returns {string} Resolved absolute virtual path (e.g. "/images/photo.png")
 */
export function resolveRelativeAssetPath(currentMdPath, targetPath) {
    if (!targetPath) return targetPath;

    // Already absolute virtual path
    if (targetPath.startsWith('/')) {
        return normalizePath(targetPath);
    }

    const dir = dirname(currentMdPath || '/');
    const combined = dir + '/' + targetPath;
    return normalizePath(combined);
}

/**
 * Compute the relative path from one file's directory to another file.
 * Both paths should be absolute virtual paths.
 *
 * @param {string} fromFilePath - Absolute virtual path of the source file
 *                                (e.g. "/docs/notes.md")
 * @param {string} toFilePath   - Absolute virtual path of the target file
 *                                (e.g. "/images/photo.png")
 * @returns {string} Relative path using forward slashes (e.g. "../images/photo.png")
 */
export function computeRelativePath(fromFilePath, toFilePath) {
    if (!fromFilePath || !toFilePath) return toFilePath || '';

    const fromDir = dirname(fromFilePath).split('/').filter(Boolean);
    const toParts = toFilePath.split('/').filter(Boolean);

    // Find common prefix length
    let common = 0;
    while (
        common < fromDir.length &&
        common < toParts.length - 1 && // last part of toParts is the filename
        fromDir[common] === toParts[common]
    ) {
        common++;
    }

    const ups = fromDir.length - common;
    const remaining = toParts.slice(common);

    if (ups === 0 && remaining.length > 0) {
        return './' + remaining.join('/');
    }

    const upSegments = Array(ups).fill('..');
    return [...upSegments, ...remaining].join('/');
}

/**
 * i18n.js — Lightweight Internationalization
 * Dictionary-based translation with 4 languages: EN, JA, ZH, HI.
 * Persists language selection in localStorage.
 */

const STORAGE_KEY = 'realtimemd-lang';

const translations = {
    en: {
        // App
        'app.title': 'RealtimeMD',
        // Toolbar tooltips
        'tooltip.menu': 'Menu',
        'tooltip.undo': 'Undo (Ctrl+Z)',
        'tooltip.redo': 'Redo (Ctrl+Y)',
        'tooltip.heading': 'Heading',
        'tooltip.bold': 'Bold (Ctrl+B)',
        'tooltip.italic': 'Italic (Ctrl+I)',
        'tooltip.strikethrough': 'Strikethrough',
        'tooltip.inlineCode': 'Inline Code',
        'tooltip.codeBlock': 'Code Block',
        'tooltip.link': 'Link (Ctrl+K)',
        'tooltip.image': 'Image',
        'tooltip.ul': 'Bullet List',
        'tooltip.ol': 'Numbered List',
        'tooltip.checklist': 'Checklist',
        'tooltip.quote': 'Blockquote',
        'tooltip.hr': 'Horizontal Rule',
        'tooltip.table': 'Table',
        'tooltip.save': 'Save (Ctrl+S)',
        // Ribbon
        'ribbon.explorer': 'File Explorer',
        'ribbon.import': 'Import Workspace',
        'ribbon.export': 'Export Workspace',
        'ribbon.exportZip': 'Export as ZIP',
        'ribbon.theme': 'Toggle Theme',
        'ribbon.pdf': 'Save Preview as PDF',
        'ribbon.language': 'Language',
        // Sidebar
        'sidebar.explorer': 'EXPLORER',
        'sidebar.newFile': 'New File',
        'sidebar.newFolder': 'New Folder',
        'sidebar.upload': 'Upload File',
        'sidebar.collapseAll': 'Collapse All',
        'sidebar.empty': 'No files yet',
        'sidebar.emptyHint': 'Create a file using the buttons above,\nor drag & drop to upload.',
        // Context menu
        'ctx.newFile': 'New File',
        'ctx.newFolder': 'New Folder',
        'ctx.rename': 'Rename',
        'ctx.duplicate': 'Duplicate',
        'ctx.copyPath': 'Copy Path',
        'ctx.copyRelativePath': 'Copy Relative Path',
        'ctx.copyMdImage': 'Copy as Markdown Image',
        'ctx.download': 'Download',
        'ctx.delete': 'Delete',
        // Pane headers
        'pane.editor': 'EDITOR',
        'pane.preview': 'PREVIEW',
        // Editor
        'editor.placeholder': 'Type Markdown...',
        // Status bar
        'status.encoding': 'UTF-8',
        'status.language': 'Markdown',
        // Drop zone
        'dropzone.text': 'Drop files to upload',
        // Toasts
        'toast.pathCopied': 'Path copied',
        'toast.relativePathCopied': 'Relative path copied',
        'toast.mdImageCopied': 'Markdown image copied',
        'toast.saved': 'Saved',
        'toast.themeDark': 'Theme: Dark',
        'toast.themeLight': 'Theme: Light',
        'toast.collapsed': 'All folders collapsed',
        'toast.uploaded': '{count} file(s) uploaded',
        'toast.renamed': 'Renamed to "{name}"',
        'toast.duplicated': '"{name}" created',
        'toast.downloaded': '"{name}" downloaded',
        'toast.deleted': '"{name}" deleted',
        'toast.existsError': '"{name}" already exists',
        'toast.binaryNotEditable': 'Binary file cannot be edited: {name}',
        'toast.exportOk': 'Workspace exported',
        'toast.importOk': 'Workspace imported',
        'toast.importError': 'Import failed',
        'toast.invalidWorkspace': 'Invalid workspace file',
        'toast.exportZipOk': 'Workspace exported as ZIP',
        'toast.exportZipError': 'ZIP export failed',
        'toast.pdfInfo': 'Use your browser print dialog to save as PDF',
        // Dialogs
        'dialog.deleteConfirm': 'Delete {type} "{name}"?',
        'dialog.replaceOrMerge': 'Replace current workspace?\nOK → Replace | Cancel → Merge',
        'dialog.fileType': 'file',
        'dialog.folderType': 'folder',
    },
    ja: {
        'app.title': 'RealtimeMD',
        'tooltip.menu': 'メニュー',
        'tooltip.undo': '元に戻す (Ctrl+Z)',
        'tooltip.redo': 'やり直し (Ctrl+Y)',
        'tooltip.heading': '見出し',
        'tooltip.bold': '太字 (Ctrl+B)',
        'tooltip.italic': '斜体 (Ctrl+I)',
        'tooltip.strikethrough': '取り消し線',
        'tooltip.inlineCode': 'インラインコード',
        'tooltip.codeBlock': 'コードブロック',
        'tooltip.link': 'リンク (Ctrl+K)',
        'tooltip.image': '画像',
        'tooltip.ul': '箇条書き',
        'tooltip.ol': '番号付きリスト',
        'tooltip.checklist': 'チェックリスト',
        'tooltip.quote': '引用',
        'tooltip.hr': '水平線',
        'tooltip.table': 'テーブル',
        'tooltip.save': '保存 (Ctrl+S)',
        'ribbon.explorer': 'ファイルエクスプローラー',
        'ribbon.import': 'ワークスペースをインポート',
        'ribbon.export': 'ワークスペースをエクスポート',
        'ribbon.exportZip': 'ZIPでエクスポート',
        'ribbon.theme': 'テーマ切替',
        'ribbon.pdf': 'プレビューをPDFで保存',
        'ribbon.language': '言語',
        'sidebar.explorer': 'エクスプローラー',
        'sidebar.newFile': '新規ファイル',
        'sidebar.newFolder': '新規フォルダ',
        'sidebar.upload': 'ファイルアップロード',
        'sidebar.collapseAll': '全て折りたたむ',
        'sidebar.empty': 'ファイルがありません',
        'sidebar.emptyHint': '上のボタンからファイルを作成するか、\nドラッグ&ドロップでアップロード',
        'ctx.newFile': '新規ファイル',
        'ctx.newFolder': '新規フォルダ',
        'ctx.rename': '名前を変更',
        'ctx.duplicate': '複製',
        'ctx.copyPath': 'パスをコピー',
        'ctx.copyRelativePath': '相対パスをコピー',
        'ctx.copyMdImage': 'Markdown画像としてコピー',
        'ctx.download': 'ダウンロード',
        'ctx.delete': '削除',
        'pane.editor': 'EDITOR',
        'pane.preview': 'PREVIEW',
        'editor.placeholder': 'Markdownを入力...',
        'status.encoding': 'UTF-8',
        'status.language': 'Markdown',
        'dropzone.text': 'ファイルをドロップしてアップロード',
        'toast.pathCopied': 'パスをコピーしました',
        'toast.relativePathCopied': '相対パスをコピーしました',
        'toast.mdImageCopied': 'Markdown画像をコピーしました',
        'toast.saved': '保存しました',
        'toast.themeDark': 'テーマ: ダーク',
        'toast.themeLight': 'テーマ: ライト',
        'toast.collapsed': 'フォルダを全て折りたたみました',
        'toast.uploaded': '{count}個のファイルをアップロードしました',
        'toast.renamed': '"{name}" にリネームしました',
        'toast.duplicated': '"{name}" を作成しました',
        'toast.downloaded': '"{name}" をダウンロードしました',
        'toast.deleted': '「{name}」を削除しました',
        'toast.existsError': '"{name}" は既に存在します',
        'toast.binaryNotEditable': 'バイナリファイルは編集できません: {name}',
        'toast.exportOk': 'ワークスペースをエクスポートしました',
        'toast.importOk': 'ワークスペースをインポートしました',
        'toast.importError': 'インポートに失敗しました',
        'toast.invalidWorkspace': '無効なワークスペースファイルです',
        'toast.exportZipOk': 'ZIPでエクスポートしました',
        'toast.exportZipError': 'ZIPエクスポートに失敗しました',
        'toast.pdfInfo': 'ブラウザの印刷ダイアログからPDFとして保存してください',
        'dialog.deleteConfirm': '{type}「{name}」を削除しますか？',
        'dialog.replaceOrMerge': '現在のワークスペースを置き換えますか？\n「OK」→ 置き換え | 「キャンセル」→ マージ',
        'dialog.fileType': 'ファイル',
        'dialog.folderType': 'フォルダ',
    },
    zh: {
        'app.title': 'RealtimeMD',
        'tooltip.menu': '菜单',
        'tooltip.undo': '撤销 (Ctrl+Z)',
        'tooltip.redo': '重做 (Ctrl+Y)',
        'tooltip.heading': '标题',
        'tooltip.bold': '粗体 (Ctrl+B)',
        'tooltip.italic': '斜体 (Ctrl+I)',
        'tooltip.strikethrough': '删除线',
        'tooltip.inlineCode': '行内代码',
        'tooltip.codeBlock': '代码块',
        'tooltip.link': '链接 (Ctrl+K)',
        'tooltip.image': '图片',
        'tooltip.ul': '无序列表',
        'tooltip.ol': '有序列表',
        'tooltip.checklist': '任务列表',
        'tooltip.quote': '引用',
        'tooltip.hr': '分隔线',
        'tooltip.table': '表格',
        'tooltip.save': '保存 (Ctrl+S)',
        'ribbon.explorer': '文件资源管理器',
        'ribbon.import': '导入工作区',
        'ribbon.export': '导出工作区',
        'ribbon.exportZip': '导出为ZIP',
        'ribbon.theme': '切换主题',
        'ribbon.pdf': '预览保存为PDF',
        'ribbon.language': '语言',
        'sidebar.explorer': '资源管理器',
        'sidebar.newFile': '新建文件',
        'sidebar.newFolder': '新建文件夹',
        'sidebar.upload': '上传文件',
        'sidebar.collapseAll': '全部折叠',
        'sidebar.empty': '暂无文件',
        'sidebar.emptyHint': '使用上方按钮创建文件，\n或拖放上传。',
        'ctx.newFile': '新建文件',
        'ctx.newFolder': '新建文件夹',
        'ctx.rename': '重命名',
        'ctx.duplicate': '复制',
        'ctx.copyPath': '复制路径',
        'ctx.copyRelativePath': '复制相对路径',
        'ctx.copyMdImage': '复制为Markdown图片',
        'ctx.download': '下载',
        'ctx.delete': '删除',
        'pane.editor': '编辑器',
        'pane.preview': '预览',
        'editor.placeholder': '输入Markdown...',
        'status.encoding': 'UTF-8',
        'status.language': 'Markdown',
        'dropzone.text': '拖放文件以上传',
        'toast.pathCopied': '路径已复制',
        'toast.relativePathCopied': '相对路径已复制',
        'toast.mdImageCopied': 'Markdown图片已复制',
        'toast.saved': '已保存',
        'toast.themeDark': '主题：深色',
        'toast.themeLight': '主题：浅色',
        'toast.collapsed': '已折叠所有文件夹',
        'toast.uploaded': '已上传 {count} 个文件',
        'toast.renamed': '已重命名为 "{name}"',
        'toast.duplicated': '已创建 "{name}"',
        'toast.downloaded': '已下载 "{name}"',
        'toast.deleted': '已删除 "{name}"',
        'toast.existsError': '"{name}" 已存在',
        'toast.binaryNotEditable': '无法编辑二进制文件：{name}',
        'toast.exportOk': '工作区已导出',
        'toast.importOk': '工作区已导入',
        'toast.importError': '导入失败',
        'toast.invalidWorkspace': '无效的工作区文件',
        'toast.exportZipOk': '工作区已导出为ZIP',
        'toast.exportZipError': 'ZIP导出失败',
        'toast.pdfInfo': '请使用浏览器打印对话框保存为PDF',
        'dialog.deleteConfirm': '删除{type}「{name}」？',
        'dialog.replaceOrMerge': '替换当前工作区？\n确定 → 替换 | 取消 → 合并',
        'dialog.fileType': '文件',
        'dialog.folderType': '文件夹',
    },
    hi: {
        'app.title': 'RealtimeMD',
        'tooltip.menu': 'मेनू',
        'tooltip.undo': 'पूर्ववत (Ctrl+Z)',
        'tooltip.redo': 'फिर से (Ctrl+Y)',
        'tooltip.heading': 'शीर्षक',
        'tooltip.bold': 'बोल्ड (Ctrl+B)',
        'tooltip.italic': 'इटैलिक (Ctrl+I)',
        'tooltip.strikethrough': 'स्ट्राइकथ्रू',
        'tooltip.inlineCode': 'इनलाइन कोड',
        'tooltip.codeBlock': 'कोड ब्लॉक',
        'tooltip.link': 'लिंक (Ctrl+K)',
        'tooltip.image': 'चित्र',
        'tooltip.ul': 'बुलेट सूची',
        'tooltip.ol': 'क्रमांकित सूची',
        'tooltip.checklist': 'चेकलिस्ट',
        'tooltip.quote': 'उद्धरण',
        'tooltip.hr': 'क्षैतिज रेखा',
        'tooltip.table': 'तालिका',
        'tooltip.save': 'सहेजें (Ctrl+S)',
        'ribbon.explorer': 'फ़ाइल एक्सप्लोरर',
        'ribbon.import': 'वर्कस्पेस आयात करें',
        'ribbon.export': 'वर्कस्पेस निर्यात करें',
        'ribbon.exportZip': 'ZIP के रूप में निर्यात',
        'ribbon.theme': 'थीम बदलें',
        'ribbon.pdf': 'पूर्वावलोकन PDF में सहेजें',
        'ribbon.language': 'भाषा',
        'sidebar.explorer': 'एक्सप्लोरर',
        'sidebar.newFile': 'नई फ़ाइल',
        'sidebar.newFolder': 'नया फ़ोल्डर',
        'sidebar.upload': 'फ़ाइल अपलोड',
        'sidebar.collapseAll': 'सभी को समेटें',
        'sidebar.empty': 'कोई फ़ाइल नहीं',
        'sidebar.emptyHint': 'ऊपर बटन से फ़ाइल बनाएं,\nया ड्रैग और ड्रॉप करें।',
        'ctx.newFile': 'नई फ़ाइल',
        'ctx.newFolder': 'नया फ़ोल्डर',
        'ctx.rename': 'नाम बदलें',
        'ctx.duplicate': 'प्रतिलिपि',
        'ctx.copyPath': 'पथ कॉपी करें',
        'ctx.copyRelativePath': 'सापेक्ष पथ कॉपी करें',
        'ctx.copyMdImage': 'Markdown चित्र के रूप में कॉपी',
        'ctx.download': 'डाउनलोड',
        'ctx.delete': 'हटाएं',
        'pane.editor': 'संपादक',
        'pane.preview': 'पूर्वावलोकन',
        'editor.placeholder': 'Markdown टाइप करें...',
        'status.encoding': 'UTF-8',
        'status.language': 'Markdown',
        'dropzone.text': 'अपलोड करने के लिए फ़ाइलें छोड़ें',
        'toast.pathCopied': 'पथ कॉपी हो गया',
        'toast.relativePathCopied': 'सापेक्ष पथ कॉपी हो गया',
        'toast.mdImageCopied': 'Markdown चित्र कॉपी हो गया',
        'toast.saved': 'सहेजा गया',
        'toast.themeDark': 'थीम: डार्क',
        'toast.themeLight': 'थीम: लाइट',
        'toast.collapsed': 'सभी फ़ोल्डर समेटे गए',
        'toast.uploaded': '{count} फ़ाइल अपलोड हुई',
        'toast.renamed': '"{name}" में नाम बदला',
        'toast.duplicated': '"{name}" बनाया गया',
        'toast.downloaded': '"{name}" डाउनलोड हुई',
        'toast.deleted': '"{name}" हटाया गया',
        'toast.existsError': '"{name}" पहले से मौजूद है',
        'toast.binaryNotEditable': 'बाइनरी फ़ाइल संपादित नहीं हो सकती: {name}',
        'toast.exportOk': 'वर्कस्पेस निर्यात हो गया',
        'toast.importOk': 'वर्कस्पेस आयात हो गया',
        'toast.importError': 'आयात विफल',
        'toast.invalidWorkspace': 'अमान्य वर्कस्पेस फ़ाइल',
        'toast.exportZipOk': 'ZIP के रूप में निर्यात हो गया',
        'toast.exportZipError': 'ZIP निर्यात विफल',
        'toast.pdfInfo': 'PDF के रूप में सहेजने के लिए ब्राउज़र प्रिंट डायलॉग का उपयोग करें',
        'dialog.deleteConfirm': '{type} "{name}" हटाएं?',
        'dialog.replaceOrMerge': 'वर्तमान वर्कस्पेस बदलें?\nOK → बदलें | रद्द करें → मर्ज करें',
        'dialog.fileType': 'फ़ाइल',
        'dialog.folderType': 'फ़ोल्डर',
    }
};

let currentLang = 'en';

/**
 * Initialize i18n — load saved language or default to 'en'
 */
export function initI18n() {
    const saved = localStorage.getItem(STORAGE_KEY);
    currentLang = (saved && translations[saved]) ? saved : 'en';
    applyTranslations();
}

/**
 * Get current language code
 */
export function getLang() {
    return currentLang;
}

/**
 * Set language and persist
 */
export function setLang(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    applyTranslations();
}

/**
 * Get a translated string by key, with optional interpolation.
 * @param {string} key
 * @param {Object} [params] - e.g. { name: 'foo', count: 3 }
 * @returns {string}
 */
export function t(key, params = {}) {
    let str = translations[currentLang]?.[key] || translations.en[key] || key;
    for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return str;
}

/**
 * Apply translations to all elements with data-i18n attributes.
 * Supports:
 *   data-i18n="key"           → textContent
 *   data-i18n-tooltip="key"   → data-tooltip attribute
 *   data-i18n-title="key"     → title attribute
 *   data-i18n-aria="key"      → aria-label attribute
 *   data-i18n-placeholder="key" → placeholder attribute
 */
export function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
        el.setAttribute('data-tooltip', t(el.dataset.i18nTooltip));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });

    // Update html lang attribute
    const langMap = { en: 'en', ja: 'ja', zh: 'zh-CN', hi: 'hi' };
    document.documentElement.lang = langMap[currentLang] || 'en';
}

/**
 * Get supported languages for UI selector
 */
export function getSupportedLanguages() {
    return [
        { code: 'en', label: 'English' },
        { code: 'ja', label: '日本語' },
        { code: 'zh', label: '中文' },
        { code: 'hi', label: 'हिन्दी' }
    ];
}

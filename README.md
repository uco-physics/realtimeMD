# RealtimeMD — Real-time Markdown Editor

A free, browser-based Markdown editor with live preview, virtual file management, and session persistence. No backend required.

## Features

- **Live Preview** — Renders Markdown as you type
- **Virtual Workspace** — Manage files & folders in-browser (IndexedDB)
- **Image Support** — Upload & render images with relative path resolution
- **Theme Toggle** — Dark / Light mode (persisted in localStorage)
- **Language Switcher** — English, 日本語, 中文, हिन्दी
- **Export as ZIP** — Download entire workspace as a zip archive
- **Save as PDF** — Print preview content via browser print dialog
- **Session Persistence** — Data survives browser close

## Getting Started

```bash
# Serve locally
python3 -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080` in your browser.

## Images

### Supported Formats

`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`

All formats are rendered in the preview with the same relative-path resolution rules.

### Relative Path Rules

Image paths in Markdown are resolved relative to the active `.md` file's directory:

```markdown
![photo](../images/photo.jpg)
![diagram](./assets/diagram.svg)
![icon](icons/star.webp)
```

Absolute URLs (`https://...`) and data URIs are passed through directly.

### Context Menu Actions

Right-click a file in the explorer:

| Action | Description |
| --- | --- |
| **Copy Relative Path** | Copies relative path from active MD file |
| **Copy as Markdown Image** | Copies `![filename](relative/path)` (image files only) |

### Limitations

- Images must be uploaded to the virtual workspace (IndexedDB)
- Browser sandboxing prevents reading local disk files
- Large images consume browser memory as blob URLs

## Language Switcher

Four languages are supported: **English** (default), **Japanese**, **Chinese (Simplified)**, **Hindi**.

- Select language from the dropdown in the bottom-left ribbon
- All UI labels, tooltips, context menus, and toasts are translated
- Language preference is persisted in `localStorage` (`realtimemd-lang`)
- Default language: English

## Theme Toggle

- Click the sun/moon icon in the ribbon to toggle Dark / Light mode
- Theme is persisted in `localStorage` (`realtimemd-theme`)
- Default theme: **Dark**
- CSS variables ensure consistent theming across editor, preview, explorer, context menus, and code blocks

## Export Workspace as ZIP

- Click the ZIP icon in the ribbon to export
- Downloads a `realtimeMD-workspace-YYYYMMDD.zip` file containing all files/folders
- Uses [JSZip](https://stuk.github.io/jszip/) (loaded from CDN)
- Exports from the virtual filesystem (IndexedDB)
- **Limitation**: Requires internet access to load JSZip from CDN on first use

## Save Preview as PDF

- Click the PDF icon in the ribbon
- Opens the browser's native Print dialog
- A print stylesheet hides all UI and shows only the preview content
- Use "Save as PDF" in the print dialog to save
- **Limitation**: Output quality depends on the browser's print engine. Best results in Chrome/Edge.

## SEO

The app includes basic SEO-friendly meta tags:

- `<title>` in English
- `<meta name="description">` with app summary
- Open Graph tags (`og:title`, `og:description`, `og:type`)
- Twitter Card tags (`summary`)
- Best-effort canonical URL (set via inline script on page load)

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+K` | Insert Link |
| `Ctrl+S` | Save |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |

## License

See [LICENSE](LICENSE).

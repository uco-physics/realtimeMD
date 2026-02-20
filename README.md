# RealtimeMD — Real-time Markdown Editor

ブラウザで動くリアルタイムMarkdownエディター。ファイル管理、プレビュー、セッション保存対応。

## Features

- **リアルタイムプレビュー** — 入力と同時にレンダリング
- **仮想ワークスペース** — サイドバーからファイル・フォルダを管理（IndexedDB）
- **画像サポート** — ドラッグ＆ドロップでアップロード、Markdown内で相対パス参照
- **セッション保存** — ブラウザを閉じてもデータが残る
- **テーマ切替** — ダーク / ライトモード対応
- **エクスポート/インポート** — ワークスペースをJSONでバックアップ・復元

## Images

### Relative Path Rules

画像はMarkdownファイルのディレクトリからの**相対パス**で参照できます。

```markdown
![alt text](../images/photo.png)
![diagram](./assets/diagram.svg)
![icon](icons/star.png)
```

- パスはアクティブな `.md` ファイルのディレクトリを基準に解決されます
- `./`, `../`, パスセグメントの連結に対応
- 絶対URL (`https://...`) や data URI もそのまま利用可能

### Supported Image Extensions

`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`

### Context Menu Actions

エクスプローラーでファイルを右クリックすると以下のアクションが利用できます：

| アクション | 説明 |
| --- | --- |
| **相対パスをコピー** | アクティブなMDファイルからの相対パスをクリップボードにコピー |
| **Markdown画像としてコピー** | `![filename](relative/path)` 形式でコピー（画像ファイルのみ表示） |

**使い方:**
1. エクスプローラーで画像ファイルを右クリック
2. 「Markdown画像としてコピー」を選択
3. エディターにペースト → プレビューに画像が表示される

### Limitations

- 画像は仮想ワークスペース（IndexedDB）にアップロードする必要があります
- ブラウザのサンドボックスによりローカルディスクのファイルを直接参照することはできません
- 画像はメモリ内のBlob URLとして管理されるため、ブラウザのメモリ使用量に注意してください

## Getting Started

```bash
# ローカルサーバーで起動
python3 -m http.server 8080
# または
npx serve .
```

`http://localhost:8080` をブラウザで開く。

## Keyboard Shortcuts

| ショートカット | アクション |
| --- | --- |
| `Ctrl+B` | 太字 |
| `Ctrl+I` | 斜体 |
| `Ctrl+K` | リンク挿入 |
| `Ctrl+S` | 保存 |
| `Ctrl+Z` | 元に戻す |
| `Ctrl+Shift+Z` / `Ctrl+Y` | やり直し |

## License

See [LICENSE](LICENSE).

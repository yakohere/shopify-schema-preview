# Shopify Schema Preview

Visual preview of Shopify schema settings directly in VS Code.

[Features](#features) | [Installation](#installation) | [Configuration](#configuration)

## Features

- 🎨 **Section schema preview** — Visualize `{% schema %}` blocks from `.liquid` files
- 🧩 **Block definitions** — Preview block settings and their configurations
- ⚙️ **Theme settings** — Preview `config/settings_schema.json` settings
- 🌐 **Translation support** — Automatic `t:` key resolution from locale files
- 🔄 **Live updates** — Real-time preview as you edit

## Installation

Search for "Shopify Schema Preview" in the VS Code Extensions marketplace.

## Usage

1. Open a Liquid file with a `{% schema %}` block or `settings_schema.json`
2. Click the preview icon in the editor toolbar
3. Or use `Cmd+Shift+P` → "Shopify: Preview Schema Settings"

The preview panel updates automatically when you edit or switch files.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `shopify-schema-preview.autoSuggest` | `true` | Auto-suggest preview when schema detected |

## Supported Setting Types

Text, textarea, select, checkbox, radio, range, number, color, color_scheme, font_picker, image_picker, video, url, liquid, richtext, and resource pickers (product, collection, page, blog, article).

## License

MIT

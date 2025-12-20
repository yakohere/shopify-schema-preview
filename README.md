# Shopify Settings Preview

A VS Code/Cursor extension that provides a visual preview of Shopify section and block schema settings directly in your editor.

## Features

- **Shopify Polaris UI**: Uses official [Shopify Polaris web components](https://shopify.dev/docs/api/app-home/polaris-web-components) for authentic Shopify look and feel
- **Visual Preview**: See your schema settings rendered as form elements without opening the theme editor
- **Live Updates**: The preview updates automatically as you edit your schema
- **Auto-Detection**: Automatically detects when a Liquid file contains a schema
- **Translation Support**: Automatically resolves `t:` translation keys from `locales/en.default.schema.json` or `locales/en.default.json`
- **All Setting Types Supported**: 
  - Text inputs
  - Textareas
  - Select dropdowns
  - Checkboxes
  - Radio buttons
  - Range sliders
  - Number inputs
  - Color pickers
  - Color schemes
  - Font pickers
  - Image/Video pickers
  - Headers

## Usage

1. Open any Shopify Liquid file containing a `{% schema %}` block
2. Click the preview icon in the editor toolbar, or
3. Use the command palette (Cmd/Ctrl+Shift+P) and search for "Shopify: Preview Schema Settings"
4. The preview panel will open beside your editor

## Installation

### From Source

1. Clone or download this repository
2. Open the folder in VS Code/Cursor
3. Run `npm install` to install dependencies
4. Press F5 to open a new window with the extension loaded
5. Open a Shopify Liquid file and test the extension

### Building VSIX

To package the extension:

```bash
npm install -g @vscode/vsce
vsce package
```

Then install the `.vsix` file in VS Code/Cursor.

## Translation Support

The extension automatically resolves Shopify translation keys (`t:` format):

- Checks `locales/en.default.schema.json` first (Shopify's convention)
- Falls back to `locales/en.default.json` if schema file not found
- Displays original key if no translation found

Example:
```liquid
{
  "label": "t:settings.heading"
}
```
Becomes: **"Heading"** in the preview (resolved from locale file)

See [TRANSLATION_GUIDE.md](TRANSLATION_GUIDE.md) for detailed documentation.

## Configuration

The extension supports the following settings:

- `shopify-settings-preview.autoSuggest`: Automatically suggest opening the preview when a schema is detected (default: `true`)

## Example

When you have a Liquid file with this schema:

```liquid
{% schema %}
{
  "name": "Featured Collection",
  "settings": [
    {
      "type": "text",
      "id": "heading",
      "label": "Heading",
      "default": "Featured Collection"
    },
    {
      "type": "range",
      "id": "products_to_show",
      "label": "Products to show",
      "min": 2,
      "max": 12,
      "step": 2,
      "default": 4
    }
  ]
}
{% endschema %}
```

The extension will render it as a beautiful, interactive form with proper labels, inputs, and styling that matches the Shopify theme editor.

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.


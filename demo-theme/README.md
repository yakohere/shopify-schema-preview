# Demo Shopify Theme

This is a demo Shopify theme for testing the **Shopify Settings Preview** extension.

## Structure

```
demo-theme/
├── sections/              # Section files with schemas
│   ├── collection-container.liquid
│   ├── hero-banner.liquid
│   ├── featured-collection.liquid
│   ├── testimonials.liquid
│   └── newsletter.liquid
├── locales/              # Translation files
│   ├── en.default.schema.json  # Schema translations (checked first!)
│   ├── en.default.json         # General translations (fallback)
│   └── README.md               # Locale documentation
├── snippets/             # (empty for now)
└── templates/            # (empty for now)
```

## Available Sections

### 1. Collection Container (`collection-container.liquid`)
The original example you provided - demonstrates:
- Select dropdowns
- Checkboxes
- Range sliders
- Conditional visibility
- Translations

### 2. Hero Banner (`hero-banner.liquid`)
Demonstrates:
- Text and textarea inputs
- URL input
- Image picker
- Video URL
- Radio buttons
- Color picker
- Color background
- Multiple headers
- Info text on settings

### 3. Featured Collection (`featured-collection.liquid`)
Demonstrates:
- Collection picker
- Simple settings
- Border controls
- Conditional border radius

### 4. Testimonials (`testimonials.liquid`)
Demonstrates:
- Rich text editor
- Number input
- Font picker
- Blocks support
- Star rating

### 5. Newsletter (`newsletter.liquid`)
Demonstrates:
- Liquid code input
- Article picker
- Page picker
- Product picker
- Product list picker
- Blog picker

## How to Test

1. **Press F5** in VS Code/Cursor to launch the extension
2. In the Extension Development Host window, navigate to the demo-theme folder
3. Open any `.liquid` file from the `sections/` folder
4. Click the preview icon (📄) in the toolbar
5. See the schema settings rendered with translations!

## Testing Different Features

### Test Translations
- Open `collection-container.liquid`
- Notice labels like `t:settings.type` are resolved to "Layout Type"
- Edit `locales/en.default.schema.json` to see translations update
- Extension checks `en.default.schema.json` first, then falls back to `en.default.json`

### Test All Setting Types
Try opening each section to see different setting types:

| Section | What to Test |
|---------|-------------|
| `collection-container.liquid` | Range sliders, conditionals |
| `hero-banner.liquid` | Colors, radio, video, image |
| `featured-collection.liquid` | Simple settings |
| `testimonials.liquid` | Font picker, rich text, blocks |
| `newsletter.liquid` | Resource pickers (product, page, etc.) |

### Test Live Updates

1. Open a section file
2. Open the preview
3. Edit the schema (change labels, defaults, options)
4. Watch the preview update in real-time!

### Test Conditional Visibility

1. Open `collection-container.liquid`
2. Find settings with `visible_if`
3. See them marked as "(Conditional)" in the preview

## Modify and Experiment

Feel free to:
- Add new settings to existing sections
- Create new section files
- Add more translations to `en.default.json`
- Test edge cases

## Notes

- This is a **demo theme** for testing the extension only
- It's not a complete, deployable Shopify theme
- Focus is on schema settings, not actual functionality
- Some resource pickers (product, collection, etc.) will show as dropdowns in the preview

Enjoy testing! 🎉


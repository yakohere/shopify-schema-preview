# Shopify Locale Files

This folder contains translation files for the demo theme.

## File Structure

### `en.default.schema.json`
**Primary file for schema setting translations** (checked first by the extension)

Contains translations specifically for:
- Section names (`t:names.*`)
- Setting labels (`t:settings.*`)
- Setting options (`t:options.*`)
- Header content (`t:content.*`)
- Info text (`t:info.*`)

This follows Shopify's convention for separating schema-specific translations.

### `en.default.json`
**Fallback file for general translations**

Contains general theme translations like:
- Product strings
- Cart messages
- General UI text
- Not schema-specific content

## How the Extension Resolves Translations

1. **First**, checks for `locales/en.default.schema.json`
2. **If not found**, falls back to `locales/en.default.json`
3. **If neither found**, displays the translation key as-is (e.g., `t:settings.heading`)

## Translation Key Format

Translation keys use dot notation:

```
t:category.subcategory.key
```

Examples:
- `t:names.hero_banner` → `"Hero Banner"`
- `t:settings.heading` → `"Heading"`
- `t:options.left` → `"Left"`
- `t:content.layout` → `"Layout Settings"`

## File Contents Structure

```json
{
  "names": {
    "section_name": "Display Name"
  },
  "settings": {
    "setting_id": "Setting Label"
  },
  "options": {
    "option_value": "Option Label"
  },
  "content": {
    "header_name": "Header Content"
  },
  "info": {
    "setting_help": "Help text for setting"
  }
}
```

## Real Shopify Theme Convention

In actual Shopify themes:
- `en.default.schema.json` - Schema-specific translations (sections, blocks, settings)
- `en.default.json` - General theme translations (storefront text)

The extension follows this same pattern!

## Testing Translations

1. Open any section file (e.g., `sections/hero-banner.liquid`)
2. Look for `t:` keys in the schema
3. Click the preview icon
4. Translations should be resolved to English text

## Cache Behavior

- Translations are cached for performance
- Cache clears when you save any locale file
- Extension reloads translations automatically


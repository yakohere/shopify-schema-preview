// Base interfaces
export interface SchemaSetting {
  type: string;
  id?: string;
  label?: string;
  content?: string;
  default?: any;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  info?: string;
  visible_if?: string;
  accept?: string;
}

export interface SchemaBlock {
  type: string;
  name: string;
  settings?: SchemaSetting[];
}

// Section schema (from .liquid files)
export interface SectionSchema {
  name: string;
  tag?: string;
  class?: string;
  settings: SchemaSetting[];
  blocks?: SchemaBlock[];
  presets?: any[];
  enabled_on?: any;
  disabled_on?: any;
}

// Theme settings group (from settings_schema.json)
export interface ThemeSettingsGroup {
  name: string;
  theme_name?: string;
  theme_version?: string;
  theme_author?: string;
  theme_documentation_url?: string;
  theme_support_url?: string;
  settings?: SchemaSetting[];
}

// Unified schema type for rendering
export type ShopifySchema = SectionSchema | ThemeSettingsGroup[];

// Type guards
export function isSectionSchema(schema: ShopifySchema): schema is SectionSchema {
  return !Array.isArray(schema) && 'settings' in schema;
}

export function isThemeSettings(schema: ShopifySchema): schema is ThemeSettingsGroup[] {
  return Array.isArray(schema);
}

// Parser functions
export function extractSchemaFromDocument(text: string, fileExtension: string): ShopifySchema | null {
  if (fileExtension === '.json') {
    return parseJsonSchema(text);
  } else if (fileExtension === '.liquid') {
    return parseLiquidSchema(text);
  }
  return null;
}

function parseLiquidSchema(text: string): SectionSchema | null {
  const schemaRegex = /{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/i;
  const match = text.match(schemaRegex);

  if (!match) {
    return null;
  }

  try {
    const schemaJson = match[1].trim();
    const schema = JSON.parse(schemaJson) as SectionSchema;
    return schema;
  } catch (error) {
    console.error('Failed to parse Liquid schema:', error);
    return null;
  }
}

function parseJsonSchema(text: string): ThemeSettingsGroup[] | null {
  try {
    const schema = JSON.parse(text) as ThemeSettingsGroup[];
    
    // Validate it's a settings_schema structure (array of groups)
    if (Array.isArray(schema) && schema.length > 0) {
      return schema;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to parse JSON schema:', error);
    return null;
  }
}



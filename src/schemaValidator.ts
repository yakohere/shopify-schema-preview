/**
 * Schema Validator for Shopify Section and Theme Settings
 * Validates schemas against Shopify's specification and reports errors/warnings
 */

export interface ValidationMessage {
  type: 'error' | 'warning' | 'info';
  message: string;
  settingId?: string;
  blockType?: string;
  field?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  infos: ValidationMessage[];
}

// Valid setting types in Shopify
const VALID_SETTING_TYPES = [
  // Basic input settings
  'text',
  'textarea',
  'number',
  'range',
  'checkbox',
  'radio',
  'select',
  // Specialized settings
  'color',
  'color_background',
  'color_scheme',
  'color_scheme_group',
  'font_picker',
  'image_picker',
  'video',
  'video_url',
  'url',
  'richtext',
  'inline_richtext',
  'html',
  'liquid',
  // Resource pickers
  'article',
  'blog',
  'collection',
  'collection_list',
  'page',
  'product',
  'product_list',
  'link_list',
  'metaobject',
  'metaobject_list',
  // Layout settings
  'header',
  'paragraph',
];

// Deprecated settings and their replacements
const DEPRECATED_SETTINGS: Record<string, string> = {
  'color_background': 'Consider using "color" instead for better theme editor experience',
  'html': 'Consider using "liquid" for better security and flexibility',
};

// Settings that require specific properties
const SETTINGS_REQUIRING_OPTIONS = ['select', 'radio'];
const SETTINGS_REQUIRING_RANGE = ['range'];

// Reserved block types
const RESERVED_BLOCK_TYPES = ['@app', '@theme'];

export function validateSectionSchema(schema: any): ValidationResult {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  const infos: ValidationMessage[] = [];

  // Validate section-level properties
  if (!schema.name) {
    errors.push({
      type: 'error',
      message: 'Section schema is missing required "name" property',
      field: 'name',
    });
  }

  // Validate tag if present
  if (schema.tag && typeof schema.tag !== 'string') {
    errors.push({
      type: 'error',
      message: '"tag" must be a string',
      field: 'tag',
    });
  }

  // Validate class if present
  if (schema.class && typeof schema.class !== 'string') {
    errors.push({
      type: 'error',
      message: '"class" must be a string',
      field: 'class',
    });
  }

  // Validate max_blocks
  if (schema.max_blocks !== undefined) {
    if (typeof schema.max_blocks !== 'number' || schema.max_blocks < 0) {
      errors.push({
        type: 'error',
        message: '"max_blocks" must be a non-negative number',
        field: 'max_blocks',
      });
    }
  }

  // Validate settings
  if (schema.settings) {
    if (!Array.isArray(schema.settings)) {
      errors.push({
        type: 'error',
        message: '"settings" must be an array',
        field: 'settings',
      });
    } else {
      validateSettings(schema.settings, errors, warnings, infos);
    }
  }

  // Validate blocks
  if (schema.blocks) {
    if (!Array.isArray(schema.blocks)) {
      errors.push({
        type: 'error',
        message: '"blocks" must be an array',
        field: 'blocks',
      });
    } else {
      validateBlocks(schema.blocks, errors, warnings, infos);
    }
  }

  // Validate presets
  if (schema.presets) {
    if (!Array.isArray(schema.presets)) {
      errors.push({
        type: 'error',
        message: '"presets" must be an array',
        field: 'presets',
      });
    } else {
      validatePresets(schema.presets, schema.blocks, errors, warnings, infos);
    }
  }

  // Validate enabled_on / disabled_on
  if (schema.enabled_on && schema.disabled_on) {
    warnings.push({
      type: 'warning',
      message: 'Using both "enabled_on" and "disabled_on" is not recommended. Choose one approach.',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    infos,
  };
}

export function validateThemeSettings(groups: any[]): ValidationResult {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  const infos: ValidationMessage[] = [];

  if (!Array.isArray(groups)) {
    errors.push({
      type: 'error',
      message: 'Theme settings must be an array of setting groups',
    });
    return { isValid: false, errors, warnings, infos };
  }

  // Check for theme_info
  const hasThemeInfo = groups.some(g => g.name === 'theme_info');
  if (!hasThemeInfo) {
    warnings.push({
      type: 'warning',
      message: 'Missing "theme_info" group. Consider adding theme metadata.',
    });
  }

  groups.forEach((group, index) => {
    if (group.name === 'theme_info') {
      // Validate theme_info group
      if (!group.theme_name) {
        warnings.push({
          type: 'warning',
          message: 'theme_info is missing "theme_name"',
        });
      }
      if (!group.theme_version) {
        warnings.push({
          type: 'warning',
          message: 'theme_info is missing "theme_version"',
        });
      }
    } else {
      // Validate regular settings group
      if (!group.name) {
        errors.push({
          type: 'error',
          message: `Settings group at index ${index} is missing "name" property`,
        });
      }

      if (group.settings) {
        if (!Array.isArray(group.settings)) {
          errors.push({
            type: 'error',
            message: `Settings in group "${group.name || index}" must be an array`,
          });
        } else {
          validateSettings(group.settings, errors, warnings, infos, group.name);
        }
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    infos,
  };
}

function validateSettings(
  settings: any[],
  errors: ValidationMessage[],
  warnings: ValidationMessage[],
  infos: ValidationMessage[],
  groupName?: string
): void {
  const seenIds = new Set<string>();

  settings.forEach((setting, index) => {
    const context = groupName ? ` in group "${groupName}"` : '';
    const settingRef = setting.id || `at index ${index}`;

    // Check for type
    if (!setting.type) {
      errors.push({
        type: 'error',
        message: `Setting ${settingRef}${context} is missing required "type" property`,
        settingId: setting.id,
        field: 'type',
      });
    } else if (!VALID_SETTING_TYPES.includes(setting.type)) {
      errors.push({
        type: 'error',
        message: `Setting ${settingRef}${context} has invalid type "${setting.type}"`,
        settingId: setting.id,
        field: 'type',
      });
    }

    // Skip validation for header and paragraph (they don't need id)
    if (setting.type === 'header' || setting.type === 'paragraph') {
      if (!setting.content) {
        warnings.push({
          type: 'warning',
          message: `${setting.type} setting${context} is missing "content" property`,
          settingId: setting.id,
          field: 'content',
        });
      }
      return;
    }

    // Check for id (required for non-header/paragraph settings)
    if (!setting.id) {
      errors.push({
        type: 'error',
        message: `Setting at index ${index}${context} is missing required "id" property`,
        field: 'id',
      });
    } else {
      // Check for duplicate IDs
      if (seenIds.has(setting.id)) {
        errors.push({
          type: 'error',
          message: `Duplicate setting id "${setting.id}"${context}`,
          settingId: setting.id,
          field: 'id',
        });
      }
      seenIds.add(setting.id);

      // Check for valid ID format (alphanumeric, underscores, and hyphens)
      if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(setting.id)) {
        warnings.push({
          type: 'warning',
          message: `Setting id "${setting.id}" should start with a letter/underscore and contain only alphanumeric characters, underscores, and hyphens`,
          settingId: setting.id,
          field: 'id',
        });
      }
    }

    // Check for label (recommended for all settings except header/paragraph)
    if (!setting.label) {
      warnings.push({
        type: 'warning',
        message: `Setting "${setting.id || settingRef}"${context} is missing "label" property`,
        settingId: setting.id,
        field: 'label',
      });
    }

    // Check for deprecated settings
    if (setting.type && DEPRECATED_SETTINGS[setting.type]) {
      warnings.push({
        type: 'warning',
        message: `Setting "${setting.id || settingRef}" uses deprecated type "${setting.type}". ${DEPRECATED_SETTINGS[setting.type]}`,
        settingId: setting.id,
        field: 'type',
      });
    }

    // Validate select/radio options
    if (SETTINGS_REQUIRING_OPTIONS.includes(setting.type)) {
      if (!setting.options || !Array.isArray(setting.options) || setting.options.length === 0) {
        errors.push({
          type: 'error',
          message: `Setting "${setting.id || settingRef}" of type "${setting.type}" requires "options" array`,
          settingId: setting.id,
          field: 'options',
        });
      } else {
        setting.options.forEach((option: any, optIndex: number) => {
          if (!option.value && option.value !== 0 && option.value !== '') {
            errors.push({
              type: 'error',
              message: `Option at index ${optIndex} in setting "${setting.id}" is missing "value"`,
              settingId: setting.id,
              field: 'options',
            });
          }
          if (!option.label) {
            warnings.push({
              type: 'warning',
              message: `Option at index ${optIndex} in setting "${setting.id}" is missing "label"`,
              settingId: setting.id,
              field: 'options',
            });
          }
        });
      }
    }

    // Validate range settings
    if (SETTINGS_REQUIRING_RANGE.includes(setting.type)) {
      if (setting.min === undefined) {
        errors.push({
          type: 'error',
          message: `Range setting "${setting.id || settingRef}" is missing required "min" property`,
          settingId: setting.id,
          field: 'min',
        });
      }
      if (setting.max === undefined) {
        errors.push({
          type: 'error',
          message: `Range setting "${setting.id || settingRef}" is missing required "max" property`,
          settingId: setting.id,
          field: 'max',
        });
      }
      if (setting.min !== undefined && setting.max !== undefined && setting.min >= setting.max) {
        errors.push({
          type: 'error',
          message: `Range setting "${setting.id}" has "min" (${setting.min}) >= "max" (${setting.max})`,
          settingId: setting.id,
          field: 'min',
        });
      }
      if (setting.step !== undefined && setting.step <= 0) {
        errors.push({
          type: 'error',
          message: `Range setting "${setting.id}" has invalid "step" value (must be > 0)`,
          settingId: setting.id,
          field: 'step',
        });
      }
    }

    // Validate number settings
    if (setting.type === 'number') {
      if (setting.min !== undefined && setting.max !== undefined && setting.min > setting.max) {
        errors.push({
          type: 'error',
          message: `Number setting "${setting.id}" has "min" (${setting.min}) > "max" (${setting.max})`,
          settingId: setting.id,
          field: 'min',
        });
      }
    }

    // Check for default value type matching
    if (setting.default !== undefined) {
      const defaultType = typeof setting.default;
      if (setting.type === 'checkbox' && defaultType !== 'boolean') {
        warnings.push({
          type: 'warning',
          message: `Checkbox setting "${setting.id}" has non-boolean default value`,
          settingId: setting.id,
          field: 'default',
        });
      }
      if ((setting.type === 'number' || setting.type === 'range') && defaultType !== 'number') {
        warnings.push({
          type: 'warning',
          message: `${setting.type} setting "${setting.id}" has non-number default value`,
          settingId: setting.id,
          field: 'default',
        });
      }
    }
  });
}

function validateBlocks(
  blocks: any[],
  errors: ValidationMessage[],
  warnings: ValidationMessage[],
  infos: ValidationMessage[]
): void {
  const seenTypes = new Set<string>();

  blocks.forEach((block, index) => {
    const blockRef = block.type || `at index ${index}`;

    // Check for type
    if (!block.type) {
      errors.push({
        type: 'error',
        message: `Block at index ${index} is missing required "type" property`,
        field: 'type',
      });
    } else {
      // Check for duplicate types
      if (seenTypes.has(block.type) && !RESERVED_BLOCK_TYPES.includes(block.type)) {
        errors.push({
          type: 'error',
          message: `Duplicate block type "${block.type}"`,
          blockType: block.type,
          field: 'type',
        });
      }
      seenTypes.add(block.type);

      // Check for reserved types
      if (block.type === '@app') {
        infos.push({
          type: 'info',
          message: 'Block type "@app" allows app blocks to be added to this section',
          blockType: block.type,
        });
      }
      if (block.type === '@theme') {
        infos.push({
          type: 'info',
          message: 'Block type "@theme" allows theme blocks from blocks/ folder',
          blockType: block.type,
        });
      }
    }

    // Note: Block "name" property is optional when referencing theme blocks
    // Theme blocks defined in blocks/ folder provide their own name

    // Validate block settings
    if (block.settings) {
      if (!Array.isArray(block.settings)) {
        errors.push({
          type: 'error',
          message: `Block "${blockRef}" settings must be an array`,
          blockType: block.type,
          field: 'settings',
        });
      } else {
        validateSettings(block.settings, errors, warnings, infos, `block "${blockRef}"`);
      }
    }

    // Validate limit
    if (block.limit !== undefined) {
      if (typeof block.limit !== 'number' || block.limit < 1) {
        errors.push({
          type: 'error',
          message: `Block "${blockRef}" has invalid "limit" (must be a positive number)`,
          blockType: block.type,
          field: 'limit',
        });
      }
    }
  });
}

function validatePresets(
  presets: any[],
  blocks: any[] | undefined,
  errors: ValidationMessage[],
  warnings: ValidationMessage[],
  infos: ValidationMessage[]
): void {
  const validBlockTypes = new Set(blocks?.map(b => b.type) || []);

  presets.forEach((preset, index) => {
    if (!preset.name) {
      errors.push({
        type: 'error',
        message: `Preset at index ${index} is missing required "name" property`,
        field: 'name',
      });
    }

    // Validate preset blocks
    if (preset.blocks && Array.isArray(preset.blocks)) {
      preset.blocks.forEach((presetBlock: any, blockIndex: number) => {
        if (presetBlock.type && !validBlockTypes.has(presetBlock.type) && !RESERVED_BLOCK_TYPES.includes(presetBlock.type)) {
          errors.push({
            type: 'error',
            message: `Preset "${preset.name}" references undefined block type "${presetBlock.type}" at index ${blockIndex}`,
            field: 'blocks',
          });
        }
      });
    }
  });
}

export function getValidationSummary(result: ValidationResult): string {
  const parts: string[] = [];

  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`);
  }
  if (result.warnings.length > 0) {
    parts.push(`${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}`);
  }
  if (result.infos.length > 0) {
    parts.push(`${result.infos.length} info${result.infos.length > 1 ? 's' : ''}`);
  }

  if (parts.length === 0) {
    return 'Schema is valid';
  }

  return parts.join(', ');
}

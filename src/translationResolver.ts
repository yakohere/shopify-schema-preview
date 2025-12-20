import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface TranslationCache {
  [key: string]: any;
}

let translationCache: TranslationCache = {};

export function resolveTranslation(key: string, workspaceFolder?: vscode.WorkspaceFolder): string {
  if (!key || typeof key !== 'string') {
    return key;
  }

  if (!key.startsWith('t:')) {
    return key;
  }

  const translationKey = key.substring(2);
  
  if (!workspaceFolder) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return key;
    }
    workspaceFolder = folders[0];
  }

  const translations = loadTranslations(workspaceFolder);
  
  const value = getNestedValue(translations, translationKey);
  return value || key;
}

function loadTranslations(workspaceFolder: vscode.WorkspaceFolder): any {
  const cacheKey = workspaceFolder.uri.fsPath;
  
  if (translationCache[cacheKey]) {
    return translationCache[cacheKey];
  }

  const localesPath = path.join(workspaceFolder.uri.fsPath, 'locales');
  
  if (!fs.existsSync(localesPath)) {
    translationCache[cacheKey] = {};
    return {};
  }

  const schemaFile = path.join(localesPath, 'en.default.schema.json');
  const defaultFile = path.join(localesPath, 'en.default.json');
  
  let translations = {};

  if (fs.existsSync(schemaFile)) {
    try {
      const content = fs.readFileSync(schemaFile, 'utf-8');
      translations = JSON.parse(content);
      console.log('Loaded translations from en.default.schema.json');
    } catch (error) {
      console.error('Error loading en.default.schema.json:', error);
    }
  } else if (fs.existsSync(defaultFile)) {
    try {
      const content = fs.readFileSync(defaultFile, 'utf-8');
      translations = JSON.parse(content);
      console.log('Loaded translations from en.default.json');
    } catch (error) {
      console.error('Error loading en.default.json:', error);
    }
  }

  translationCache[cacheKey] = translations;
  return translations;
}

function getNestedValue(obj: any, path: string): string | null {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return null;
    }
  }

  return typeof current === 'string' ? current : null;
}

export function clearTranslationCache() {
  translationCache = {};
}

export function resolveSchemaTranslations(schema: any, workspaceFolder?: vscode.WorkspaceFolder): any {
  if (!schema) {
    return schema;
  }

  // Handle theme settings (array of groups)
  if (Array.isArray(schema)) {
    return schema.map((group: any) => resolveSettingsGroup(group, workspaceFolder));
  }

  // Handle section schema (single object)
  return resolveSectionSchema(schema, workspaceFolder);
}

function resolveSectionSchema(schema: any, workspaceFolder?: vscode.WorkspaceFolder): any {
  const resolved = JSON.parse(JSON.stringify(schema));

  if (resolved.name) {
    resolved.name = resolveTranslation(resolved.name, workspaceFolder);
  }

  if (resolved.settings && Array.isArray(resolved.settings)) {
    resolved.settings = resolveSettings(resolved.settings, workspaceFolder);
  }

  if (resolved.blocks && Array.isArray(resolved.blocks)) {
    resolved.blocks = resolved.blocks.map((block: any) => {
      const resolvedBlock = { ...block };
      
      if (resolvedBlock.name) {
        resolvedBlock.name = resolveTranslation(resolvedBlock.name, workspaceFolder);
      }

      if (resolvedBlock.settings && Array.isArray(resolvedBlock.settings)) {
        resolvedBlock.settings = resolveSettings(resolvedBlock.settings, workspaceFolder);
      }

      return resolvedBlock;
    });
  }

  return resolved;
}

function resolveSettingsGroup(group: any, workspaceFolder?: vscode.WorkspaceFolder): any {
  const resolved = { ...group };

  if (resolved.settings && Array.isArray(resolved.settings)) {
    resolved.settings = resolveSettings(resolved.settings, workspaceFolder);
  }

  return resolved;
}

function resolveSettings(settings: any[], workspaceFolder?: vscode.WorkspaceFolder): any[] {
  return settings.map((setting: any) => {
    const resolvedSetting = { ...setting };

    if (resolvedSetting.label) {
      resolvedSetting.label = resolveTranslation(resolvedSetting.label, workspaceFolder);
    }

    if (resolvedSetting.content) {
      resolvedSetting.content = resolveTranslation(resolvedSetting.content, workspaceFolder);
    }

    if (resolvedSetting.info) {
      resolvedSetting.info = resolveTranslation(resolvedSetting.info, workspaceFolder);
    }

    if (resolvedSetting.placeholder) {
      resolvedSetting.placeholder = resolveTranslation(resolvedSetting.placeholder, workspaceFolder);
    }

    if (resolvedSetting.options && Array.isArray(resolvedSetting.options)) {
      resolvedSetting.options = resolvedSetting.options.map((option: any) => ({
        ...option,
        label: resolveTranslation(option.label, workspaceFolder)
      }));
    }

    return resolvedSetting;
  });
}


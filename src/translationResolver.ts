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

  const localesPath = findLocalesFolder(workspaceFolder.uri.fsPath);
  
  if (!localesPath) {
    translationCache[cacheKey] = {};
    return {};
  }

  const schemaFile = path.join(localesPath, 'en.default.schema.json');
  const defaultFile = path.join(localesPath, 'en.default.json');
  
  let translations = {};

  if (fs.existsSync(schemaFile)) {
    translations = tryParseJsonFile(schemaFile, 'en.default.schema.json');
    if (!translations && fs.existsSync(defaultFile)) {
      translations = tryParseJsonFile(defaultFile, 'en.default.json');
    }
  } else if (fs.existsSync(defaultFile)) {
    translations = tryParseJsonFile(defaultFile, 'en.default.json');
  }

  translationCache[cacheKey] = translations;
  return translations;
}

function findLocalesFolder(workspacePath: string): string | null {
  const possiblePaths = [
    path.join(workspacePath, 'locales'),
    path.join(workspacePath, 'app', 'locales'),
    path.join(workspacePath, 'theme', 'locales'),
    path.join(workspacePath, 'src', 'locales'),
    path.join(workspacePath, '..', 'locales'),
  ];

  for (const localesPath of possiblePaths) {
    if (fs.existsSync(localesPath)) {
      return localesPath;
    }
  }

  try {
    const directories = fs.readdirSync(workspacePath, { withFileTypes: true });
    for (const dir of directories) {
      if (dir.isDirectory() && dir.name !== 'node_modules' && !dir.name.startsWith('.')) {
        const nestedLocales = path.join(workspacePath, dir.name, 'locales');
        if (fs.existsSync(nestedLocales)) {
          return nestedLocales;
        }
      }
    }
  } catch (error) {
    console.error('[Translation] Error scanning directories:', error);
  }

  return null;
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

function tryParseJsonFile(filePath: string, fileName: string): any {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const cleanedContent = stripJsonComments(content);
    return JSON.parse(cleanedContent);
  } catch (error: any) {
    console.error(`[Translation] Failed to parse ${fileName}:`, error.message);
    return {};
  }
}

function stripJsonComments(jsonString: string): string {
  let result = jsonString;
  
  // Remove single-line comments (// ...) but preserve strings
  result = result.replace(/("(?:[^"\\]|\\.)*")|\/\/.*/g, '$1');
  
  // Remove multi-line comments (/* ... */) but preserve strings
  result = result.replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\//g, '$1');
  
  // Remove trailing commas before closing brackets/braces
  result = result.replace(/,(\s*[}\]])/g, '$1');
  
  return result;
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

  // Resolve the group name if it has a translation key
  if (resolved.name && typeof resolved.name === 'string') {
    resolved.name = resolveTranslation(resolved.name, workspaceFolder);
  }

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


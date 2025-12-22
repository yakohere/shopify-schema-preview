import * as vscode from 'vscode';
import * as path from 'path';
import { SchemaPreviewPanel } from './schemaPreviewPanel';
import { extractSchemaFromDocument } from './schemaParser';
import { resolveSchemaTranslations, clearTranslationCache } from './translationResolver';

export function activate(context: vscode.ExtensionContext) {
  console.log('Shopify Schema Preview extension activated');

  const disposable = vscode.commands.registerCommand(
    'shopify-schema-preview.showPreview',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
      }

      const document = editor.document;
      const fileExtension = path.extname(document.fileName);
      const isJsonFile = document.languageId === 'json' || document.languageId === 'jsonc';
      const isLiquidFile = document.languageId === 'liquid';
      
      // Support both .liquid and .json files
      if (!isLiquidFile && !isJsonFile) {
        vscode.window.showWarningMessage('This command only works with Liquid or JSON files');
        return;
      }

      // Only process settings_schema.json, not other JSON files
      if (isJsonFile && !document.fileName.includes('settings_schema')) {
        vscode.window.showWarningMessage('Only settings_schema.json files are supported');
        return;
      }

      const schema = extractSchemaFromDocument(document.getText(), fileExtension);
      if (!schema) {
        vscode.window.showWarningMessage('No schema found in this file');
        return;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      const resolvedSchema = resolveSchemaTranslations(schema, workspaceFolder);

      SchemaPreviewPanel.createOrShow(context.extensionUri, resolvedSchema, workspaceFolder, document);
    }
  );

  context.subscriptions.push(disposable);

  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      const fileExtension = path.extname(editor.document.fileName);
      const isLiquid = editor.document.languageId === 'liquid';
      const isJsonFile = editor.document.languageId === 'json' || editor.document.languageId === 'jsonc';
      const isSettingsSchema = isJsonFile && editor.document.fileName.includes('settings_schema');
      
      if (isLiquid || isSettingsSchema) {
        const schema = extractSchemaFromDocument(editor.document.getText(), fileExtension);
        if (schema) {
          // If preview panel is already open, update it with the new file's schema
          if (SchemaPreviewPanel.currentPanel) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            const resolvedSchema = resolveSchemaTranslations(schema, workspaceFolder);
            SchemaPreviewPanel.currentPanel.updateSchema(resolvedSchema, editor.document);
          } else {
            // Only suggest if panel is not open
            suggestPreview();
          }
        }
      }
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument((event) => {
    if (!SchemaPreviewPanel.currentPanel) {
      return;
    }

    const fileExtension = path.extname(event.document.fileName);
    const isLiquid = event.document.languageId === 'liquid';
    const isJsonFile = event.document.languageId === 'json' || event.document.languageId === 'jsonc';
    const isSettingsSchema = isJsonFile && event.document.fileName.includes('settings_schema');
    
    if (isLiquid || isSettingsSchema) {
      const schema = extractSchemaFromDocument(event.document.getText(), fileExtension);
      if (schema) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(event.document.uri);
        const resolvedSchema = resolveSchemaTranslations(schema, workspaceFolder);
        SchemaPreviewPanel.currentPanel.updateSchema(resolvedSchema, event.document);
      }
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.uri.fsPath.includes('locales') && document.uri.fsPath.endsWith('.json')) {
      clearTranslationCache();
      console.log('Translation cache cleared due to locale file change');
    }
  }, null, context.subscriptions);
}

function suggestPreview() {
  const config = vscode.workspace.getConfiguration('shopify-schema-preview');
  const autoSuggest = config.get('autoSuggest', true);
  
  if (autoSuggest && !SchemaPreviewPanel.currentPanel) {
    vscode.window.showInformationMessage(
      'Schema detected in this file',
      'Preview Settings'
    ).then(selection => {
      if (selection === 'Preview Settings') {
        vscode.commands.executeCommand('shopify-schema-preview.showPreview');
      }
    });
  }
}

export function deactivate() {}


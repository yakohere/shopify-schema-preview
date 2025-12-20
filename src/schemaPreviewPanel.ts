import * as vscode from 'vscode';
import { ShopifySchema, isSectionSchema, isThemeSettings } from './schemaParser';

export class SchemaPreviewPanel {
  public static currentPanel: SchemaPreviewPanel | undefined;
  private static readonly viewType = 'shopifySchemaPreview';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _schema: ShopifySchema;
  private _workspaceFolder?: vscode.WorkspaceFolder;

  public static createOrShow(extensionUri: vscode.Uri, schema: ShopifySchema, workspaceFolder?: vscode.WorkspaceFolder) {
    const column = vscode.ViewColumn.Beside;

    if (SchemaPreviewPanel.currentPanel) {
      SchemaPreviewPanel.currentPanel._panel.reveal(column);
      SchemaPreviewPanel.currentPanel.updateSchema(schema);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      SchemaPreviewPanel.viewType,
      'Schema Preview',
      column,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      }
    );

    SchemaPreviewPanel.currentPanel = new SchemaPreviewPanel(panel, extensionUri, schema, workspaceFolder);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, schema: ShopifySchema, workspaceFolder?: vscode.WorkspaceFolder) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._schema = schema;
    this._workspaceFolder = workspaceFolder;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'alert':
            vscode.window.showInformationMessage(message.text);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public updateSchema(schema: ShopifySchema) {
    this._schema = schema;
    this._update();
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.title = this._getPanelTitle();
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getPanelTitle(): string {
    if (isSectionSchema(this._schema)) {
      return this._schema.name || 'Schema Preview';
    } else if (isThemeSettings(this._schema)) {
      return 'Theme Settings';
    }
    return 'Schema Preview';
  }

  public dispose() {
    SchemaPreviewPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src data:;">
        <title>Schema Preview</title>
        <style>
          ${this._getStyles()}
        </style>
      </head>
      <body>
  <div class="schema-container">
    ${this._renderContent()}
  </div>

        <script nonce="${nonce}">
          ${this._getScript()}
        </script>
      </body>
    </html>`;
  }

  private _renderContent(): string {
    if (isSectionSchema(this._schema)) {
      return this._renderSectionSchema();
    } else if (isThemeSettings(this._schema)) {
      return this._renderThemeSettings();
    }
    return '<div class="error">Unknown schema type</div>';
  }

  private _renderSectionSchema(): string {
    const schema = this._schema as any;
    return `
      <div class="schema-header">
        <h1 class="schema-title">${escapeHtml(schema.name)}</h1>
        ${schema.tag ? `<span class="schema-badge">${escapeHtml(schema.tag)}</span>` : ''}
      </div>
      
      ${schema.settings && schema.settings.length > 0 ? `
        <div class="section-group">
          <div class="section-group-title">Section Settings</div>
          <div class="settings-list">
            ${this._renderSettingsList(schema.settings)}
          </div>
        </div>
      ` : ''}
      
      ${schema.blocks && schema.blocks.length > 0 ? `
        <div class="section-group">
          <div class="section-group-title">Available Blocks</div>
          ${this._renderBlocks(schema.blocks)}
        </div>
      ` : ''}
    `;
  }

  private _renderThemeSettings(): string {
    const groups = this._schema as any[];
    return `
      <div class="schema-header">
        <h1 class="schema-title">🎨 Theme Settings</h1>
        <span class="schema-badge">Global Configuration</span>
      </div>
      ${groups.map((group, index) => this._renderThemeSettingsGroup(group, index)).join('')}
    `;
  }

  private _renderThemeSettingsGroup(group: any, index: number): string {
    // Skip theme_info group (first one), just show it as header
    if (group.name === 'theme_info') {
      return `
        <div class="theme-info-card">
          <div class="theme-info-title">Theme Information</div>
          ${group.theme_name ? `<div class="theme-info-item"><strong>Name:</strong> ${escapeHtml(group.theme_name)}</div>` : ''}
          ${group.theme_version ? `<div class="theme-info-item"><strong>Version:</strong> ${escapeHtml(group.theme_version)}</div>` : ''}
          ${group.theme_author ? `<div class="theme-info-item"><strong>Author:</strong> ${escapeHtml(group.theme_author)}</div>` : ''}
        </div>
      `;
    }

    return `
      <div class="theme-settings-group">
        <div class="theme-group-header">
          <span class="theme-group-icon">${this._getGroupIcon(group.name)}</span>
          <h2 class="theme-group-title">${escapeHtml(group.name)}</h2>
        </div>
        ${group.settings && group.settings.length > 0 ? `
          <div class="settings-list">
            ${this._renderSettingsList(group.settings)}
          </div>
        ` : ''}
      </div>
    `;
  }

  private _getGroupIcon(groupName: string): string {
    const icons: Record<string, string> = {
      'Colors': '🎨',
      'Typography': '✍️',
      'Layout': '📐',
      'Product Grid': '🛍️',
      'Cart': '🛒',
      'Social Media': '📱',
      'Header': '🔝',
      'Footer': '🔻',
      'Navigation': '🧭'
    };
    return icons[groupName] || '⚙️';
  }

  private _renderSettingsList(settings: any[]): string {
    return settings.map(setting => this._renderSetting(setting)).join('');
  }

  private _renderBlocks(blocks: any[]): string {
    if (!blocks || blocks.length === 0) {
      return '';
    }
    
    return blocks.map(block => this._renderBlock(block)).join('');
  }

  private _renderBlock(block: any): string {
    const blockName = escapeHtml(block.name || block.type || 'Untitled Block');
    const blockType = block.type ? `<span class="block-type">${escapeHtml(block.type)}</span>` : '';

    return `
      <div class="block-item">
        <div class="block-header">
          <div class="block-title">
            <span class="block-icon">📦</span>
            ${blockName}
          </div>
          ${blockType}
        </div>
        ${block.settings && block.settings.length > 0 ? `
          <div class="block-settings">
            ${block.settings.map((setting: any) => this._renderSetting(setting)).join('')}
          </div>
        ` : `
          <div class="block-empty">No settings</div>
        `}
      </div>
    `;
  }

  private _renderSetting(setting: any): string {
    if (setting.type === 'header') {
      return `
        <div class="setting-header">
          <h2>${escapeHtml(setting.content || '')}</h2>
        </div>
      `;
    }

    const conditionalNote = setting.visible_if
      ? `<div class="conditional-note">Conditional: ${escapeHtml(setting.visible_if)}</div>`
      : '';

    return `
      <div class="setting-item">
        ${this._renderControl(setting)}
        ${conditionalNote}
      </div>
    `;
  }

  private _renderControl(setting: any): string {
    const label = escapeHtml(setting.label || setting.id || '');
    const helpText = setting.info ? escapeHtml(setting.info) : '';

    switch (setting.type) {
      case 'text':
      case 'liquid':
      case 'url':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <input 
              type="text" 
              class="field-input"
              value="${escapeHtml(setting.default || '')}"
              ${setting.placeholder ? `placeholder="${escapeHtml(setting.placeholder)}"` : ''}
              readonly
            />
          </div>
        `;

      case 'textarea':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <textarea 
              class="field-textarea"
              ${setting.placeholder ? `placeholder="${escapeHtml(setting.placeholder)}"` : ''}
              readonly
            >${escapeHtml(setting.default || '')}</textarea>
          </div>
        `;

      case 'select':
        const options = setting.options?.map((opt: any) => ({
          label: escapeHtml(opt.label),
          value: escapeHtml(opt.value)
        })) || [];
        
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="select-wrapper">
              <select class="field-select" data-default="${escapeHtml(setting.default || '')}">
                ${options.map((opt: any) => `
                  <option value="${opt.value}" ${opt.value === setting.default ? 'selected' : ''}>${opt.label}</option>
                `).join('')}
              </select>
            </div>
          </div>
        `;

      case 'checkbox':
        return `
          <div class="form-field">
            <label class="field-checkbox-wrapper">
              <input 
                type="checkbox" 
                class="field-checkbox"
                ${setting.default ? 'checked' : ''}
                disabled
              />
              <span class="field-checkbox-label">${label}</span>
            </label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
          </div>
        `;

      case 'radio':
        const radioOptions = setting.options?.map((opt: any) => ({
          label: escapeHtml(opt.label),
          value: escapeHtml(opt.value)
        })) || [];

        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="radio-group">
              ${radioOptions.map((opt: any) => `
                <label class="radio-option">
                  <input 
                    type="radio" 
                    name="${setting.id}"
                    value="${opt.value}"
                    ${opt.value === setting.default ? 'checked' : ''}
                    disabled
                  />
                  <span>${opt.label}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `;

      case 'range':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="range-control">
              <div class="range-track">
                <div class="range-track-fill" style="width: ${((setting.default || setting.min || 0) - (setting.min || 0)) / ((setting.max || 100) - (setting.min || 0)) * 100}%"></div>
              </div>
              <input 
                type="range" 
                class="field-range"
                min="${setting.min || 0}"
                max="${setting.max || 100}"
                step="${setting.step || 1}"
                value="${setting.default || setting.min || 0}"
                disabled
              />
              <span class="range-value">${setting.default || setting.min || 0}${setting.unit || ''}</span>
            </div>
          </div>
        `;

      case 'number':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <input 
              type="number" 
              class="field-input"
              value="${setting.default || ''}"
              ${setting.min !== undefined ? `min="${setting.min}"` : ''}
              ${setting.max !== undefined ? `max="${setting.max}"` : ''}
              ${setting.step ? `step="${setting.step}"` : ''}
              readonly
            />
          </div>
        `;

      case 'color':
      case 'color_background':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="color-picker">
              <div class="color-swatch" style="background-color: ${setting.default || '#000000'}"></div>
              <input 
                type="text" 
                class="field-color-text"
                value="${setting.default || '#000000'}"
                readonly
              />
            </div>
          </div>
        `;

      case 'color_scheme':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="select-wrapper">
              <select class="field-select" data-default="${escapeHtml(setting.default || 'scheme-1')}">
                <option value="scheme-1" ${setting.default === 'scheme-1' ? 'selected' : ''}>Scheme 1</option>
                <option value="scheme-2" ${setting.default === 'scheme-2' ? 'selected' : ''}>Scheme 2</option>
                <option value="scheme-3" ${setting.default === 'scheme-3' ? 'selected' : ''}>Scheme 3</option>
              </select>
            </div>
          </div>
        `;

      case 'font_picker':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="select-wrapper">
              <select class="field-select" data-default="${escapeHtml(setting.default || 'assistant_n4')}">
                <option value="assistant_n4" ${setting.default === 'assistant_n4' ? 'selected' : ''}>Assistant</option>
                <option value="helvetica">Helvetica</option>
                <option value="arial">Arial</option>
                <option value="times_new_roman">Times New Roman</option>
              </select>
            </div>
          </div>
        `;

      case 'image_picker':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <button class="btn-upload" disabled>Choose Image</button>
            <div class="upload-status">No image selected</div>
          </div>
        `;

      case 'video':
      case 'video_url':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <input 
              type="text" 
              class="field-input"
              placeholder="https://www.youtube.com/watch?v=..."
              readonly
            />
          </div>
        `;

      case 'collection':
      case 'product':
      case 'product_list':
      case 'blog':
      case 'page':
      case 'article':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="select-wrapper">
              <select class="field-select" data-default="">
                <option value="">Select ${setting.type}...</option>
                <option value="example-1">Example ${setting.type} 1</option>
                <option value="example-2">Example ${setting.type} 2</option>
              </select>
            </div>
          </div>
        `;

      case 'richtext':
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <textarea class="field-textarea" readonly>${escapeHtml(setting.default || '')}</textarea>
          </div>
        `;

      default:
        return `
          <div class="form-field">
            <div class="unsupported-warning">⚠️ Unsupported setting type: ${setting.type}</div>
          </div>
        `;
    }
  }

  private _getStyles(): string {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
        font-size: 13px;
        line-height: 20px;
        color: #202223;
        background: #f6f6f7;
        padding: 20px;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      .schema-container {
        max-width: 680px;
        margin: 0 auto;
      }

      .schema-header {
        background: white;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 12px;
        box-shadow: 0 1px 0 0 rgba(0,0,0,0.05);
        border: 1px solid #e1e3e5;
      }

      .schema-title {
        font-size: 17px;
        font-weight: 600;
        color: #202223;
        line-height: 24px;
        margin-bottom: 0;
      }

      .schema-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        background-color: #f1f2f4;
        color: #202223;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        margin-top: 8px;
        border: 1px solid #e1e3e5;
      }

      .section-group {
        margin-bottom: 24px;
      }

      .section-group-title {
        font-size: 14px;
        font-weight: 600;
        color: #202223;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 2px solid #e1e3e5;
      }

      .settings-list {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .block-item {
        background: white;
        border: 1.5px solid #e1e3e5;
        border-radius: 8px;
        margin-bottom: 16px;
        overflow: hidden;
        box-shadow: 0 1px 0 0 rgba(0,0,0,0.05);
      }

      .block-header {
        background: linear-gradient(180deg, #fafbfb 0%, #f6f6f7 100%);
        padding: 12px 16px;
        border-bottom: 1.5px solid #e1e3e5;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .block-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: #202223;
        font-size: 14px;
        line-height: 20px;
      }

      .block-icon {
        font-size: 16px;
      }

      .block-type {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        background-color: #e3f1ff;
        color: #004b91;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .block-settings {
        padding: 12px;
      }

      .block-settings .setting-item {
        margin-bottom: 12px;
        box-shadow: none;
        border: 1px solid #e1e3e5;
      }

      .block-settings .setting-item:last-child {
        margin-bottom: 4px;
      }

      .block-empty {
        padding: 20px;
        text-align: center;
        color: #8c9196;
        font-size: 13px;
        font-style: italic;
      }

      .theme-info-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      }

      .theme-info-title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 12px;
        opacity: 0.9;
      }

      .theme-info-item {
        font-size: 13px;
        line-height: 20px;
        margin-bottom: 4px;
        opacity: 0.95;
      }

      .theme-info-item strong {
        opacity: 0.8;
        margin-right: 8px;
      }

      .theme-settings-group {
        background: white;
        border: 1.5px solid #e1e3e5;
        border-radius: 8px;
        margin-bottom: 16px;
        overflow: hidden;
        box-shadow: 0 1px 0 0 rgba(0,0,0,0.05);
      }

      .theme-group-header {
        background: linear-gradient(180deg, #fafbfb 0%, #f6f6f7 100%);
        padding: 16px 20px;
        border-bottom: 1.5px solid #e1e3e5;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .theme-group-icon {
        font-size: 20px;
        line-height: 1;
      }

      .theme-group-title {
        font-size: 16px;
        font-weight: 600;
        color: #202223;
        line-height: 24px;
        margin: 0;
      }

      .theme-settings-group .settings-list {
        padding: 12px;
      }

      .theme-settings-group .setting-item {
        margin-bottom: 12px;
      }

      .theme-settings-group .setting-item:last-child {
        margin-bottom: 4px;
      }

      .setting-header {
        padding: 12px 0;
        margin: 20px 0 12px 0;
        border-bottom: 1px solid #e1e3e5;
      }

      .setting-header:first-child {
        margin-top: 0;
        padding-top: 0;
      }

      .setting-header h2 {
        font-size: 12px;
        font-weight: 600;
        color: #6d7175;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        line-height: 16px;
      }

      .setting-item {
        background: white;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 12px;
        box-shadow: 0 1px 0 0 rgba(0,0,0,0.05);
        border: 1px solid #e1e3e5;
        transition: box-shadow 0.1s ease;
      }

      .setting-item:hover {
        box-shadow: 0 1px 0 0 rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.05);
      }

      .conditional-note {
        margin-top: 12px;
        padding: 12px;
        background-color: #fffbf4;
        border: 1px solid #ffd79d;
        color: #916a00;
        font-size: 12px;
        border-radius: 8px;
        line-height: 16px;
      }

      .conditional-note::before {
        content: "⚠️ ";
        margin-right: 4px;
      }

      .form-field {
        margin-bottom: 0;
      }

      .field-label {
        display: block;
        font-weight: 500;
        color: #202223;
        margin-bottom: 4px;
        font-size: 13px;
        line-height: 20px;
      }

      .field-help {
        color: #6d7175;
        font-size: 12px;
        line-height: 16px;
        margin-top: 4px;
        margin-bottom: 8px;
      }

      .field-input,
      .field-select,
      .field-textarea {
        width: 100%;
        padding: 6px 12px;
        border: 1.5px solid #c9cccf;
        border-radius: 8px;
        font-family: inherit;
        font-size: 13px;
        line-height: 20px;
        color: #202223;
        background-color: #ffffff;
        transition: all 0.1s ease;
      }

      .field-input::placeholder,
      .field-textarea::placeholder {
        color: #8c9196;
      }

      .field-input:hover,
      .field-select:hover,
      .field-textarea:hover {
        border-color: #999fa4;
      }

      .field-input:focus,
      .field-select:focus,
      .field-textarea:focus {
        outline: none;
        border-color: #005bd3;
        box-shadow: 0 0 0 1px #005bd3;
      }

      .field-input:disabled,
      .field-select:disabled,
      .field-textarea:disabled {
        background-color: #f6f6f7;
        border-color: #e1e3e5;
        color: #8c9196;
        cursor: not-allowed;
      }

      .field-textarea {
        min-height: 72px;
        resize: vertical;
        padding: 8px 12px;
      }

      .select-wrapper {
        position: relative;
        display: block;
      }

      .select-wrapper::after {
        content: '';
        position: absolute;
        right: 14px;
        top: 50%;
        transform: translateY(-50%);
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 6px solid #76787a;
        pointer-events: none;
      }

      .field-select {
        cursor: pointer;
        padding-right: 40px;
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        background-color: #fafbfb;
      }

      .field-select:hover {
        background-color: #f6f6f7;
        cursor: pointer;
      }

      .field-select:focus {
        background-color: white;
      }

      .field-checkbox-wrapper {
        display: flex;
        align-items: flex-start;
        cursor: not-allowed;
        user-select: none;
        padding: 4px 0;
      }

      .field-checkbox {
        width: 20px;
        height: 20px;
        margin-right: 12px;
        margin-top: 0;
        cursor: not-allowed;
        border: 1.5px solid #c9cccf;
        border-radius: 4px;
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        background-color: white;
        position: relative;
        flex-shrink: 0;
        transition: all 0.1s ease;
      }

      .field-checkbox:checked {
        background-color: #008060;
        border-color: #008060;
      }

      .field-checkbox:checked::after {
        content: '';
        position: absolute;
        left: 6px;
        top: 2px;
        width: 4px;
        height: 9px;
        border: solid white;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }

      .field-checkbox:disabled {
        opacity: 0.6;
      }

      .field-checkbox-label {
        font-size: 13px;
        line-height: 20px;
        color: #202223;
        font-weight: 400;
      }

      .radio-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 4px 0;
      }

      .radio-option {
        display: flex;
        align-items: center;
        cursor: not-allowed;
        user-select: none;
      }

      .radio-option input[type="radio"] {
        width: 20px;
        height: 20px;
        margin-right: 12px;
        cursor: not-allowed;
        border: 1.5px solid #c9cccf;
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        border-radius: 50%;
        background-color: white;
        position: relative;
        flex-shrink: 0;
        transition: all 0.1s ease;
      }

      .radio-option input[type="radio"]:checked {
        border-color: #008060;
      }

      .radio-option input[type="radio"]:checked::after {
        content: '';
        position: absolute;
        left: 5px;
        top: 5px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #008060;
      }

      .radio-option input[type="radio"]:disabled {
        opacity: 0.6;
      }

      .radio-option span {
        font-size: 13px;
        line-height: 20px;
        color: #202223;
      }

      .range-control {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 8px;
        position: relative;
      }

      .range-track {
        position: absolute;
        left: 0;
        bottom: 9px;
        right: 86px;
        height: 6px;
        background: #e1e3e5;
        border-radius: 3px;
        pointer-events: none;
      }

      .range-track-fill {
        height: 100%;
        background: #008060;
        border-radius: 3px;
        transition: width 0.1s ease;
      }

      .field-range {
        flex: 1;
        height: 6px;
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        outline: none;
        position: relative;
        z-index: 1;
        cursor: not-allowed;
      }

      .field-range::-webkit-slider-track {
        height: 6px;
        background: transparent;
        border-radius: 3px;
      }

      .field-range::-moz-range-track {
        height: 6px;
        background: transparent;
        border-radius: 3px;
      }

      .field-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: white;
        border: 2px solid #008060;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.12);
        margin-top: -7px;
      }

      .field-range::-moz-range-thumb {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: white;
        border: 2px solid #008060;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.12);
      }

      .field-range:disabled::-webkit-slider-thumb {
        cursor: not-allowed;
      }

      .field-range:disabled::-moz-range-thumb {
        cursor: not-allowed;
      }

      .range-value {
        min-width: 70px;
        text-align: right;
        font-weight: 600;
        color: #202223;
        font-size: 13px;
        line-height: 20px;
        font-variant-numeric: tabular-nums;
      }

      .color-picker {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .color-swatch {
        width: 36px;
        height: 36px;
        border: 1.5px solid #c9cccf;
        border-radius: 8px;
        flex-shrink: 0;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05);
      }

      .field-color-text {
        flex: 1;
        padding: 6px 12px;
        border: 1.5px solid #c9cccf;
        border-radius: 8px;
        font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
        font-size: 12px;
        line-height: 20px;
        color: #202223;
        background-color: #f6f6f7;
        text-transform: uppercase;
      }

      .btn-upload {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 16px;
        background-color: white;
        color: #202223;
        border: 1.5px solid #c9cccf;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
        cursor: pointer;
        transition: all 0.1s ease;
        font-family: inherit;
        min-height: 36px;
      }

      .btn-upload:hover {
        background-color: #f6f6f7;
        border-color: #babfc3;
      }

      .btn-upload:active {
        background-color: #f1f2f4;
        box-shadow: inset 0 1px 0 0 rgba(0,0,0,0.05);
      }

      .btn-upload:focus {
        outline: none;
        box-shadow: 0 0 0 2px #005bd3;
      }

      .upload-status {
        margin-top: 8px;
        color: #6d7175;
        font-size: 12px;
        line-height: 16px;
      }

      .unsupported-warning {
        padding: 12px 16px;
        background-color: #fff4e6;
        border: 1.5px solid #ffb224;
        border-radius: 8px;
        color: #916a00;
        font-size: 12px;
        line-height: 16px;
        font-weight: 500;
      }

      .unsupported-warning::before {
        content: "⚠️ ";
        margin-right: 6px;
      }
    `;
  }

  private _getScript(): string {
    return `
      const vscode = acquireVsCodeApi();
      
      // Allow viewing select options but reset to default value after interaction
      document.querySelectorAll('select.field-select').forEach(select => {
        const defaultValue = select.getAttribute('data-default');
        
        select.addEventListener('change', (e) => {
          // Reset to default value (allow viewing options but not changing)
          setTimeout(() => {
            e.target.value = defaultValue;
          }, 100);
        });
        
        select.addEventListener('blur', (e) => {
          // Ensure it's back to default when user clicks away
          e.target.value = defaultValue;
        });
      });
    `;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}



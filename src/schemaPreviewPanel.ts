import * as vscode from 'vscode';
import { ShopifySchema, isSectionSchema, isThemeSettings } from './schemaParser';
import { validateSectionSchema, validateThemeSettings, ValidationResult, ValidationMessage } from './schemaValidator';

export class SchemaPreviewPanel {
  public static currentPanel: SchemaPreviewPanel | undefined;
  private static readonly viewType = 'shopifySchemaPreview';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _schema: ShopifySchema;
  private _workspaceFolder?: vscode.WorkspaceFolder;
  private _sourceDocument?: vscode.TextDocument;
  private _validationResult?: ValidationResult;

  public static createOrShow(extensionUri: vscode.Uri, schema: ShopifySchema, workspaceFolder?: vscode.WorkspaceFolder, sourceDocument?: vscode.TextDocument) {
    const column = vscode.ViewColumn.Beside;

    if (SchemaPreviewPanel.currentPanel) {
      SchemaPreviewPanel.currentPanel._panel.reveal(column);
      SchemaPreviewPanel.currentPanel.updateSchema(schema, sourceDocument);
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

    SchemaPreviewPanel.currentPanel = new SchemaPreviewPanel(panel, extensionUri, schema, workspaceFolder, sourceDocument);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, schema: ShopifySchema, workspaceFolder?: vscode.WorkspaceFolder, sourceDocument?: vscode.TextDocument) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._schema = schema;
    this._workspaceFolder = workspaceFolder;
    this._sourceDocument = sourceDocument;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'alert':
            vscode.window.showInformationMessage(message.text);
            return;
          case 'navigateToSetting':
            this._navigateToSetting(message.settingId);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public updateSchema(schema: ShopifySchema, sourceDocument?: vscode.TextDocument) {
    this._schema = schema;
    if (sourceDocument) {
      this._sourceDocument = sourceDocument;
    }
    this._update();
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.title = this._getPanelTitle();

    // Run validation
    if (isSectionSchema(this._schema)) {
      this._validationResult = validateSectionSchema(this._schema);
    } else if (isThemeSettings(this._schema)) {
      this._validationResult = validateThemeSettings(this._schema as any[]);
    }

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

  private async _navigateToSetting(settingId: string) {
    if (!this._sourceDocument) {
      return;
    }

    const text = this._sourceDocument.getText();
    const searchPattern = new RegExp(`["']id["']\\s*:\\s*["']${settingId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
    const match = text.match(searchPattern);

    if (match && match.index !== undefined) {
      const position = this._sourceDocument.positionAt(match.index);
      const editor = await vscode.window.showTextDocument(this._sourceDocument, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
      });

      const line = position.line;
      const range = new vscode.Range(line, 0, line, 0);
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
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

  private _getSettingValidationErrors(settingId: string): ValidationMessage[] {
    if (!this._validationResult) return [];
    return [
      ...this._validationResult.errors.filter(e => e.settingId === settingId),
      ...this._validationResult.warnings.filter(w => w.settingId === settingId),
    ];
  }

  private _renderSectionSchema(): string {
    const schema = this._schema as any;
    const settingsCount = schema.settings?.length || 0;
    const blocksCount = schema.blocks?.length || 0;

    return `
      <div class="schema-header">
        <h1 class="schema-title">${escapeHtml(schema.name || 'Untitled Section')}</h1>
        ${schema.tag ? `<span class="schema-badge">${escapeHtml(schema.tag)}</span>` : ''}
      </div>

      <div class="search-toolbar">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input type="text" id="search-input" class="search-input" placeholder="Search by ID, label, or type..." />
          <button class="search-clear-btn" id="search-clear" title="Clear search">✕</button>
        </div>
        <select id="type-filter" class="type-filter">
          <option value="">All Types</option>
          ${this._getSettingTypeOptions(schema)}
        </select>
        <button class="collapse-toolbar-btn" id="toggle-all" data-state="expanded">
          <span class="toggle-icon">▶</span> <span class="toggle-text">Collapse All</span>
        </button>
      </div>

      <div class="search-results-info" id="search-results-info"></div>

      ${schema.settings && schema.settings.length > 0 ? `
        <div class="section-group">
          <div class="section-group-header">
            <div class="section-group-title">
              <span class="collapse-icon">▼</span>
              Section Settings
              <span class="settings-count">${settingsCount}</span>
            </div>
          </div>
          <div class="section-group-content">
            <div class="settings-list">
              ${this._renderSettingsList(schema.settings)}
            </div>
          </div>
        </div>
      ` : ''}

      ${schema.blocks && schema.blocks.length > 0 ? `
        <div class="section-group">
          <div class="section-group-header">
            <div class="section-group-title">
              <span class="collapse-icon">▼</span>
              Available Blocks
              <span class="settings-count">${blocksCount}</span>
            </div>
          </div>
          <div class="section-group-content">
            ${this._renderBlocks(schema.blocks)}
          </div>
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

      <div class="search-toolbar">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input type="text" id="search-input" class="search-input" placeholder="Search by ID, label, or type..." />
          <button class="search-clear-btn" id="search-clear" title="Clear search">✕</button>
        </div>
        <select id="type-filter" class="type-filter">
          <option value="">All Types</option>
          ${this._getThemeSettingTypeOptions(groups)}
        </select>
        <button class="collapse-toolbar-btn" id="toggle-all" data-state="expanded">
          <span class="toggle-icon">▶</span> <span class="toggle-text">Collapse All</span>
        </button>
      </div>

      <div class="search-results-info" id="search-results-info"></div>

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

    const settingsCount = group.settings?.length || 0;

    return `
      <div class="theme-settings-group">
        <div class="theme-group-header">
          <div class="theme-group-header-left">
            <span class="collapse-icon">▼</span>
            <span class="theme-group-icon">${this._getGroupIcon(group.name)}</span>
            <h2 class="theme-group-title">${escapeHtml(group.name)}</h2>
          </div>
          <div class="theme-group-header-right">
            ${settingsCount > 0 ? `<span class="settings-count">${settingsCount}</span>` : ''}
          </div>
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

  private _getSettingTypeOptions(schema: any): string {
    const types = new Set<string>();

    // Collect types from section settings
    if (schema.settings) {
      schema.settings.forEach((setting: any) => {
        if (setting.type && setting.type !== 'header' && setting.type !== 'paragraph') {
          types.add(setting.type);
        }
      });
    }

    // Collect types from block settings
    if (schema.blocks) {
      schema.blocks.forEach((block: any) => {
        if (block.settings) {
          block.settings.forEach((setting: any) => {
            if (setting.type && setting.type !== 'header' && setting.type !== 'paragraph') {
              types.add(setting.type);
            }
          });
        }
      });
    }

    return Array.from(types)
      .sort()
      .map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
      .join('');
  }

  private _getThemeSettingTypeOptions(groups: any[]): string {
    const types = new Set<string>();

    groups.forEach((group: any) => {
      if (group.settings) {
        group.settings.forEach((setting: any) => {
          if (setting.type && setting.type !== 'header' && setting.type !== 'paragraph') {
            types.add(setting.type);
          }
        });
      }
    });

    return Array.from(types)
      .sort()
      .map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
      .join('');
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
    const settingsCount = block.settings?.length || 0;

    return `
      <div class="block-item">
        <div class="block-header">
          <div class="block-header-left">
            <span class="collapse-icon">▼</span>
            <div class="block-title">
              <span class="block-icon">📦</span>
              ${blockName}
            </div>
          </div>
          <div class="block-header-right">
            ${settingsCount > 0 ? `<span class="settings-count">${settingsCount}</span>` : ''}
            ${blockType}
          </div>
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
        <div class="setting-header" data-setting-type="header">
          <h2>${escapeHtml(setting.content || '')}</h2>
        </div>
      `;
    }

    const conditionalNote = setting.visible_if
      ? `<div class="conditional-note"><span>👁</span><span>Conditional: ${escapeHtml(setting.visible_if)}</span></div>`
      : '';

    const settingId = setting.id ? escapeHtml(setting.id) : '';
    const settingLabel = escapeHtml(setting.label || setting.id || '');
    const settingType = escapeHtml(setting.type || '');

    // Get validation errors for this setting
    const validationIssues = this._getSettingValidationErrors(setting.id || '');
    const hasError = validationIssues.some(v => v.type === 'error');
    const hasWarning = validationIssues.some(v => v.type === 'warning');
    const validationClass = hasError ? 'has-error' : (hasWarning ? 'has-warning' : '');

    // Render inline validation messages
    const inlineValidation = validationIssues.length > 0
      ? validationIssues.map(v => `
          <div class="setting-inline-validation inline-${v.type}">
            <span>${v.type === 'error' ? '✕' : '⚠'}</span>
            <span>${escapeHtml(v.message)}</span>
          </div>
        `).join('')
      : '';

    return `
      <div class="setting-item ${validationClass}"
           data-setting-id="${settingId}"
           data-setting-label="${settingLabel.toLowerCase()}"
           data-setting-type="${settingType}"
           data-clickable="${settingId ? 'true' : 'false'}">
        ${this._renderControl(setting)}
        ${inlineValidation}
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
        const selectedOption = options.find((opt: any) => opt.value === setting.default) || options[0];
        const optionCount = options.length;

        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="select-dropdown">
              <div class="select-current">
                <span class="select-current-value">${selectedOption?.label || 'Select an option'}</span>
                <span class="select-current-meta">${optionCount} option${optionCount !== 1 ? 's' : ''}</span>
                <span class="select-chevron">▼</span>
              </div>
              <div class="select-options-list">
                ${options.map((opt: any) => `
                  <div class="select-option ${opt.value === setting.default ? 'selected' : ''}" data-value="${opt.value}">
                    <span class="select-option-radio"></span>
                    <span class="select-option-label">${opt.label}</span>
                    <span class="select-option-value">${opt.value}</span>
                  </div>
                `).join('')}
              </div>
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
        const schemeOptions = [
          { value: 'scheme-1', label: 'Scheme 1' },
          { value: 'scheme-2', label: 'Scheme 2' },
          { value: 'scheme-3', label: 'Scheme 3' }
        ];
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="select-grid">
              ${schemeOptions.map((opt: any) => `
                <div class="select-option ${opt.value === (setting.default || 'scheme-1') ? 'selected' : ''}" data-value="${opt.value}">
                  <div class="select-option-label">${opt.label}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;

      case 'font_picker':
        const fontOptions = [
          { value: 'assistant_n4', label: 'Assistant' },
          { value: 'helvetica', label: 'Helvetica' },
          { value: 'arial', label: 'Arial' },
          { value: 'times_new_roman', label: 'Times New Roman' }
        ];
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="select-grid">
              ${fontOptions.map((opt: any) => `
                <div class="select-option ${opt.value === (setting.default || 'assistant_n4') ? 'selected' : ''}" data-value="${opt.value}">
                  <div class="select-option-label">${opt.label}</div>
                </div>
              `).join('')}
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
      case 'collection_list':
      case 'product':
      case 'product_list':
      case 'blog':
      case 'page':
      case 'article':
        const resourceOptions = [
          { value: '', label: `Select ${setting.type}...` },
          { value: 'example-1', label: `Example ${setting.type} 1` },
          { value: 'example-2', label: `Example ${setting.type} 2` }
        ];
        return `
          <div class="form-field">
            <label class="field-label">${label}</label>
            ${helpText ? `<div class="field-help">${helpText}</div>` : ''}
            <div class="select-grid">
              ${resourceOptions.map((opt: any) => `
                <div class="select-option ${opt.value === '' ? 'selected' : ''}" data-value="${opt.value}">
                  <div class="select-option-label">${opt.label}</div>
                </div>
              `).join('')}
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
            <div class="unsupported-warning">Unsupported setting type: ${setting.type}</div>
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
        font-family: var(--vscode-font-family);
        font-size: 12px;
        line-height: 18px;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 12px;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      .schema-container {
        max-width: 680px;
        margin: 0 auto;
      }

      .schema-header {
        background: var(--vscode-editor-background);
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 8px;
        box-shadow: 0 1px 0 0 var(--vscode-widget-shadow);
        border: 1px solid var(--vscode-panel-border);
      }

      .schema-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--vscode-foreground);
        line-height: 20px;
        margin-bottom: 0;
      }

      .schema-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 6px;
        background-color: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        border-radius: 3px;
        font-size: 11px;
        font-weight: 500;
        margin-top: 6px;
        border: 1px solid var(--vscode-panel-border);
      }

      /* Inline validation indicators on settings */
      .setting-item.has-error {
        border-color: var(--vscode-testing-iconFailed, #f44336);
        box-shadow: 0 0 0 1px var(--vscode-testing-iconFailed, #f44336);
      }

      .setting-item.has-warning {
        border-color: var(--vscode-editorWarning-foreground, #ff9800);
      }

      .setting-inline-validation {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        font-size: 11px;
        line-height: 14px;
      }

      .setting-inline-validation.inline-error {
        background: rgba(244, 67, 54, 0.1);
        color: var(--vscode-testing-iconFailed, #f44336);
      }

      .setting-inline-validation.inline-warning {
        background: rgba(255, 152, 0, 0.1);
        color: var(--vscode-editorWarning-foreground, #ff9800);
      }

      .search-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        padding: 0 4px;
        flex-wrap: wrap;
      }

      .search-input-wrapper {
        display: flex;
        align-items: center;
        flex: 1;
        min-width: 200px;
        position: relative;
        background-color: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        transition: border-color 0.1s ease;
      }

      .search-input-wrapper:focus-within {
        border-color: var(--vscode-focusBorder);
        box-shadow: 0 0 0 1px var(--vscode-focusBorder);
      }

      .search-icon {
        padding: 0 8px;
        font-size: 12px;
        opacity: 0.7;
      }

      .search-input {
        flex: 1;
        padding: 6px 8px 6px 0;
        border: none;
        background: transparent;
        color: var(--vscode-input-foreground);
        font-family: var(--vscode-font-family);
        font-size: 12px;
        outline: none;
      }

      .search-input::placeholder {
        color: var(--vscode-input-placeholderForeground);
      }

      .search-clear-btn {
        display: none;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        margin-right: 4px;
        padding: 0;
        background: transparent;
        border: none;
        color: var(--vscode-descriptionForeground);
        cursor: pointer;
        font-size: 12px;
        border-radius: 3px;
        transition: all 0.1s ease;
      }

      .search-clear-btn:hover {
        background: var(--vscode-toolbar-hoverBackground);
        color: var(--vscode-foreground);
      }

      .search-clear-btn.visible {
        display: flex;
      }

      .type-filter {
        padding: 6px 8px;
        background-color: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        color: var(--vscode-input-foreground);
        font-family: var(--vscode-font-family);
        font-size: 11px;
        cursor: pointer;
        min-width: 100px;
        transition: border-color 0.1s ease;
      }

      .type-filter:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
        box-shadow: 0 0 0 1px var(--vscode-focusBorder);
      }

      .type-filter:hover {
        border-color: var(--vscode-inputOption-activeBorder);
      }

      .search-results-info {
        display: none;
        padding: 8px 12px;
        margin-bottom: 12px;
        background-color: var(--vscode-textBlockQuote-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }

      .search-results-info.visible {
        display: block;
      }

      .search-results-info .highlight-count {
        font-weight: 600;
        color: var(--vscode-foreground);
      }

      .setting-item.search-hidden,
      .setting-header.search-hidden,
      .block-item.search-hidden {
        display: none;
      }

      .setting-item.search-match {
        box-shadow: 0 0 0 2px var(--vscode-focusBorder);
        border-color: var(--vscode-focusBorder);
      }

      .collapse-toolbar-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border);
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        line-height: 14px;
        cursor: pointer;
        transition: all 0.1s ease;
        font-family: var(--vscode-font-family);
      }

      .collapse-toolbar-btn:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
      }

      .collapse-toolbar-btn:active {
        opacity: 0.9;
      }

      .collapse-toolbar-btn:focus {
        outline: none;
        box-shadow: 0 0 0 1px var(--vscode-focusBorder);
      }

      .section-group {
        margin-bottom: 16px;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        overflow: hidden;
        box-shadow: 0 1px 0 0 var(--vscode-widget-shadow);
      }

      .section-group-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: var(--vscode-input-background);
        border-bottom: 1px solid var(--vscode-panel-border);
        cursor: pointer;
        user-select: none;
        transition: background-color 0.1s ease;
      }

      .section-group-header:hover {
        background: var(--vscode-list-hoverBackground);
      }

      .section-group-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--vscode-foreground);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .section-group-content {
        padding: 8px;
        transition: max-height 0.2s ease-out, opacity 0.2s ease-out;
      }

      .section-group.collapsed .section-group-content {
        display: none;
      }

      .section-group.collapsed .section-group-header {
        border-bottom: none;
      }

      .collapse-icon {
        font-size: 10px;
        transition: transform 0.2s ease;
        color: var(--vscode-descriptionForeground);
      }

      .collapsed .collapse-icon {
        transform: rotate(-90deg);
      }

      .settings-count {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        font-weight: 400;
        padding: 2px 6px;
        background: var(--vscode-badge-background);
        border-radius: 10px;
      }

      .settings-list {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .block-item {
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        margin-bottom: 10px;
        overflow: hidden;
        box-shadow: 0 1px 0 0 var(--vscode-widget-shadow);
      }

      .block-header {
        background: var(--vscode-input-background);
        padding: 8px 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
        transition: background-color 0.1s ease;
      }

      .block-header:hover {
        background: var(--vscode-list-hoverBackground);
      }

      .block-item.collapsed .block-header {
        border-bottom: none;
      }

      .block-item.collapsed .block-settings,
      .block-item.collapsed .block-empty {
        display: none;
      }

      .block-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .block-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .block-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        color: var(--vscode-foreground);
        font-size: 12px;
        line-height: 18px;
      }

      .block-icon {
        font-size: 14px;
      }

      .block-type {
        display: inline-flex;
        align-items: center;
        padding: 2px 6px;
        background-color: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .block-settings {
        padding: 8px;
      }

      .block-settings .setting-item {
        margin-bottom: 8px;
        box-shadow: none;
        border: 1px solid var(--vscode-panel-border);
      }

      .block-settings .setting-item:last-child {
        margin-bottom: 4px;
      }

      .block-empty {
        padding: 12px;
        text-align: center;
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        font-style: italic;
      }

      .theme-info-card {
        background: var(--vscode-textBlockQuote-background);
        color: var(--vscode-foreground);
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 12px;
        box-shadow: 0 1px 0 0 var(--vscode-widget-shadow);
        border: 1px solid var(--vscode-panel-border);
      }

      .theme-info-title {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 8px;
        opacity: 0.9;
      }

      .theme-info-item {
        font-size: 11px;
        line-height: 16px;
        margin-bottom: 3px;
        opacity: 0.95;
      }

      .theme-info-item strong {
        opacity: 0.8;
        margin-right: 6px;
      }

      .theme-settings-group {
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        margin-bottom: 10px;
        overflow: hidden;
        box-shadow: 0 1px 0 0 var(--vscode-widget-shadow);
      }

      .theme-group-header {
        background: var(--vscode-input-background);
        padding: 8px 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
        transition: background-color 0.1s ease;
      }

      .theme-group-header:hover {
        background: var(--vscode-list-hoverBackground);
      }

      .theme-group-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .theme-group-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .theme-settings-group.collapsed .theme-group-header {
        border-bottom: none;
      }

      .theme-settings-group.collapsed .settings-list {
        display: none;
      }

      .theme-group-icon {
        font-size: 16px;
        line-height: 1;
      }

      .theme-group-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--vscode-foreground);
        line-height: 18px;
        margin: 0;
      }

      .theme-settings-group .settings-list {
        padding: 8px;
      }

      .theme-settings-group .setting-item {
        margin-bottom: 8px;
      }

      .theme-settings-group .setting-item:last-child {
        margin-bottom: 4px;
      }

      .setting-header {
        padding: 8px 0;
        margin: 12px 0 8px 0;
        border-bottom: 1px solid var(--vscode-panel-border);
      }

      .setting-header:first-child {
        margin-top: 0;
        padding-top: 0;
      }

      .setting-header h2 {
        font-size: 11px;
        font-weight: 600;
        color: var(--vscode-descriptionForeground);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        line-height: 14px;
      }

      .setting-item {
        background: var(--vscode-editor-background);
        padding: 10px;
        border-radius: 6px;
        margin-bottom: 8px;
        box-shadow: 0 1px 0 0 var(--vscode-widget-shadow);
        border: 1px solid var(--vscode-panel-border);
        transition: box-shadow 0.1s ease;
        cursor: pointer;
      }

      .setting-item:hover {
        box-shadow: 0 1px 0 0 var(--vscode-widget-shadow), 0 0 0 1px var(--vscode-focusBorder);
        border-color: var(--vscode-focusBorder);
      }

      .conditional-note {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        font-size: 11px;
        line-height: 14px;
        background: rgba(33, 150, 243, 0.1);
        color: var(--vscode-editorInfo-foreground, #2196f3);
      }

      .form-field {
        margin-bottom: 0;
      }

      .field-label {
        display: block;
        font-weight: 500;
        color: var(--vscode-foreground);
        margin-bottom: 4px;
        font-size: 12px;
        line-height: 16px;
      }

      .field-help {
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        line-height: 14px;
        margin-top: 3px;
        margin-bottom: 6px;
      }

      .field-input,
      .field-textarea {
        width: 100%;
        padding: 4px 8px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        font-family: var(--vscode-font-family);
        font-size: 12px;
        line-height: 16px;
        color: var(--vscode-input-foreground);
        background-color: var(--vscode-input-background);
        transition: all 0.1s ease;
      }

      .field-input::placeholder,
      .field-textarea::placeholder {
        color: var(--vscode-input-placeholderForeground);
      }

      .field-input:hover,
      .field-textarea:hover {
        border-color: var(--vscode-inputOption-activeBorder);
      }

      .field-input:focus,
      .field-textarea:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
        box-shadow: 0 0 0 1px var(--vscode-focusBorder);
      }

      .field-input:disabled,
      .field-textarea:disabled {
        background-color: var(--vscode-input-background);
        border-color: var(--vscode-input-border);
        color: var(--vscode-disabledForeground);
        cursor: not-allowed;
        opacity: 0.6;
      }

      .field-textarea {
        min-height: 60px;
        resize: vertical;
        padding: 6px 8px;
      }

      .select-dropdown {
        margin-top: 6px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        overflow: hidden;
        background: var(--vscode-input-background);
      }

      .select-current {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        background: var(--vscode-input-background);
        cursor: pointer;
        user-select: none;
        transition: background-color 0.1s ease;
      }

      .select-current:hover {
        background: var(--vscode-list-hoverBackground);
      }

      .select-current-value {
        flex: 1;
        font-size: 12px;
        font-weight: 500;
        color: var(--vscode-foreground);
      }

      .select-current-meta {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        margin-right: 8px;
        padding: 2px 6px;
        background: var(--vscode-badge-background);
        border-radius: 10px;
      }

      .select-chevron {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        transition: transform 0.2s ease;
      }

      .select-dropdown.expanded .select-chevron {
        transform: rotate(180deg);
      }

      .select-options-list {
        display: none;
        border-top: 1px solid var(--vscode-panel-border);
        max-height: 200px;
        overflow-y: auto;
      }

      .select-dropdown.expanded .select-options-list {
        display: block;
      }

      .select-option {
        display: flex;
        align-items: center;
        padding: 6px 12px;
        cursor: pointer;
        transition: background-color 0.1s ease;
        gap: 8px;
      }

      .select-option:hover {
        background-color: var(--vscode-list-hoverBackground);
      }

      .select-option.selected {
        background-color: var(--vscode-list-activeSelectionBackground);
      }

      .select-option-radio {
        width: 14px;
        height: 14px;
        border: 1.5px solid var(--vscode-input-border);
        border-radius: 50%;
        flex-shrink: 0;
        position: relative;
        transition: all 0.15s ease;
      }

      .select-option.selected .select-option-radio {
        border-color: var(--vscode-focusBorder);
      }

      .select-option.selected .select-option-radio::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 6px;
        height: 6px;
        background: var(--vscode-focusBorder);
        border-radius: 50%;
      }

      .select-option-label {
        flex: 1;
        font-size: 12px;
        line-height: 16px;
        color: var(--vscode-foreground);
      }

      .select-option.selected .select-option-label {
        font-weight: 500;
        color: var(--vscode-list-activeSelectionForeground);
      }

      .select-option-value {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        font-family: inherit;
        padding: 1px 4px;
        background: var(--vscode-textBlockQuote-background);
        border-radius: 3px;
      }

      .select-option.selected .select-option-value {
        background: rgba(255, 255, 255, 0.1);
      }

      .field-checkbox-wrapper {
        display: flex;
        align-items: flex-start;
        cursor: not-allowed;
        user-select: none;
        padding: 2px 0;
      }

      .field-checkbox {
        width: 16px;
        height: 16px;
        margin-right: 8px;
        margin-top: 0;
        cursor: not-allowed;
        border: 1px solid var(--vscode-checkbox-border);
        border-radius: 3px;
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        background-color: var(--vscode-checkbox-background);
        position: relative;
        flex-shrink: 0;
        transition: all 0.1s ease;
      }

      .field-checkbox:checked {
        background-color: var(--vscode-checkbox-selectBackground);
        border-color: var(--vscode-checkbox-selectBorder);
      }

      .field-checkbox:checked::after {
        content: '✓';
        position: absolute;
        left: 2px;
        top: 1px;
        font-size: 12px;
        color: var(--vscode-checkbox-border);
        font-weight: bold;
        line-height: 1;
      }

      .field-checkbox:checked::after {
        color: var(--vscode-checkbox-selectBorder);
      }

      .field-checkbox:disabled {
        opacity: 0.5;
      }

      .field-checkbox-label {
        font-size: 12px;
        line-height: 16px;
        color: var(--vscode-foreground);
        font-weight: 400;
      }

      .radio-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 2px 0;
      }

      .radio-option {
        display: flex;
        align-items: center;
        cursor: not-allowed;
        user-select: none;
      }

      .radio-option input[type="radio"] {
        width: 16px;
        height: 16px;
        margin-right: 8px;
        cursor: not-allowed;
        border: 1px solid var(--vscode-checkbox-border);
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        border-radius: 50%;
        background-color: var(--vscode-checkbox-background);
        position: relative;
        flex-shrink: 0;
        transition: all 0.1s ease;
      }

      .radio-option input[type="radio"]:checked {
        border-color: var(--vscode-checkbox-selectBorder);
      }

      .radio-option input[type="radio"]:checked::after {
        content: '';
        position: absolute;
        left: 4px;
        top: 4px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: var(--vscode-checkbox-selectBackground);
      }

      .radio-option input[type="radio"]:disabled {
        opacity: 0.5;
      }

      .radio-option span {
        font-size: 12px;
        line-height: 16px;
        color: var(--vscode-foreground);
      }

      .range-control {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 6px;
        position: relative;
      }

      .range-track {
        position: absolute;
        left: 0;
        bottom: 8px;
        right: 70px;
        height: 4px;
        background: var(--vscode-input-background);
        border-radius: 2px;
        pointer-events: none;
      }

      .range-track-fill {
        height: 100%;
        background: var(--vscode-button-background);
        border-radius: 2px;
        transition: width 0.1s ease;
      }

      .field-range {
        flex: 1;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        outline: none;
        position: relative;
        z-index: 1;
        cursor: not-allowed;
      }

      .field-range::-webkit-slider-track {
        height: 4px;
        background: transparent;
        border-radius: 2px;
      }

      .field-range::-moz-range-track {
        height: 4px;
        background: transparent;
        border-radius: 2px;
      }

      .field-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--vscode-editor-background);
        border: 2px solid var(--vscode-button-background);
        box-shadow: 0 0 0 1px var(--vscode-widget-shadow);
        margin-top: -6px;
      }

      .field-range::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--vscode-editor-background);
        border: 2px solid var(--vscode-button-background);
        box-shadow: 0 0 0 1px var(--vscode-widget-shadow);
      }

      .field-range:disabled::-webkit-slider-thumb {
        cursor: not-allowed;
      }

      .field-range:disabled::-moz-range-thumb {
        cursor: not-allowed;
      }

      .range-value {
        min-width: 60px;
        text-align: right;
        font-weight: 600;
        color: var(--vscode-foreground);
        font-size: 11px;
        line-height: 16px;
        font-variant-numeric: tabular-nums;
      }

      .color-picker {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .color-swatch {
        width: 28px;
        height: 28px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        flex-shrink: 0;
        box-shadow: inset 0 0 0 1px var(--vscode-widget-shadow);
      }

      .field-color-text {
        flex: 1;
        padding: 4px 8px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        font-family: var(--vscode-editor-font-family);
        font-size: 11px;
        line-height: 16px;
        color: var(--vscode-input-foreground);
        background-color: var(--vscode-input-background);
        text-transform: uppercase;
      }

      .btn-upload {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 12px;
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border);
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        line-height: 16px;
        cursor: pointer;
        transition: all 0.1s ease;
        font-family: var(--vscode-font-family);
        min-height: 28px;
      }

      .btn-upload:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
      }

      .btn-upload:active {
        background-color: var(--vscode-button-secondaryHoverBackground);
        opacity: 0.9;
      }

      .btn-upload:focus {
        outline: none;
        box-shadow: 0 0 0 1px var(--vscode-focusBorder);
      }

      .upload-status {
        margin-top: 6px;
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        line-height: 14px;
      }

      .unsupported-warning {
        padding: 8px 10px;
        background-color: var(--vscode-inputValidation-warningBackground);
        border: 1px solid var(--vscode-inputValidation-warningBorder);
        border-radius: 4px;
        color: var(--vscode-inputValidation-warningForeground);
        font-size: 11px;
        line-height: 14px;
        font-weight: 500;
      }

      .unsupported-warning::before {
        content: "⚠️ ";
        margin-right: 4px;
      }
    `;
  }

  private _getScript(): string {
    return `
      const vscode = acquireVsCodeApi();

      // Handle clicks on settings to navigate to their location in the file
      document.querySelectorAll('.setting-item[data-clickable="true"]').forEach(item => {
        item.addEventListener('click', (e) => {
          // Don't navigate if clicking on a select dropdown
          if (e.target.closest('.select-dropdown')) {
            return;
          }

          const settingId = item.getAttribute('data-setting-id');
          if (settingId) {
            vscode.postMessage({
              command: 'navigateToSetting',
              settingId: settingId
            });
          }
        });
      });

      // Select dropdown toggle functionality
      document.querySelectorAll('.select-dropdown').forEach(dropdown => {
        const current = dropdown.querySelector('.select-current');
        if (current) {
          current.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.select-dropdown.expanded').forEach(other => {
              if (other !== dropdown) {
                other.classList.remove('expanded');
              }
            });
            dropdown.classList.toggle('expanded');
          });
        }
      });

      // Close dropdowns when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.select-dropdown')) {
          document.querySelectorAll('.select-dropdown.expanded').forEach(dropdown => {
            dropdown.classList.remove('expanded');
          });
        }
      });

      // Collapsible sections functionality
      function toggleCollapse(element) {
        element.classList.toggle('collapsed');
      }

      // Handle section group header clicks
      document.querySelectorAll('.section-group-header').forEach(header => {
        header.addEventListener('click', (e) => {
          const group = header.closest('.section-group');
          if (group) {
            toggleCollapse(group);
          }
        });
      });

      // Handle block header clicks
      document.querySelectorAll('.block-header').forEach(header => {
        header.addEventListener('click', (e) => {
          const block = header.closest('.block-item');
          if (block) {
            toggleCollapse(block);
          }
        });
      });

      // Handle theme settings group header clicks
      document.querySelectorAll('.theme-group-header').forEach(header => {
        header.addEventListener('click', (e) => {
          const group = header.closest('.theme-settings-group');
          if (group) {
            toggleCollapse(group);
          }
        });
      });

      // Toggle All button
      const toggleBtn = document.getElementById('toggle-all');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const isExpanded = toggleBtn.getAttribute('data-state') === 'expanded';
          const collapsibles = document.querySelectorAll('.section-group, .block-item, .theme-settings-group');

          if (isExpanded) {
            // Collapse all
            collapsibles.forEach(el => el.classList.add('collapsed'));
            toggleBtn.setAttribute('data-state', 'collapsed');
            toggleBtn.querySelector('.toggle-icon').textContent = '▼';
            toggleBtn.querySelector('.toggle-text').textContent = 'Expand All';
          } else {
            // Expand all
            collapsibles.forEach(el => el.classList.remove('collapsed'));
            toggleBtn.setAttribute('data-state', 'expanded');
            toggleBtn.querySelector('.toggle-icon').textContent = '▶';
            toggleBtn.querySelector('.toggle-text').textContent = 'Collapse All';
          }
        });
      }

      // Search and Filter functionality
      const searchInput = document.getElementById('search-input');
      const typeFilter = document.getElementById('type-filter');
      const searchClearBtn = document.getElementById('search-clear');
      const searchResultsInfo = document.getElementById('search-results-info');

      function performSearch() {
        const searchTerm = (searchInput?.value || '').toLowerCase().trim();
        const selectedType = typeFilter?.value || '';
        const allSettings = document.querySelectorAll('.setting-item, .setting-header');
        const allBlocks = document.querySelectorAll('.block-item');

        let visibleCount = 0;
        let totalCount = 0;

        // Show/hide clear button
        if (searchClearBtn) {
          if (searchTerm) {
            searchClearBtn.classList.add('visible');
          } else {
            searchClearBtn.classList.remove('visible');
          }
        }

        // Filter settings
        allSettings.forEach(setting => {
          const settingType = setting.getAttribute('data-setting-type') || '';

          // Skip header type for counting
          if (settingType === 'header') {
            // Hide headers when filtering
            if (searchTerm || selectedType) {
              setting.classList.add('search-hidden');
            } else {
              setting.classList.remove('search-hidden');
            }
            return;
          }

          totalCount++;

          const settingId = (setting.getAttribute('data-setting-id') || '').toLowerCase();
          const settingLabel = (setting.getAttribute('data-setting-label') || '').toLowerCase();

          const matchesSearch = !searchTerm ||
            settingId.includes(searchTerm) ||
            settingLabel.includes(searchTerm) ||
            settingType.includes(searchTerm);

          const matchesType = !selectedType || settingType === selectedType;

          if (matchesSearch && matchesType) {
            setting.classList.remove('search-hidden');
            setting.classList.toggle('search-match', !!searchTerm);
            visibleCount++;
          } else {
            setting.classList.add('search-hidden');
            setting.classList.remove('search-match');
          }
        });

        // Filter blocks - show block if any of its settings match
        allBlocks.forEach(block => {
          const blockSettings = block.querySelectorAll('.setting-item');
          const hasVisibleSettings = Array.from(blockSettings).some(s => !s.classList.contains('search-hidden'));

          if (searchTerm || selectedType) {
            if (hasVisibleSettings) {
              block.classList.remove('search-hidden');
              // Expand block to show matching settings
              block.classList.remove('collapsed');
            } else {
              block.classList.add('search-hidden');
            }
          } else {
            block.classList.remove('search-hidden');
          }
        });

        // Expand section groups when filtering
        if (searchTerm || selectedType) {
          document.querySelectorAll('.section-group, .theme-settings-group').forEach(group => {
            group.classList.remove('collapsed');
          });
        }

        // Update results info
        if (searchResultsInfo) {
          if (searchTerm || selectedType) {
            searchResultsInfo.classList.add('visible');
            const filterInfo = [];
            if (searchTerm) filterInfo.push(\`"\${searchTerm}"\`);
            if (selectedType) filterInfo.push(\`type: \${selectedType}\`);
            searchResultsInfo.innerHTML = \`Showing <span class="highlight-count">\${visibleCount}</span> of \${totalCount} settings\${filterInfo.length ? ' matching ' + filterInfo.join(' and ') : ''}\`;
          } else {
            searchResultsInfo.classList.remove('visible');
          }
        }
      }

      // Debounce search for better performance
      let searchTimeout;
      function debouncedSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(performSearch, 150);
      }

      // Event listeners
      searchInput?.addEventListener('input', debouncedSearch);
      typeFilter?.addEventListener('change', performSearch);

      // Clear search button
      searchClearBtn?.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          performSearch();
          searchInput.focus();
        }
      });

      // Keyboard shortcut: Ctrl/Cmd + F to focus search
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault();
          searchInput?.focus();
        }
        // Escape to clear search
        if (e.key === 'Escape' && searchInput === document.activeElement) {
          searchInput.value = '';
          performSearch();
        }
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



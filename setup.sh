#!/bin/bash

echo "🚀 Setting up Shopify Settings Preview Extension..."
echo ""

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔨 Compiling TypeScript..."
npm run compile

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run the extension:"
echo "1. Press F5 in VS Code/Cursor"
echo "2. Open 'test-example.liquid' in the new window"
echo "3. Click the preview icon in the toolbar"
echo ""
echo "For more information, see GETTING_STARTED.md"


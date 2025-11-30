# <img src="assets/icon.svg" alt="CogNotez Logo" width="48" height="48"> CogNotez - AI-Powered Note App

![Version](https://img.shields.io/badge/version-2.1.3-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-lightgrey.svg)
![Electron](https://img.shields.io/badge/Electron-30.0-9feaf9.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)

An offline-first, privacy-focused note-taking application that leverages local Large Language Models (LLMs) for intelligent features. Built with Electron and featuring web scraping, advanced import/export capabilities, and seamless AI integration.

**[Download Latest Release](https://github.com/nawka12/CogNotez/releases)** | **[Report Issues](https://github.com/nawka12/CogNotez/issues)** | **[View Documentation](https://github.com/nawka12/CogNotez)**

## Quick Start

1. **Download** the latest release from [GitHub Releases](https://github.com/nawka12/CogNotez/releases)
2. **Install Ollama** (for AI features):
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ollama pull llama3.2:latest
   ollama serve
   ```
3. **Launch CogNotez** and start taking notes!
4. **Create your first note**: Press `Ctrl+N` or click the "+" button
5. **Try AI features**: Select text, right-click, and explore AI-powered actions

> **Note**: CogNotez works great offline! AI features require Ollama running locally or OpenRouter API key for online use.

## Features

### Core
- **Offline-First**: Full functionality without internet connection
- **Privacy-Focused**: All data stays on your device
- **Local AI Integration**: Uses Ollama for AI features
- **Clean Interface**: Modern, minimalist design with light/dark themes
- **Multi-Language**: English, Spanish, Indonesian, Japanese, and Javanese support

### AI-Powered
- **Smart Summarization**: AI-generated summaries of notes or selected text
- **Contextual Q&A**: Ask AI questions about your notes
- **Text Editing**: AI-powered text transformations and improvements
- **Content Generation**: AI-powered content creation and brainstorming
- **Text Rewriting**: Rewrite content in different styles
- **Key Points Extraction**: Automatically extract main points from text
- **Tag Generation**: AI-suggested tags for better organization
- **Web Scraping**: Extract content from websites, Reddit, and Fandom wikis
- **Web Search Integration**: Optional SearXNG integration for enhanced AI queries

### Organization & Search
- **Folder & Tag Navigation**: Organize notes with folder-based navigation using tags
- **Advanced Search**: Full-text search with tag filtering, date ranges, and sorting
- **Note Templates**: Built-in templates and AI-generated custom templates
- **Multi-Tab Support**: Work with multiple notes simultaneously

### Rich Media & Editing
- **Rich Media**: Images, videos with flexible sizing controls
- **Find & Replace**: Powerful text search with regex support
- **Undo/Redo**: Full history tracking for text editing
- **Preview Mode**: Toggle between edit, preview, and split view modes
- **Markdown Support**: Full markdown editing with live preview

### Security & Sync
- **Password-Locked Notes**: End-to-end encryption (AES-256-GCM) for protected notes
- **Google Drive Sync**: Optional cloud sync with end-to-end encryption
- **Google Drive Sharing**: Share notes on Google Drive with customizable permissions (view, comment, edit)
- **Backup & Restore**: Complete data backup and restoration
- **Import/Export**: JSON export/import for easy migration

### Sharing & Export
- **Multiple Export Formats**: Markdown (.md), Plain Text (.txt), PDF (with media preservation)
- **Clipboard Sharing**: Copy notes as Markdown or plain text to clipboard
- **File Export**: Export individual notes or complete backup for easy sharing
- **Share Link Management**: Manage Google Drive share links and permissions

## Installation & Setup

### Prerequisites
- **Node.js** (v20 or higher)
- **Ollama** (for AI features) - [Download here](https://ollama.com/)

### Optional Components
- **SearXNG** (for web search integration) - [Setup Guide](https://docs.searxng.org/)
- **OpenRouter API Key** (alternative to local Ollama) - [Get API Key](https://openrouter.ai/)

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/nawka12/CogNotez
   cd cognotez
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Ollama** (for AI features)
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ollama pull llama3.2:latest
   ollama serve
   ```

4. **Run the application**
   ```bash
   npm start
   ```

### Google Drive Sync

1. Open the app and click the cloud icon (☁️) in the header
2. Click "Import Credentials File" and select the OAuth JSON from Google Cloud Console
3. Click "Connect Google Drive" and complete the Google sign-in
4. (Optional) Enable "End-to-End Encryption" and set a passphrase
5. Choose whether to enable Auto Sync and Sync on Startup

For detailed setup, see [Google Drive Sync Setup](GOOGLE_DRIVE_SYNC.md).

## Usage

### Basic Note Taking
- **Create**: `Ctrl+N` or click the "+" button
- **Save**: `Ctrl+S` or click the save button
- **Search**: Use the search bar (click × to clear)
- **Filter**: Click folder items in sidebar (All Notes, Untagged, or tag folders)
- **Find & Replace**: `Ctrl+F` to find, `Ctrl+H` for find and replace
- **Undo/Redo**: `Ctrl+Z` to undo, `Ctrl+Y` to redo
- **Preview**: `Ctrl+P` to toggle between edit, preview, and split view modes

### AI Features

**Right-click on selected text** to access:
- **📝 Summarize Selection** (`Ctrl+Shift+S`)
- **🤖 Ask AI About Selection** (`Ctrl+Shift+A`)
- **✏️ Edit Selection with AI** (`Ctrl+Shift+E`)
- **🎨 Rewrite Selection** (`Ctrl+Shift+W`)
- **📋 Extract Key Points** (`Ctrl+Shift+K`)
- **🏷️ Generate Tags** (`Ctrl+Shift+T`)

**Right-click anywhere** (no selection) for:
- **✨ Generate with AI** (`Ctrl+Shift+G`)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | Create new note |
| `Ctrl+S` | Save current note |
| `Ctrl+F` | Find text |
| `Ctrl+H` | Find and replace |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+P` | Toggle preview mode |
| `Ctrl+Shift+S` | Summarize selected text |
| `Ctrl+Shift+A` | Ask AI about selected text |
| `Ctrl+Shift+E` | Edit selected text with AI |
| `Ctrl+Shift+G` | Generate content with AI |
| `Ctrl+Shift+W` | Rewrite selected text |
| `Ctrl+Shift+K` | Extract key points |
| `Ctrl+Shift+T` | Generate tags |
| `F1` | Show keyboard shortcuts help |

### Rich Media

**Images**: Click the image button (🖼️), drag & drop, or paste from clipboard. Supported formats: JPEG, PNG, GIF, WebP, SVG.

**Videos**: Click the video button (🎥) or drag & drop video files (MP4, WebM, OGG).

**Sizing**: Images and videos auto-scale by default. Use HTML attributes (`width`, `height`) for manual control.

### Note Templates

**Built-in Templates**: Blank Note, Meeting Notes, Daily Journal, Project Plan, Book Notes, Research Notes, To-Do List, Brainstorm, Recipe, Code Snippet.

**Custom Templates**: Create from current note or generate with AI. Access via **File → New from Template**.

### Sharing Notes

**Share Button**: Click the share icon (📤) in the note editor toolbar to access sharing options:

- **Google Drive**: Share on Google Drive with customizable permissions (view-only, comment, or edit)
  - Requires Google Drive sync setup (see [Google Drive Sync](#google-drive-sync))
  - Automatically updates shared notes when edited
  - Manage shared links and revoke access
  
- **Export as File**:
  - **Markdown**: Export as `.md` file
  - **Plain Text**: Export as `.txt` file
  - **PDF**: Export as PDF with media preserved
  
- **Copy to Clipboard**: Copy note content as Markdown or plain text

**Share via Menu**: Access export options via **File → Export** menu.

### Internationalization

Supported languages: **English**, **Spanish**, **Indonesian**, **Japanese**, **Javanese (Basa Jawa)**.

Change language via **More options (⋯) → Language** in the header. Language preference is automatically saved.

## Offline Functionality

### What Works Offline
- ✅ All note-taking features (create, edit, delete, search)
- ✅ Local AI features (when using Ollama)
- ✅ Theme switching and preferences
- ✅ Data export and backup
- ✅ Password-protected notes
- ✅ Fast startup (<2 seconds)

### What Requires Internet
- ❌ Google Drive sync and sharing
- ❌ OpenRouter AI (cloud-based)
- ❌ SearXNG web search
- ❌ Web scraping features

The app displays real-time network status indicators (🟢 Online, 🔴 Offline, ⚠️ Partial).

## Troubleshooting

### AI Features Not Working
1. **Check Ollama Status**: `ollama list` and `curl http://localhost:11434/api/tags`
2. **Restart Ollama**: `ollama serve`
3. **Pull Models**: `ollama pull llama3.2:latest`
4. **Check Network**: Ensure Ollama is running locally or you have internet for OpenRouter

### Application Won't Start
1. Check Node.js version: `node --version` (should be v20+)
2. Reinstall dependencies: `rm -rf node_modules && npm install`
3. Check for errors: `npm start` and review console output

### Performance Issues
- Ensure sufficient RAM for AI models (4GB+ recommended)
- Close unnecessary applications
- Use SSD storage for better performance

### Google Drive Sync Issues
- Check network connectivity (app shows offline indicator when disconnected)
- Verify OAuth credentials are correctly imported
- Ensure Google Cloud Console has your email as a Test user

## Contributing

We welcome contributions! Here's how you can help:

- **Report Bugs**: [Create a bug report](https://github.com/nawka12/CogNotez/issues)
- **Suggest Features**: [Submit a feature request](https://github.com/nawka12/CogNotez/issues)
- **Submit Pull Requests**: Fork the repo and submit a PR
- **Improve Documentation**: Help make our docs better

### Development Setup
1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Run in development mode: `npm run dev`
4. Make your changes and test thoroughly
5. Submit a pull request with a clear description

## Version History

### v2.1.3 (Current)
- Enhanced internationalization support
- Improved user notifications and translations

### v2.1.2
- Enhanced internationalization support
- Added Spanish language support
- Improved translations across the application

### v2.1.1
- Added Javanese (Basa Jawa) language support
- Enhanced translations for user notifications, prompts, tag management, and sharing features

### v2.1.0
- Full multi-language support (English, Indonesian, Japanese)
- Complete UI translation including menus, dialogs, and tooltips
- Language selector in header overflow menu
- Automatic language detection based on system preferences

### v2.0.0
- Folder & Tag Navigation with folder-based organization
- Enhanced search with clear button
- Media insertion buttons in toolbar
- Revamped header toolbar
- Enhanced splash screen with animated background

### v1.5.0
- Multi-tab support for working with multiple notes simultaneously
- Enhanced header and search functionality

### v1.4.2
- Cancel button for AI operations

### v1.4.1
- Google Drive note sharing with permission management
- Media file management for shared notes
- Collaboration metadata tracking
- Bug fixes and stability improvements

### v1.4.0
- Find & Replace with regex support
- Undo/Redo with full history tracking
- Preview mode toggle (Edit/Preview/Split)

For earlier versions, see the full [changelog](https://github.com/nawka12/CogNotez/releases).

## Support

- **Issues**: [GitHub Issues](https://github.com/nawka12/CogNotez/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nawka12/CogNotez/discussions)
- **Documentation**: Check [specs.md](specs.md) for detailed requirements

## License

MIT License - see LICENSE file for details.

---

**CogNotez** - Taking notes into the AI era, while keeping your data private and secure.

Made with ❤️ by [nawka12](https://github.com/nawka12)

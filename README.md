# <img src="assets/icon.svg" alt="CogNotez Logo" width="48" height="48"> CogNotez - AI-Powered Note App

An offline-first, privacy-focused note-taking application that leverages local Large Language Models (LLMs) for intelligent features. Built with Electron and featuring web scraping, advanced import/export capabilities, and seamless AI integration.

## CogNotez is still on development.

## Features

### Core Functionality
- **Offline-First**: Full functionality without internet connection
- **Privacy-Focused**: All data stays on your device
- **Local AI Integration**: Uses Ollama for AI features
- **Clean Interface**: Modern, minimalist design with light/dark themes
- **Data Portability**: Export notes in multiple formats

### AI-Powered Features
- **Smart Summarization**: AI-generated summaries of notes or selected text
- **Contextual Q&A**: Ask AI questions about your notes
- **Text Editing**: AI-powered text transformations and improvements
- **Text Rewriting**: Rewrite content in different styles (professional, casual, academic, simple, creative)
- **Key Points Extraction**: Automatically extract main points from text
- **Tag Generation**: AI-suggested tags for better organization
- **Conversation History**: All AI interactions saved in database
- **Streaming Responses**: Real-time AI response generation
- **Multi-Model Support**: Choose from different Ollama models
- **Web Scraping**: Extract content from websites, Reddit, and Fandom wikis
- **Web Search Integration**: Optional SearXNG integration for enhanced AI queries
- **Advanced Import/Export**: Support for JSON and bulk file operations

### User Experience
- **Keyboard Shortcuts**: Full keyboard navigation support
- **Context Menus**: Right-click AI actions on selected text
- **Theme Support**: Light and dark modes with custom accent color
- **Search**: Fast, real-time note search
- **Auto-Save**: Automatic saving with manual override
- **Data Portability**: JSON export/import for easy migration
- **Backup & Restore**: Complete data backup and restoration
- **Migration Wizard**: Guided data migration between installations
- **Sharing**: Share notes via clipboard or exported files
- **Statistics**: Note statistics and analytics dashboard

### Security & Privacy
- **Password-Locked Notes**: Full end-to-end encryption for protected notes. Note content is encrypted at rest using AES-256-GCM encryption; passwords are stored as salted PBKDF2 hashes (210,000 iterations) for verification.
- **Encrypted Cloud Backups**: When Google Drive sync is enabled, backups are end-to-end encrypted before upload using AES-256-GCM with PBKDF2 key derivation.

## Technology Stack

- **Frontend**: Vanilla JavaScript (HTML/CSS/JS)
- **Desktop Framework**: Electron
- **AI Integration**: Ollama (local LLM) with optional OpenRouter API fallback
- **Database**: localStorage (JSON-based) for portable offline storage
- **Web Scraping**: Axios and Cheerio for content extraction
- **Markdown Processing**: Marked library for rendering
- **Styling**: CSS Custom Properties with theme support

## Installation & Setup

### Prerequisites

1. **Node.js** (v16 or higher)
2. **Ollama** (for AI features) - [Download here](https://ollama.com/)

#### Optional Components
3. **SearXNG** (for web search integration) - [Setup Guide](https://docs.searxng.org/)
4. **OpenRouter API Key** (alternative to local Ollama) - [Get API Key](https://openrouter.ai/)

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

3. **Set up Ollama (for AI features)**
   ```bash
   # Install Ollama (if not already installed)
   curl -fsSL https://ollama.com/install.sh | sh

   # Pull a language model (recommended: gemma3:latest)
   ollama pull gemma3:latest

   # Start Ollama service
   ollama serve
   ```

4. **Run the application**
   ```bash
   npm start
   ```

### Database Setup

CogNotez uses localStorage for data storage, which provides a simple yet robust solution for offline-first applications. Data is stored as JSON in the browser's local storage and automatically synchronized.

**Benefits of localStorage for offline-first apps:**
- No additional dependencies required
- Automatic data persistence across sessions
- JSON-based format for easy export/import
- Cross-platform compatibility
- Zero configuration required
- Perfect for desktop applications

## Usage

### Basic Note Taking

1. **Create a new note**: Click the "+" button or press `Ctrl+N`
2. **Edit notes**: Click on any note in the sidebar to edit
3. **Save notes**: Press `Ctrl+S` or click the save button
4. **Search notes**: Use the search bar to find notes instantly

### Advanced Features

#### Web Scraping
CogNotez includes powerful web scraping capabilities to extract content from various sources:

- **Reddit Integration**: Extract posts, comments, and discussions from Reddit threads
- **Fandom Wiki Support**: Scrape content from Fandom wikis and similar platforms
- **Generic Website Scraping**: Extract main content from any website
- **Smart Content Detection**: Automatically identifies and extracts the most relevant content
- **Rate Limiting**: Built-in delays to respect website policies

#### Data Import/Export
Comprehensive import and export capabilities for maximum data portability:

- **JSON Export/Import**: Complete database export and import for backups
- **Bulk File Operations**: Import multiple files at once
- **Migration Wizard**: Guided migration between CogNotez installations

#### Backup & Restore
- **Automatic Backups**: Create timestamped backups before major operations
- **Full System Backup**: Complete database and settings backup
- **Selective Restore**: Restore specific data or entire databases
- **Backup Verification**: Integrity checks on backup files

#### Sharing & Collaboration
- **Clipboard Sharing**: Copy notes to clipboard in multiple formats
- **File Export**: Export individual or multiple notes as files
- **Format Options**: Markdown and plain text export formats
- **Shareable Links**: Generate shareable note references

### AI Features

#### Text Selection Actions (Right-click or keyboard shortcuts)

1. **Summarize Selection**: `Ctrl+Shift+S`
   - Select text and choose "Summarize Selection"
   - AI generates a concise summary

2. **Ask AI About Selection**: `Ctrl+Shift+A`
   - Select text and ask questions about it
   - AI provides contextual answers

3. **Edit Selection with AI**: `Ctrl+Shift+E`
   - Select text and describe desired changes
   - AI transforms the text accordingly

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | Create new note |
| `Ctrl+S` | Save current note |
| `Ctrl+O` | Open note dialog |
| `Ctrl+/` | Focus search |
| `Ctrl+Shift+S` | Summarize selected text |
| `Ctrl+Shift+A` | Ask AI about selected text |
| `Ctrl+Shift+E` | Edit selected text with AI |
| `Ctrl+Shift+W` | Rewrite selected text |
| `Ctrl+Shift+K` | Extract key points |
| `Ctrl+Shift+T` | Generate tags for selection |
| `F1` | Show keyboard shortcuts help |
| `Escape` | Close menus/dialogs |
| `Right-click` | Show AI context menu on selected text |

### Right-Click Context Menu

Select any text in your notes and right-click to access powerful AI features:

- **📝 Summarize Selection**: Get a concise summary of selected text
- **🤖 Ask AI About Selection**: Ask questions about the selected content
- **✏️ Edit Selection with AI**: Transform text with AI assistance
- **🎨 Rewrite Selection**: Change writing style (professional, casual, etc.)
- **📋 Extract Key Points**: Pull out main points from text
- **🏷️ Generate Tags**: Get AI-suggested tags for organization

### Themes

- **Light Mode**: Clean, bright interface
- **Dark Mode**: Easy on the eyes for low-light environments
- Toggle using the theme button in the header

### AI Settings

Configure your AI integration through the **AI → AI Settings** menu:

- **Connection Status**: Check if Ollama is running
- **Endpoint Configuration**: Set custom Ollama server address
- **Model Selection**: Choose from available AI models
- **Connection Testing**: Verify your setup works correctly

**Setup Ollama:**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model (recommended: gemma3:latest)
ollama pull gemma3:latest

# Start the service
ollama serve
```

## Project Structure

```
cognotez/
├── main.js                    # Electron main process and menu system
├── package.json              # Dependencies and build scripts
├── package-lock.json         # Dependency lock file
├── src/                      # Application source code
│   ├── index.html           # Main HTML interface
│   ├── css/
│   │   ├── styles.css       # Main application styles
│   │   └── themes.css       # Light/dark theme definitions
│   └── js/
│       ├── app.js           # Main application coordinator
│       ├── ai.js            # AI integration and chat
│       ├── backend.js       # File operations and data management
│       ├── database.js      # Database abstraction layer
│       ├── notes.js         # Note CRUD operations
│       ├── scraper.js       # Web scraping functionality
│       └── ui.js            # UI utilities and enhancements
├── dist/                     # Build output directory
│   └── linux-unpacked/      # Linux executable and resources
├── test-*.js                # Test scripts for various features
├── scraper-aichan.js        # Additional scraping utilities
├── specs.md                 # Project specifications
└── README.md                # This documentation
```

## Development

### Building for Distribution

```bash
# Create distributable packages
npm run dist

# Build only
npm run build
```

### Development Mode

```bash
# Run with dev tools open
npm run dev
```

### Code Structure

- **Main Process** (`main.js`): Electron window management, menu system, and IPC handlers
- **Renderer Process** (`src/`): Web-based UI and application logic
- **Core Modules**:
  - `app.js`: Main application coordinator and initialization
  - `notes.js`: Note CRUD operations and management
  - `ai.js`: AI integration, chat, and tool calling
  - `database.js`: localStorage abstraction and data persistence
  - `backend.js`: File operations, import/export, and data management
  - `scraper.js`: Web scraping functionality for external content
  - `ui.js`: UI utilities, themes, and user interactions

## Configuration

### AI Settings

The application automatically detects Ollama running on `localhost:11434`. Advanced configuration options include:

#### Ollama Configuration
1. **Local Models**: Automatic detection of installed Ollama models
2. **Custom Endpoints**: Configure alternative Ollama server addresses
3. **Model Selection**: Choose from available models for different tasks

#### OpenRouter Integration (Optional)
1. **API Key Setup**: Configure OpenRouter API key for cloud AI fallback
2. **Model Selection**: Access to various AI models through OpenRouter
3. **Tool Calling**: Enhanced AI capabilities with web search integration

#### SearXNG Web Search (Optional)
1. **Server Configuration**: Set custom SearXNG instance URL
2. **Search Integration**: Enable web search for AI queries
3. **Privacy-Focused**: Use self-hosted SearXNG for maximum privacy

### Theme Customization

Edit `src/css/themes.css` to customize:
- Color palette
- Accent colors (currently `#BDABE3`)
- Font families
- Spacing and sizing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Roadmap

### Phase 1 ✅ (Completed)
- ✅ Basic Electron setup
- ✅ Core UI and theming
- ✅ Note creation and editing
- ✅ localStorage database integration

### Phase 2 ✅ (Completed)
- ✅ Full Ollama integration
- ✅ Advanced AI features (summarization, Q&A, text editing, rewriting)
- ✅ Context menus and keyboard shortcuts
- ✅ AI settings and configuration
- ✅ Data export/import functionality

### Phase 3 ✅ (Completed)
- ✅ Complete AI feature set (7+ AI actions)
- ✅ Right-click context menu system
- ✅ Comprehensive keyboard shortcuts
- ✅ AI conversation history
- ✅ Multi-model support
- ✅ Streaming AI responses

### Phase 4 ✅ (Completed)
- ✅ Authenticated Google Drive sync workflow
- ✅ End-to-end encrypted cloud backups
- ✅ Offline-aware sync UX (clear status + retry/backoff)
- ✅ Unified offline state detection across AI, sync, and scraping
- ✅ Guided troubleshooting for connectivity issues across features

### Phase 5 🎯 (Planned)
- 🎯 Advanced search and filtering (full-text, tags, date ranges)
- 🎯 Note templates and workflows
- 🎯 Rich media support (images, attachments, embeds)
- 🎯 Note versioning and history
- 🎯 Plugin system for custom AI models

### Recently Added Features ✅
- ✅ Web scraping integration (Reddit, Fandom, generic sites)
- ✅ SearXNG web search integration
- ✅ Advanced import/export (JSON, bulk operations)
- ✅ Backup and restore functionality
- ✅ Migration wizard
- ✅ Enhanced sharing capabilities
- ✅ Statistics and analytics dashboard
- ✅ OpenRouter API integration as Ollama fallback
- ✅ Password-locked note encryption (AES-256-GCM at rest)
- ✅ Network connectivity detection and monitoring (NetworkUtils)
- ✅ Fast offline startup (<2 seconds with intelligent network detection)
- ✅ Offline-aware error messaging across all features

### Future Enhancements (Long-term Vision)
- 🔄 Advanced theming and customization
- 🔄 Mobile version (iOS/Android)
- 🔄 Collaborative features (shared notes, real-time editing)
- 🔄 Advanced AI model management (automatic model downloads, updates)
- 🔄 Custom web scraping rules and selectors
- 🔄 Browser extension for quick note capture
- 🔄 Advanced encryption options (hardware security keys, biometric auth)
- 🔄 Multi-language support and internationalization
- 🔄 Voice notes and transcription
- 🔄 OCR for handwritten notes and images

## Offline Functionality

CogNotez is designed to work seamlessly offline with intelligent network detection:

### What Works Offline
- ✅ All note-taking features (create, edit, delete, search)
- ✅ Local AI features (when using Ollama)
- ✅ Theme switching and preferences
- ✅ Data export and backup
- ✅ Password-protected notes
- ✅ Fast startup (<2 seconds)

### What Requires Internet
- ❌ Google Drive sync
- ❌ OpenRouter AI (cloud-based)
- ❌ SearXNG web search
- ❌ Web scraping features

### Network Status Indicators
The app displays real-time network status:
- **🟢 Online**: All features available
- **🔴 Offline**: Local features only, sync disabled
- **⚠️ Partial**: Some services unavailable

### Offline Performance Improvements
- **Fast Startup**: <2s when offline (vs 15-20s in older versions)
- **Smart Detection**: Instant offline detection prevents slow timeouts
- **Auto Recovery**: Automatic reconnection when network is restored
- **Clear Messaging**: Context-aware error messages for offline states
- **No Hanging**: All network operations have fast timeouts (2-3s max)

## Troubleshooting

### AI Features Not Working

1. **Check Ollama Status**:
   ```bash
   ollama list
   curl http://localhost:11434/api/tags
   ```

2. **Restart Ollama**:
   ```bash
   ollama serve
   ```

3. **Pull Models**:
   ```bash
   ollama pull gemma3:latest
   ```

4. **Offline Detection**:
   - If you see "Device is offline" messages, the app has detected no network connectivity
   - For local AI (Ollama), ensure it's running locally
   - For cloud AI (OpenRouter), ensure you have internet access
   - Check the sync status indicator in the header for real-time network status

### Application Won't Start

1. **Check Node.js version**: `node --version` (should be v16+)
2. **Reinstall dependencies**: `rm -rf node_modules && npm install`
3. **Check for errors**: `npm start` and check console output

### Performance Issues

- Ensure sufficient RAM for AI models (4GB+ recommended)
- Close unnecessary applications
- Use SSD storage for better performance

### SearXNG Integration Issues

1. **Connection Failed**:
   ```bash
   # Test SearXNG connection
   curl http://localhost:8080/search?q=test
   ```

2. **Configuration**:
   - Verify SEARXNG_URL environment variable
   - Check if SearXNG is running on the correct port
   - Ensure proper CORS configuration in SearXNG

### Web Scraping Issues

1. **Content Not Extracted**:
   - Some websites block automated requests
   - Try different user agents in scraper settings
   - Check if the website requires JavaScript

2. **Rate Limiting**:
   - Built-in delays prevent overwhelming servers
   - Increase delays in scraper configuration if needed

3. **Offline Errors**:
   - Web scraping requires internet connection
   - Error messages now clearly indicate if failure is due to network issues
   - Check network status indicator before attempting to scrape

### Google Drive Sync Issues

1. **Sync Stuck or Slow**:
   - App now checks connectivity before syncing (fails in <3 seconds if offline)
   - Manual sync button disabled when offline
   - Sync status shows "Offline" indicator when no internet detected

2. **Startup Sync Delayed**:
   - Sync initialization now skips when offline for faster startup
   - Auto-sync intelligently pauses when offline to save resources

3. **Connectivity Problems**:
   - Look for wifi-slash icon (🚫) in sync status for offline indication
   - App shows real-time notifications when connection is restored
   - All sync operations include clear error messages with recovery steps

### Import/Export Issues

1. **JSON Import Fails**:
   - Verify JSON file format and structure
   - Check for corrupted backup files
   - Ensure sufficient disk space


## Support

- **Issues**: Create an issue on GitHub
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check the specs.md file for detailed requirements

---

**CogNotez** - Taking notes into the AI era, while keeping your data private and secure.

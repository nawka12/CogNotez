# CogNotez - AI-Powered Note App

An offline-first, privacy-focused note-taking application that leverages local Large Language Models (LLMs) for intelligent features. Built with Electron and featuring web scraping, advanced import/export capabilities, and seamless AI integration.

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
- **Advanced Import/Export**: Support for Evernote, OneNote, JSON, and bulk file operations

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
   git clone <repository-url>
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

   # Pull a language model (recommended: llama2)
   ollama pull llama2

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
- **Evernote ENEX Support**: Import notes from Evernote export files
- **OneNote Compatibility**: Import content from OneNote files
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
| `Ctrl+Shift+R` | Rewrite selected text |
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

# Pull a model (recommended: llama2)
ollama pull llama2

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
- ✅ SQLite database integration

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

### Recently Added Features ✅
- ✅ Web scraping integration (Reddit, Fandom, generic sites)
- ✅ SearXNG web search integration
- ✅ Advanced import/export (Evernote, OneNote, JSON, bulk operations)
- ✅ Backup and restore functionality
- ✅ Migration wizard
- ✅ Enhanced sharing capabilities
- ✅ Statistics and analytics dashboard
- ✅ OpenRouter API integration as Ollama fallback

### Future Enhancements
- 🔄 Plugin system for custom AI models
- 🔄 Advanced theming and customization
- 🔄 Cloud sync (optional, privacy-focused)
- 🔄 Mobile version
- 🔄 Advanced search and filtering
- 🔄 Note templates and workflows
- 🔄 Collaborative features
- 🔄 Advanced AI model management
- 🔄 Custom web scraping rules

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
   ollama pull llama2
   ```

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

### Import/Export Issues

1. **JSON Import Fails**:
   - Verify JSON file format and structure
   - Check for corrupted backup files
   - Ensure sufficient disk space

2. **Evernote/OneNote Import**:
   - Verify file format compatibility
   - Check file encoding (UTF-8 recommended)
   - Large files may require more processing time

## Support

- **Issues**: Create an issue on GitHub
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check the specs.md file for detailed requirements

---

**CogNotez** - Taking notes into the AI era, while keeping your data private and secure.

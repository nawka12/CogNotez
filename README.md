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
- **Content Generation**: AI-powered content creation and brainstorming
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

### Google Drive Sync (Basic Setup)

1. Open the app and click the cloud icon (☁️) in the header.
2. Click "Import Credentials File" and select the OAuth JSON you created in Google Cloud Console.
   - In Google Cloud Console, add your email as a Test user on the OAuth consent screen.
3. Click "Connect Google Drive" and complete the Google sign‑in.
4. (Optional) Enable "End‑to‑End Encryption" and set a passphrase to encrypt your cloud backups.
5. Choose whether to enable Auto Sync and Sync on Startup.

For step‑by‑step advanced options, see the detailed guide: [Google Drive Sync Setup](GOOGLE_DRIVE_SYNC.md).

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

### Advanced Search & Filtering

CogNotez includes powerful search capabilities to find exactly what you're looking for:

#### Opening Advanced Search
- Click the filter icon (🔍) next to the search bar in the header
- Or use keyboard shortcut (coming soon)

#### Search Features
- **Full-Text Search**: Search across titles, content, and tags
- **Tag Filtering**: Filter by one or multiple tags
- **Date Range**: Find notes created or modified within specific date ranges
- **Special Filters**: 
  - Favorites only
  - Pinned notes only
  - Password-protected notes
- **Sorting Options**:
  - Last Modified (newest/oldest)
  - Created Date (newest/oldest)
  - Title (A-Z or Z-A)
  - Word Count (high to low or low to high)

#### Using Advanced Search
1. Click the filter button in the header
2. Enter your search criteria
3. Select tags (hold Ctrl/Cmd for multiple)
4. Set date range if needed
5. Enable any special filters
6. Choose sort order
7. Click "Apply Filters" to see results

### Note Templates

Speed up your workflow with ready-to-use templates:

#### Built-in Templates
1. **Blank Note** - Clean slate for free-form writing
2. **Meeting Notes** - Agenda, discussion points, action items
3. **Daily Journal** - Mood tracker, goals, gratitude
4. **Project Plan** - Objectives, milestones, timeline
5. **Book Notes** - Summary, takeaways, quotes
6. **Research Notes** - Findings, analysis, references
7. **To-Do List** - Priority-based task management
8. **Brainstorm** - Idea generation and organization
9. **Recipe** - Ingredients, instructions, notes
10. **Code Snippet** - Code documentation template

#### Using Templates
- Create a new note and select from template chooser
- Or use menu: **File → New from Template**

#### Custom Templates

**Create from Current Note:**
1. Create a note with your desired structure
2. Open template chooser
3. Click "Create Custom Template"
4. Enter template name and description
5. Choose an emoji icon
6. Template is saved for future use

**Generate with AI:**
1. Open template chooser
2. Click "Generate Template with AI"
3. Describe the template you want (e.g., "A bug report template with steps to reproduce")
4. Or choose from quick suggestions (Meeting Notes, Bug Report, Weekly Review, etc.)
5. Click "Generate" to create template with AI
6. Review the generated template in the preview
7. Click "Save as Template" to customize and save
8. AI automatically suggests name, description, and icon based on content

### Rich Media Support

Enhance your notes with images, videos, and attachments:

#### Adding Images
- **Drag & Drop**: Drag image files directly into the editor
- **Paste**: Copy and paste images from clipboard
- **URL**: Insert image from URL via context menu
- **Supported formats**: JPEG, PNG, GIF, WebP, SVG

#### Image Sizing Control
CogNotez provides flexible image sizing options:

**Automatic Sizing (Default):**
- Images automatically scale to fit the editor/preview width
- Maintains aspect ratio with `height: auto`
- Perfect for most use cases

**Manual Sizing:**
You can manually control image dimensions by using HTML img tags:

```markdown
<!-- Width only (height scales proportionally) -->
<img src="cognotez-media://fileId" alt="Alt text" width="300">

<!-- Height only (width scales proportionally) -->
<img src="cognotez-media://fileId" alt="Alt text" height="200">

<!-- Both dimensions (exact size) -->
<img src="cognotez-media://fileId" alt="Alt text" width="400" height="300">
```

**Syntax:**
- `width="N"`: Sets explicit width in pixels
- `height="N"`: Sets explicit height in pixels
- When both are specified, the image uses those exact dimensions
- When only one is specified, the other dimension scales proportionally
- Explicit dimensions override automatic sizing
- Still responsive: images won't exceed container width even with explicit dimensions

#### Embedding Videos
- **Drag & drop video files** (MP4, WebM, OGG)
- **Videos play directly in notes** with full controls
- **Size control**: Videos are inserted at 100% width by default, but you can manually adjust by editing the `width` attribute:

```html
<!-- Default (full width) -->
<video controls width="100%">
  <source src="cognotez-media://fileId" type="video/mp4">
</video>

<!-- Custom width (50% of container) -->
<video controls width="50%">
  <source src="cognotez-media://fileId" type="video/mp4">
</video>

<!-- Pixel width -->
<video controls width="400">
  <source src="cognotez-media://fileId" type="video/mp4">
</video>
```

**Tip:** After inserting a video, you can edit the `width` attribute directly in the note to resize it as needed.

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

4. **Generate Content with AI**: `Ctrl+Shift+G` or Right-click → "Generate with AI"
   - Generate new content without selecting text
   - Enter a prompt and AI creates content at cursor position
   - Perfect for brainstorming, writing assistance, or starting new notes

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
| `Ctrl+Shift+G` | Generate content with AI |
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

**General Context Menu** (right-click anywhere, no text selection needed):
- **✨ Generate with AI**: Create new content based on prompts

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

# Pull a model that supports tool calling (recommended: llama3.2:latest)
ollama pull llama3.2:latest

# Start the service
ollama serve
```

**Note:** Not all Ollama models support tool calling for SearXNG integration. If you experience issues with web search, try a different model or use OpenRouter instead.

 

## License

MIT License - see LICENSE file for details.

## v1.0 Highlights (Completed)

- Offline‑first note taking (create, edit, delete, search)
- Local AI via Ollama: summarization, Q&A, edit, generate, rewrite, key points, tags
- Streaming AI responses and multi‑model support
- Right‑click AI actions and comprehensive keyboard shortcuts
- Advanced search & filtering (full‑text, tags, date ranges, sort)
- Note templates (built‑in and custom)
- Rich media in notes (images, videos)
- Google Drive sync with optional end‑to‑end encryption
- Import/export, backup/restore, and migration tools
- Web scraping (Reddit, Fandom, generic) and optional SearXNG integration
- Statistics dashboard
- Offline‑aware UX, fast startup (<2s), clear network/error status

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

3. **Ollama Compatibility**:
   - Not all Ollama models support tool calling required for SearXNG integration
   - If web search doesn't work with Ollama, try switching to OpenRouter or use a different Ollama model
   - The app will automatically fall back to manual search if tool calling fails

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

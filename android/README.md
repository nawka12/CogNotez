# CogNotez Android

Android version of CogNotez - An AI-powered note-taking application built with Flutter.

> **⚠️ Early Work in Progress Disclaimer**
> 
> This Android version is currently in early development. Features are being actively implemented and the app may have incomplete functionality, bugs, or breaking changes. Please use with caution and report any issues you encounter.

## Features

### Core Features

#### Implemented ✅
- [x] Offline-first architecture with SQLite database
- [x] Note CRUD operations (Create, Read, Update, Delete)
- [x] Basic note editor with text input
- [x] Markdown preview mode
- [x] Tag-based organization system
- [x] Folder navigation (All Notes, Untagged, Tags)
- [x] Unified notes list with filtering across all folder types
- [x] Search functionality
- [x] Theme system (Light/Dark mode)
- [x] Data models (Note, Tag, Settings)
- [x] Database layer with SQLite
- [x] State management with Provider
- [x] Basic UI structure (Home screen, Note editor, Sidebar)
- [x] Undo/Redo functionality in note editor

#### Unimplemented ❌
- [ ] Multi-tab support for multiple notes
- [ ] Find & Replace with regex support
- [ ] Rich media support (Images, Videos)
- [ ] Drag & drop for media files
- [ ] Note templates (built-in and custom)
- [ ] AI-generated templates
- [ ] Advanced search with filters (date range, tag filtering, sorting)
- [ ] Note import/export for standalone note files
- [ ] Google Drive sync
- [ ] Google Drive sharing with permissions
- [ ] Auto-sync functionality
- [ ] Network status indicators
- [ ] Full internationalization (currently structure only)
- [ ] Language selector UI

### AI Features

#### Implemented ✅
- [x] AI service structure (Ollama/OpenRouter support)
- [x] AI service methods (summarize, askQuestion, editText, etc.)
- [x] AI settings configuration UI (in Settings screen)

#### Unimplemented ❌
- [ ] AI conversation panel
- [ ] SearXNG web search integration
- [ ] Web scraping functionality
- [ ] AI edit approval system
- [ ] Loading indicators for AI operations
- [ ] Cancel AI operations

#### Implemented (Editor Integration) ✅
- [x] AI features UI integration
- [x] Context menu / bottom sheet for AI actions
- [x] Summarize selected text
- [x] Ask AI about selection
- [x] Edit text with AI
- [x] Rewrite text with AI
- [x] Generate content with AI
- [x] Extract key points
- [x] Generate tags with AI

### Organization & Search

#### Implemented ✅
- [x] Basic search
- [x] Tag management (database layer)
- [x] Folder-based navigation
- [x] Tag count display in sidebar

#### Unimplemented ❌
- [ ] Advanced search panel
- [ ] Tag filtering in search
- [ ] Date range filtering
- [ ] Sort options (by date, title, word count)
- [ ] Filter by favorites/pinned
- [ ] Filter by password-protected
- [ ] Tag creation/editing UI
- [ ] Tag color customization

### Security & Sync

#### Implemented ✅
- [x] Encryption service (AES-256-GCM)
- [x] Password hashing utilities
 - [x] Password protection UI for notes
 - [x] Note encryption/decryption flow in editor
 - [x] JSON backup export (desktop-compatible)
 - [x] JSON backup import / restore (desktop & Android backups)

#### Unimplemented ❌
- [ ] Google Drive authentication
- [ ] Google Drive sync implementation
- [ ] Google Drive sharing
- [ ] Share link management
- [ ] Permission management (view, comment, edit)
- [ ] End-to-end encryption for sync
- [ ] Conflict resolution

### Export & Sharing

#### Implemented ✅
- [x] Export as Markdown (.md)
- [x] Export as Plain Text (.txt)
- [x] Export as PDF
- [x] Copy to clipboard (Markdown)
- [x] Copy to clipboard (Plain Text)
- [x] Share via Android share sheet

#### Unimplemented ❌
- [ ] File picker for importing standalone note files

### UI/UX Enhancements

#### Implemented ✅
- [x] Basic Material Design 3 theme
- [x] Responsive layout structure
- [x] Empty state illustrations with context-aware messages
- [x] Note list item improvements (cards, tag chips, better layout)
- [x] Swipe actions (delete, archive placeholder)
- [x] Pull to refresh
- [x] Settings screen with full configuration options
- [x] About screen
- [x] Toast notifications (via SnackBar)

#### Unimplemented ❌
- [ ] Splash screen
- [ ] Loading animations
- [ ] Keyboard shortcuts
- [ ] Context menus
- [ ] Tooltips and help text
- [ ] Error handling UI
- [ ] Bottom navigation (if needed)
- [ ] Floating action button
- [ ] App icon and branding

## Getting Started

### Prerequisites

- Flutter SDK (>=3.0.0)
- Android Studio or VS Code with Flutter extensions
- Android SDK (API 21+)

### Installation

1. Install Flutter dependencies:
```bash
flutter pub get
```

2. Run the app:
```bash
flutter run
```

### Building

Build APK:
```bash
flutter build apk
```

Build App Bundle:
```bash
flutter build appbundle
```

## Project Structure

```
lib/
  ├── main.dart                 # App entry point
  ├── models/                   # Data models
  ├── services/                 # Business logic services
  ├── database/                 # Database layer
  ├── screens/                  # UI screens
  ├── widgets/                  # Reusable widgets
  ├── utils/                    # Utilities
  └── l10n/                     # Localization files
```

## Development Status

This is a from-scratch implementation of CogNotez for Android, not a port of the Electron version.

### Current Status

The project has a solid foundation with:
- Complete data models and database structure
- Full UI framework with home screen, note editor, settings, and about screens
- Core services (database, notes, theme, AI, encryption, export)
- Android project configuration
- Unified notes list with filtering (All Notes, Untagged, Tags)
- Export and sharing capabilities
- Undo/redo functionality in editor
- Enhanced UI with swipe actions, pull-to-refresh, and improved empty states

### Recent Additions

- **Settings Screen**: Comprehensive configuration for themes, languages, AI backends, and sync options
- **Export & Sharing**: Full export support (Markdown, Plain Text, PDF) and Android share integration
- **Enhanced Editor**: Undo/redo functionality with history tracking
- **Improved Notes List**: Swipe actions, pull-to-refresh, better empty states, tag chips display
- **Unified Navigation**: Seamless filtering across All Notes, Untagged, and individual Tags

### Next Priorities

1. **Complete Core Note-Taking**
   - Enhance note editor with better markdown support
   - Implement find & replace
   - Add split view mode (Edit/Preview side-by-side)

2. **AI Integration**
   - Build AI features UI
   - Integrate AI service with context menus
   - Add AI conversation panel

3. **Security Features**
   - Implement password protection UI
   - Complete encryption integration

4. **Organization**
   - Tag management UI (create/edit tags)
   - Advanced search panel
   - Note templates

5. **Sync & Backup**
   - Google Drive integration
   - JSON backup/restore functionality

## Contributing

This is a from-scratch implementation of CogNotez for Android, not a port of the Electron version. Contributions are welcome! Please feel free to open issues or submit pull requests.

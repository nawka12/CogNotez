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
- [x] Localization with language picker (en, es, id, ja, jv; many strings still English)
- [x] Data models (Note, Tag, Settings)
- [x] Database layer with SQLite
- [x] State management with Provider
- [x] Basic UI structure (Home screen, Note editor, Sidebar)
- [x] Undo/Redo functionality in note editor
- [x] **Note Pinning** - Pin up to 3 important notes (pinned notes appear first)
- [x] **Duplicate Note** - Create copies of existing notes
- [x] **Auto-Save** - Automatic saving during editing (15s periodic + 500ms typing pause)
- [x] **Long-Press Context Menu** - Quick actions (Open, Pin/Unpin, Duplicate, Delete)
- [x] **Swipe Gestures** - Swipe left to delete, swipe right to pin/unpin
- [x] **Desktop-Compatible Backups** - Full JSON backup/restore compatible with desktop version
- [x] **Find & Replace** - With regex support and case sensitivity options

#### Implemented ✅
- [x] **Rich Media Support** - Images and videos in notes
  - [x] Image display in markdown preview
  - [x] Video player with full-screen playback
  - [x] Full-screen image viewer with zoom/pan
  - [x] Desktop-compatible media handling (cognotez-media:// URLs)
  - [x] Network image support (http/https)
  - [x] Local file URI support
  - [x] Media storage service for managing local media files
  - [x] **Media Insertion UI** - Insert images and videos directly from device

#### Unimplemented ❌
- [ ] Note import/export for standalone note files
- [ ] Network status indicators
- [ ] Complete translation coverage across all screens

### Note Templates

#### Implemented ✅
- [x] **Template Chooser** - Bottom sheet for selecting templates when creating notes
- [x] **10 Built-in Templates** - Meeting Notes, Daily Journal, Project Plan, Book Notes, Todo List, Brainstorm, Recipe, Code Snippet, Research Notes, Blank Note
- [x] **Custom Templates** - Create your own templates from scratch
- [x] **Template Management** - View, create, and delete custom templates
- [x] Auto-date substitution in templates
- [x] **AI-Generated Templates** - Generate templates using AI with custom descriptions

### AI Features

#### Implemented ✅
- [x] AI service structure (Ollama/OpenRouter support)
- [x] AI service methods (summarize, askQuestion, editText, etc.)
- [x] AI settings configuration UI (in Settings screen)
- [x] **AI Conversation Panel** - Full chat interface for conversing with AI
- [x] **AI Loading Overlay** - Animated loading screen when AI is processing

#### Unimplemented ❌
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
- [x] AI edit approval dialog (review & apply suggested edits)
- [x] Loading indicator while AI actions run

### Organization & Search

#### Implemented ✅
- [x] Basic search
- [x] Tag management (database layer)
- [x] Folder-based navigation
- [x] Tag count display in sidebar
- [x] **Advanced Search Panel** - Feature-rich search with multiple filters
- [x] Tag filtering in search
- [x] Date range filtering
- [x] Sort options (by date, title, word count)
- [x] Filter by password-protected
- [x] Filter by untagged notes
- [x] Filter by pinned

#### Implemented ✅
- [x] **Tag Management Screen** - Dedicated screen for managing all tags
- [x] **Tag Creation** - Create tags with custom names and colors
- [x] **Tag Editing** - Rename tags and change colors
- [x] **Tag Deletion** - Remove tags with confirmation and note count info
- [x] **Tag Colors** - 19 predefined color options for tag customization
- [x] Tag colors display in sidebar

### Security & Sync

#### Implemented ✅
- [x] Encryption service (AES-256-GCM)
- [x] Password hashing utilities
- [x] Password protection UI for notes
- [x] Note encryption/decryption flow in editor
- [x] JSON backup export (desktop-compatible with note previews)
- [x] JSON backup import / restore (desktop & Android backups)
- [x] **Google Drive Sync** - Full sync with Google Drive
- [x] **Google Drive Authentication** - OAuth2 sign-in flow
- [x] **Auto-Sync** - Automatic synchronization with configurable intervals
- [x] **Conflict Resolution** - Automatic merge strategy for concurrent edits
- [x] **End-to-End Encryption (E2EE)** - AES-256-GCM encryption for cloud sync
- [x] **Desktop-Compatible E2EE** - Same encryption format as desktop app
- [x] **Secure Passphrase Storage** - Passphrase stored securely using Android Keystore

#### Unimplemented ❌
- [ ] Google Drive file sharing (share individual notes)

### Rich Media Support

#### Implemented ✅
- [x] **Media Storage Service** - Local media file management
- [x] **Image Display** - Images rendered in markdown preview
- [x] **Video Playback** - Video player with full-screen mode
- [x] **Full-Screen Image Viewer** - Zoom and pan support for images
- [x] **Desktop Compatibility** - Support for cognotez-media:// URLs from desktop app
- [x] **Network Images** - Support for http/https image URLs
- [x] **Local File URIs** - Support for file:// image paths
- [x] **Media File Management** - Automatic media file storage and retrieval
- [x] **Media Insertion UI** - Add images and videos directly from device

#### Unimplemented ❌
- [ ] Audio file support in preview

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
- [x] Swipe actions (swipe left to delete, swipe right to pin/unpin)
- [x] Pull to refresh
- [x] Settings screen with full configuration options
- [x] About screen
- [x] Toast notifications (via SnackBar)
- [x] **Pin Indicator** - Visual indicator for pinned notes in list
- [x] **Context Menu** - Long-press bottom sheet with quick actions
- [x] **Google Drive Sync UI** - Connection status, manual sync, account info
- [x] **Splash Screen** - Animated loading screen with progress indicator
- [x] **Loading Animations** - Smooth animations for AI operations and app startup
- [x] **Onboarding Screen** - First-launch welcome screens with feature highlights
- [x] **Error Handling UI** - Error views, banners, and snackbars for better error feedback

#### Unimplemented ❌
- [ ] Split view (edit and preview side-by-side) - Not ideal for mobile screens
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

## Google Drive Sync Setup

To enable Google Drive synchronization, you need to configure Google Cloud credentials:

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Drive API** in APIs & Services

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type
3. Fill in the required information (app name, support email)
4. Add scopes:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/drive.metadata.readonly`
5. Add your test users (during development)

### 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client IDs**
3. Select **Android** as application type
4. Add your package name: `com.kayfahaarukku.cognotez`
5. Add your SHA-1 certificate fingerprint:
   ```bash
   # For debug builds
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   
   # For release builds, use your release keystore
   ```

### 4. Using Google Drive Sync

1. Open CogNotez app
2. Go to **Settings** → **Sync & Backup**
3. Tap **Connect** next to Google Drive
4. Sign in with your Google account
5. Grant the requested permissions
6. Your notes will now sync with Google Drive

### Sync Features

- **Manual Sync**: Tap "Sync Now" to manually trigger synchronization
- **Auto Sync**: Enable automatic synchronization with configurable intervals (5-60 minutes)
- **Conflict Resolution**: Automatic merge strategy - newer versions of notes are preferred
- **Desktop Compatibility**: Synced data is compatible with CogNotez desktop version
- **End-to-End Encryption**: Optional E2EE protection for cloud backups

### End-to-End Encryption (E2EE)

CogNotez supports optional end-to-end encryption for Google Drive sync:

1. Go to **Settings** → **Sync & Backup** → **End-to-End Encryption**
2. Enable the **E2EE** toggle
3. Enter a strong passphrase (minimum 8 characters)
4. Your data will now be encrypted before uploading to Google Drive

**Important Notes:**
- Use the same passphrase on all devices (Android and Desktop)
- The passphrase is stored securely using Android Keystore
- If you forget your passphrase, your cloud data cannot be recovered
- Encryption format: AES-256-GCM with PBKDF2-SHA256 (210000 iterations)

## Project Structure

```
lib/
  ├── main.dart                 # App entry point
  ├── models/                   # Data models
  │   ├── note.dart
  │   ├── tag.dart
  │   ├── settings.dart
  │   └── template.dart
  ├── services/                 # Business logic services
  │   ├── ai_service.dart
  │   ├── backup_service.dart
  │   ├── database_service.dart
  │   ├── encryption_service.dart
  │   ├── export_service.dart
  │   ├── google_drive_service.dart
  │   ├── media_storage_service.dart
  │   ├── notes_service.dart
  │   ├── settings_service.dart
  │   ├── template_service.dart
  │   └── theme_service.dart
  ├── database/                 # Database layer
  │   └── database_helper.dart
  ├── screens/                  # UI screens
  │   ├── about_screen.dart
  │   ├── home_screen.dart
  │   ├── note_editor_screen.dart
  │   ├── settings_screen.dart
  │   └── tag_management_screen.dart
  ├── widgets/                  # Reusable widgets
  │   ├── advanced_search_panel.dart
  │   ├── find_replace_dialog.dart
  │   ├── notes_list.dart
  │   ├── password_dialog.dart
  │   ├── sidebar.dart
  │   └── template_chooser.dart
  ├── utils/                    # Utilities
  │   ├── app_theme.dart
  │   └── date_formatter.dart
  └── l10n/                     # Localization files
      └── app_localizations.dart
```

## Development Status

This is a from-scratch implementation of CogNotez for Android, not a port of the Electron version.

### Current Status

The project has a solid foundation with:
- Complete data models and database structure
- Full UI framework with home screen, note editor, settings, and about screens
- Core services (database, notes, theme, AI, encryption, export, Google Drive sync, media storage, templates)
- Android project configuration
- Unified notes list with filtering (All Notes, Untagged, Tags)
- Export and sharing capabilities
- Undo/redo functionality in editor
- Enhanced UI with swipe actions, pull-to-refresh, and improved empty states
- Note pinning with visual indicators and sorting
- Auto-save functionality in note editor
- Google Drive synchronization
- Rich media support (images and videos)
- Note templates with custom template support
- Tag management with color customization

### Recent Additions

- **AI Conversation Panel**: Full chat interface for conversing with AI assistant
- **Splash Screen**: Beautiful animated loading screen with progress indicator
- **Onboarding**: First-launch welcome screens highlighting key features
- **Error Handling UI**: Comprehensive error views, banners, and snackbars
- **AI Loading Overlay**: Animated loading screen when AI is processing
- **Media Insertion UI**: Insert images and videos directly from device into notes
- **AI-Generated Templates**: Generate custom templates using AI
- **Rich Media Support**: Images and videos in notes with full-screen viewing, desktop-compatible media handling, and media storage service
- **Note Templates**: 10 built-in templates plus custom template support with template chooser UI
- **Tag Management UI**: Full-featured tag management with create, edit, delete, and color customization
- **End-to-End Encryption**: E2EE for Google Drive sync with desktop-compatible format
- **Secure Passphrase Storage**: Passphrase persists securely across app restarts
- **Note Preview Export**: Proper note previews generated for desktop compatibility
- **UI Auto-Refresh**: Notes list automatically refreshes after sync/import
- **Google Drive Sync**: Full synchronization with Google Drive including auto-sync
- **Note Pinning**: Pin up to 3 important notes that appear at the top of lists
- **Duplicate Notes**: Create copies of existing notes with all attributes preserved
- **Auto-Save**: Automatic saving during editing with periodic and debounced saves
- **Context Menu**: Long-press on notes for quick actions (Open, Pin, Duplicate, Delete)
- **Enhanced Swipe Actions**: Swipe left to delete, swipe right to pin/unpin
- **Desktop Backup Compatibility**: Import/export backups compatible with desktop version

### Next Priorities

1. **AI Integration**
   - Cancel AI operations

2. **Polish & UX**
   - App icon and branding
   - Complete internationalization

## Contributing

This is a from-scratch implementation of CogNotez for Android, not a port of the Electron version. Contributions are welcome! Please feel free to open issues or submit pull requests.

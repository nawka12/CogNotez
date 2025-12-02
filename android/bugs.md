Status information:
[New]: Newly discovered bug
[Broken]: Have tried to fix, but still not working
[Half-working]: Some aspect of it are fixed, but some are still broken
[Fixed]: Bugs has been squashed
[Wontfix]: Will not fix the bug.

[Fixed]: Pressing back (app button or system back button) have unexpected behavior. Pressing app back button now does nothing (previously leads to black screen) and pressing system back button exits the app. This does not happen with regular notes.
  - Root cause: In home_screen.dart, the onComplete callback was calling Navigator.pop() to return the unlocked note, but PasswordDialog already calls Navigator.pop() after onComplete. This caused a double-pop which disrupted the navigation stack for encrypted notes.
  - Fix: Changed _openNote() to capture the result in a variable instead of calling Navigator.pop in the callback, letting the dialog handle its own closing.

[Fixed]: Google Drive sync was not encrypted, risking data exposure.
  - Root cause: The Google Drive sync implementation was uploading/downloading plain JSON data without any encryption, unlike the desktop app which uses AES-256-GCM with PBKDF2 key derivation.
  - Fix: Implemented end-to-end encryption (E2EE) for Google Drive sync:
    - Added `encryptSyncData()` and `decryptSyncData()` methods to EncryptionService
    - Added `deriveSaltFromPassphrase()` for deterministic salt derivation (multi-device compatibility)
    - Updated GoogleDriveService to encrypt before upload and decrypt after download
    - Added E2EE configuration UI in settings screen (enable/disable toggle, passphrase input)
    - Added automatic detection of encrypted cloud data with passphrase prompt
    - Encryption format is desktop-compatible: AES-256-GCM with PBKDF2-SHA256 (210000 iterations)

[Fixed]: Note preview missing on desktop after sync from Android.
  - Root cause: In backup_service.dart, `toDesktopCompatibleJson()` was setting `'preview': ''` (empty string) instead of generating a preview from the note content.
  - Fix: Generate preview from first 200 characters of note content, cleaned up (markdown headers removed, whitespace normalized). Updated in BackupData.toDesktopCompatibleJson().

[Fixed]: Notes list not refreshing after Google Drive sync or backup import.
  - Root cause: Settings screen was importing data into the database but not notifying NotesService to reload, so the UI showed stale data until app restart or manual refresh.
  - Fix: Added `notesService.loadNotes()` and `notesService.loadTags()` calls after successful sync and import operations in settings_screen.dart.

[Fixed]: E2EE settings not persistent across app restarts - passphrase had to be re-entered.
  - Root cause: E2EE enabled state, salt, and passphrase were only stored in memory in GoogleDriveService.
  - Fix:
    - Added `e2eeEnabled` and `e2eeSalt` fields to AppSettings model
    - GoogleDriveService now saves/loads E2EE settings using SharedPreferences
    - **Passphrase is now stored securely using flutter_secure_storage** with EncryptedSharedPreferences on Android
    - Added `_loadE2EESettings()` and `_saveE2EESettings()` methods that handle both SharedPreferences and SecureStorage
    - User only needs to enter passphrase once - it persists across app restarts

[Fixed]: App doesn't prompt for passphrase when encountering encrypted cloud data.
  - Root cause: The EncryptionRequiredException was being thrown but passphrase wasn't being loaded from storage.
  - Fix:
    - Passphrase now loaded from flutter_secure_storage on app startup
    - Sync error still shows "Enter Passphrase" button when `needsPassphrase` is true (fallback)
    - `SyncStatus.needsPassphrase` flag properly set when encryption is enabled but passphrase is missing

[Fixed]: Markdown preview crashes when viewing notes with embedded media from desktop.
  - Root cause: Desktop app uses custom `cognotez-media://` URI scheme for embedded images/videos. The flutter_markdown package's default image builder tried to convert this to a file path, throwing `UnsupportedError: Cannot extract a file path from a cognotez-media URI`.
  - Fix: Added custom `imageBuilder` to the Markdown widget in note_editor_screen.dart that:
    - Handles `cognotez-media://` URIs by showing a placeholder with "Embedded media (desktop only)" message
    - Gracefully handles file:// and http(s):// URIs with error fallbacks
    - Shows appropriate placeholder for any unsupported URI schemes
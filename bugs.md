Status information:
[New]: Newly discovered bug
[Broken]: Have tried to fix, but still not working
[Half-working]: Some aspect of it are fixed, but some are still broken
[Fixed]: Bugs has been squashed
[Wontfix]: Will not fix the bug.

# MAJOR BUGS (Critical/Security/Data Loss)

1. [New] **RACE CONDITION - SYNC OPERATIONS**: Multiple sync operations can run concurrently (main.js:183-196, 303-312)
   - syncInProgress flag is checked but not properly locked
   - Multiple sync operations can corrupt data during merge operations
   - Risk: Data loss and corruption during Google Drive sync

2. [New] **MEMORY LEAK - EVENT LISTENERS**: Event listeners added in app.js but may not be properly removed
   - Found 275+ event listeners in app.js alone
   - No cleanup on window close/navigation
   - Risk: Memory leaks, performance degradation over time

3. [New] **DATA CORRUPTION - JSON PARSING**: JSON.parse operations without proper error handling (60+ instances)
   - In database.js:73-74, google-drive-sync.js: multiple locations
   - Risk: Application crash, data loss if corrupted JSON is encountered
   - No fallback mechanism for corrupted data

4. [New] **ENCRYPTION SECURITY ISSUE**: Weak salt derivation in encryption.js:33-40
   - `deriveSaltFromPassphrase` uses PBKDF2 with only 1 iteration
   - Salt should be cryptographically random, not derived from passphrase
   - Risk: Rainbow table attacks, reduced encryption strength

5. [New] **DATABASE CORRUPTION**: No transaction handling for database operations
   - Multiple simultaneous writes to localStorage/database
   - No rollback mechanism if operations fail partially
   - Risk: Inconsistent data state, data loss

6. [New] **FILE PATH SECURITY**: Hardcoded paths in main.js and other files
   - `path.join(__dirname, 'assets', 'icon.svg')` may not work on all OS
   - No path validation or sanitization
   - Risk: Application failure on different platforms

# MINOR BUGS (UI/UX/Performance)

8. [New] **ERROR HANDLING - MISSING TRY/CATCH**: Many async operations lack proper error boundaries
   - 31 try/catch blocks found, but many operations are unprotected
   - Risk: Unhandled promise rejections, application crashes

9. [New] **UI STATE MANAGEMENT**: Dialog and modal state not properly managed
   - FindReplaceDialog and other dialogs may leave UI in inconsistent state
   - No proper cleanup on dialog close
   - Risk: UI elements remain visible, user confusion

10. [New] **PERFORMANCE ISSUE - LARGE DATASETS**: No pagination for notes list
    - All notes loaded into memory simultaneously
    - Search operations on large datasets will be slow
    - Risk: Application slowdown with many notes

11. [New] **ACCESSIBILITY ISSUES**: Missing ARIA labels and keyboard navigation
    - Buttons and inputs lack proper accessibility attributes
    - No keyboard shortcuts for all functions
    - Risk: Inaccessible to users with disabilities

12. [New] **THEME FLASH**: Potential flash of unstyled content (FOUC)
    - Theme applied via JavaScript in index.html:9-12
    - CSS may not load immediately
    - Risk: Poor user experience, visual flashing

13. [New] **DEPENDENCY CONFLICTS**: Potential conflicts between dependencies
    - electron-updater may conflict with auto-updater setup
    - Multiple Google API clients loaded
    - Risk: Runtime errors, unexpected behavior

14. [New] **AUTO-SYNC TIMING**: Sync before close may timeout or fail silently
    - 30-second timeout in main.js:187 may not be sufficient
    - No user feedback if sync fails before app close
    - Risk: Data not synced, user frustration

15. [New] **IPC SECURITY**: IPC handlers in main.js lack input validation
    - No validation for file paths, data structures
    - Risk: Potential exploitation through IPC calls

16. [New] **SEARCH FUNCTIONALITY**: Global search may not handle special characters
    - No escaping of regex special characters
    - Risk: Search failures, user confusion

17. [New] **BACKUP CORRUPTION**: No integrity checking for backup files
    - Backup/restore operations don't validate data integrity
    - Risk: Corrupted backups may overwrite good data

18. [New] **AI INTEGRATION**: No error handling for AI service failures
    - AI calls may fail without user notification
    - Risk: Silent failures, poor user experience

19. [New] **OFFLINE DETECTION**: No network connectivity detection or handling
    - Application doesn't detect `navigator.onLine` or network status changes
    - Features attempt network operations when offline without graceful degradation
    - Risk: Silent failures, confusing error messages, poor offline user experience

20. [New] **AI OFFLINE FAILURES**: AI features attempt connections when offline
    - Found in ai.js: Multiple locations attempt network connections without offline checks
    - No fallback mechanisms when Ollama/OpenRouter services are unavailable
    - Risk: Confusing error messages, poor user experience when offline

21. [New] **LOCAL STORAGE ERRORS**: JSON parsing lacks proper error recovery
    - Found in database.js lines 73-74, 83-84 without try/catch blocks
    - JSON.parse operations on localStorage data can crash the application
    - Risk: Data corruption, application crashes when local data is malformed

22. [New] **SYNC OFFLINE BEHAVIOR**: Google Drive sync doesn't handle offline gracefully
    - Found in google-drive-sync.js: Multiple network-dependent operations
    - Sync operations may interfere with offline usage and app closing
    - Risk: Sync operations blocking app functionality when offline

23. [New] **IPC SECURITY OFFLINE**: IPC handlers lack input validation for local operations
    - IPC handlers in main.js lack validation for file paths and data structures
    - Risk: Potential exploitation through local IPC calls when offline
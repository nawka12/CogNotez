Status information:
[New]: Newly discovered bug
[Broken]: Have tried to fix, but still not working
[Half-working]: Some aspect of it are fixed, but some are still broken
[Fixed]: Bugs has been squashed
[Wontfix]: Will not fix the bug.

## Critical Bugs

### [Fixed] Unhandled JSON.parse in downloadData - Potential crash on corrupted data
**Location:** `src/js/google-drive-sync.js:342`
**Severity:** Critical
**Description:** `JSON.parse(jsonData)` is called without try-catch. If the downloaded JSON data is corrupted or malformed, this will throw an unhandled exception and crash the sync operation. The outer try-catch will catch it, but the error handling could be more specific.
**Impact:** Sync operation crashes when downloading corrupted data from Google Drive, potentially leaving the app in an inconsistent state.
**Fix:** Added try-catch block around JSON.parse with specific error message for invalid JSON data.

### [Fixed] Unhandled JSON.parse in downloadData return statement
**Location:** `src/js/google-drive-sync.js:376`
**Severity:** Critical
**Description:** `JSON.parse(jsonData)` is called again in the return statement without error handling. If the first parse succeeded but this second parse fails (unlikely but possible with race conditions), it will crash.
**Impact:** Potential crash when returning download result, especially if jsonData is modified or corrupted between the two parse calls.
**Fix:** Removed redundant JSON.parse call and reused the parsed data from the initial parse operation.

### [Fixed] Missing error handling for importDataFromSync result
**Location:** `main.js:1092` and `main.js:1102`
**Severity:** Critical
**Description:** After calling `importDataFromSync()`, the code doesn't check if `importResult.success` is false. If the import fails, the code continues as if it succeeded, potentially causing data inconsistency between main and renderer processes.
**Impact:** Silent data import failures can lead to data loss or inconsistency between main process database and renderer process localStorage.
**Fix:** Added error checking for importResult.success and throw errors with detailed messages when import fails.

### [Fixed] Redundant downloadData call causing unnecessary API request
**Location:** `main.js:1091`
**Severity:** High
**Description:** When `syncResult.action === 'download'`, the code calls `downloadData()` again, even though the sync operation already downloaded the data. This causes an unnecessary API call and potential race conditions.
**Impact:** Unnecessary API usage, potential rate limiting issues, and possible data inconsistency if the second download returns different data.
**Fix:** Modified sync() method to include remoteData in result, and updated IPC handler to use syncResult.remoteData instead of calling downloadData() again.

### [Fixed] Data loss risk in importDataFromSync with replace strategy
**Location:** `src/js/database.js:1030-1033`
**Severity:** Critical
**Description:** When using `mergeStrategy === 'replace'`, the code directly replaces `this.data = importData` before calling `saveToLocalStorage()`. If an error occurs between the replacement and the save (e.g., in metadata update or save operation), the original data is lost.
**Impact:** Potential data loss if an error occurs during the import process after data replacement but before persistence.
**Fix:** Added data backup before applying sync changes with rollback capability in case of errors during the import process.

### [Fixed] Race condition in sync operations
**Location:** `src/js/google-drive-sync.js:468-472` and `main.js:1021-1129`
**Severity:** High
**Description:** While `syncInProgress` flag prevents concurrent syncs within the same manager instance, there's no protection against sync being triggered from multiple IPC handlers or app lifecycle events simultaneously. The check happens after async initialization, creating a window for race conditions.
**Impact:** Multiple sync operations could run concurrently, causing data corruption, conflicts, or inconsistent state.
**Fix:** Moved syncInProgress check before async initialization in sync() method, added global sync lock (globalSyncInProgress) in main.js to prevent concurrent sync operations across IPC handlers and app lifecycle events, and added proper lock release in finally blocks.

### [Fixed] Missing null check in displayNoteTags causing crash
**Location:** `src/js/app.js:2020-2042`
**Severity:** High
**Description:** The `displayNoteTags` method tries to set `innerHTML` on `note-tags-display` element without checking if it exists first. If the element is not found in the DOM, this causes a TypeError crash.
**Impact:** App crashes with "Cannot set properties of null (setting 'innerHTML')" when loading notes if the note-tags-display element is missing from the DOM.
**Fix:** Added defensive null check for `tagsDisplay` element at the start of the function, with early return and warning log if element is not found. Also added null checks for `noteInfo` element before DOM manipulation.
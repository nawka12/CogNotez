Status information:
[New]: Newly discovered bug
[Broken]: Have tried to fix, but still not working
[Half-working]: Some aspect of it are fixed, but some are still broken
[Fixed]: Bugs has been squashed
[Wontfix]: Will not fix the bug.

## Offline Usage Bugs

### AI Functionality Offline Issues

**[Fixed] AI Manager shows generic offline messages without specific guidance**
- Location: `src/js/ai.js` lines 504-527
- Description: When AI services are offline, the app shows generic messages like "AI features are currently offline. Please ensure Ollama is running locally" but doesn't provide specific steps or troubleshooting information.
- Impact: Users don't know how to resolve offline AI issues without checking logs or documentation.
- Status: [Fixed]
- Fix: Enhanced offline messages now provide step-by-step instructions for both Ollama and OpenRouter, including installation links, command examples, and alternative backend suggestions.

**[Fixed] AI connection timeouts don't provide clear recovery instructions**
- Location: `src/js/ai.js` lines 375-405, 407-432
- Description: Connection timeout errors throw generic errors like "Connection timeout - Ollama may not be running" but don't provide specific steps to start Ollama or check its status.
- Impact: Users see technical error messages without actionable steps to resolve them.
- Status: [Fixed]
- Fix: Connection errors now include specific troubleshooting steps, detect offline vs service down states, and provide clear guidance (e.g., "Please start Ollama using 'ollama serve'").

**[Fixed] AI offline state not clearly communicated in UI**
- Location: `src/js/app.js` lines 2047-2062, 2643-2649
- Description: When AI manager is not connected, the app shows a hardcoded message about Ollama without considering the actual AI backend configuration (Ollama vs OpenRouter).
- Impact: Users get confusing messages about Ollama even when they're configured to use OpenRouter.
- Status: [Fixed]
- Fix: Error messages now detect the active backend and provide context-appropriate guidance for either Ollama or OpenRouter.

**[Fixed] SearXNG connection failures not handled gracefully offline**
- Location: `src/js/ai.js` lines 801-835, 747-810
- Description: When SearXNG is unavailable, the app shows errors about tool execution issues but doesn't provide offline fallbacks or clear messaging about web search being unavailable.
- Impact: Users experience failures without understanding that web search features require internet connectivity.
- Status: [Fixed]
- Fix: SearXNG errors now distinguish between timeout, network failure, and configuration issues with specific error messages and troubleshooting guidance.

**[Fixed] Slow startup when offline due to AI connection checks**
- Location: `src/js/ai.js` lines 335-359, 378, 414
- Description: AI connection checks with 5-10 second timeouts blocked app startup when offline.
- Impact: App took 15-20 seconds to start when offline instead of 1-2 seconds.
- Status: [Fixed]
- Fix: Added instant offline detection using navigator.onLine, reduced timeouts to 2-3 seconds, and skip connection checks entirely when offline.

### Google Drive Sync Offline Issues

**[Fixed] Sync manager doesn't provide clear offline state messaging**
- Location: `src/js/google-drive-sync.js` lines 580-610
- Description: When sync operations fail due to network issues, the app shows generic "Sync failed" messages without distinguishing between temporary network issues and permanent offline states.
- Impact: Users can't tell if they need to wait for connectivity or if there's a permanent configuration issue.
- Status: [Fixed]
- Fix: Error messages now categorize failures (offline, auth error, rate limit, server error) with specific recovery instructions.

**[Fixed] Sync status indicators don't clearly show offline state**
- Location: `src/js/app.js` lines 4571-4620
- Description: The sync status only shows "disconnected" state but doesn't provide information about why it's disconnected or when it will reconnect.
- Impact: Users don't understand the difference between being offline temporarily vs having a sync configuration problem.
- Status: [Fixed]
- Fix: Sync UI now shows dedicated "Offline" state with wifi-slash icon when no internet connection is detected.

**[Fixed] Auto-sync attempts continue indefinitely when offline**
- Location: `src/js/app.js` lines 5528-5553
- Description: The app attempts auto-sync every 5 minutes even when clearly offline, leading to repeated failures and poor user experience.
- Impact: Unnecessary error notifications and wasted system resources when offline for extended periods.
- Status: [Fixed]
- Fix: Auto-sync and manual sync now check connectivity before attempting sync, failing fast with clear error messages when offline.

**[Fixed] Startup sync attempts when offline**
- Location: `src/js/app.js` lines 639-655, 4427-4457
- Description: App attempted to sync on startup even when clearly offline, causing delays and errors.
- Impact: Slow startup and confusing error messages when launching app offline.
- Status: [Fixed]
- Fix: Added network connectivity check before startup sync and sync initialization, skipping these operations when offline.

### Web Scraping Offline Issues

**[Fixed] Web scraper doesn't handle network failures gracefully**
- Location: `src/js/scraper.js` lines 42-98, 405-442
- Description: When scraping fails due to network issues, the scraper shows generic "Failed to scrape content" messages without distinguishing network-related failures from other errors.
- Impact: Users can't tell if scraping failed due to being offline or due to other issues like site being down or blocked.
- Status: [Fixed]
- Fix: Scraper now categorizes errors (network, timeout, connection, http_error) with specific messages for each type.

**[Fixed] No offline fallback for web scraping features**
- Location: `src/js/ai.js` lines 747-810
- Description: When web scraping is unavailable due to being offline, the app shows warnings about limited features but doesn't provide alternative functionality or clear messaging about requiring internet.
- Impact: Users don't understand that web scraping features specifically require internet connectivity.
- Status: [Fixed]
- Fix: Web search and scraping failures now clearly indicate when internet is required and provide appropriate error messages.

### General Offline UX Issues

**[Fixed] Error messages don't provide offline-specific guidance**
- Location: `src/js/app.js` lines 2084-2091, 2521-2523, 2643-2649
- Description: Connection-related errors show generic messages like "Please check your connection" without specific steps for different types of connections (AI, sync, web scraping).
- Impact: Users get unhelpful error messages that don't guide them toward resolving the specific offline issue.
- Status: [Fixed]
- Fix: All error messages now provide context-aware guidance based on the feature and backend in use.

**[Fixed] No offline state detection for different features**
- Location: `src/js/network-utils.js` (new file)
- Description: The app doesn't have a unified system to detect and communicate different types of offline states (AI offline, sync offline, web features offline).
- Impact: Users experience confusing partial functionality without understanding which features work offline and which don't.
- Status: [Fixed]
- Fix: Created NetworkUtils module with fast connectivity checks, real-time online/offline event listeners, and caching to avoid redundant checks. App now shows immediate visual feedback when going online/offline.

## Template Management Bugs

**[Fixed] Create custom template button doesn't work due to Electron prompt() restriction**
- Location: `src/js/templates.js` lines 424-439 (old code)
- Description: The "Create Custom Template" button failed with error "prompt() is and will not be supported" because Electron's renderer process doesn't support browser's prompt(), confirm(), and alert() functions for security reasons.
- Impact: Users couldn't create custom templates at all - button appeared to do nothing or threw errors in console.
- Status: [Fixed]
- Fix: Replaced all prompt() and confirm() calls with custom modal dialogs. Created `showTemplateCreatorDialog()` method with proper form inputs for template name, description, and icon. Also created confirmation dialog for template deletion. Added field validation and better UX with warning when creating template from empty note.

**[Fixed] AI template generation fails with "sendMessage is not a function" error**
- Location: `src/js/templates.js` line 580
- Description: The AI template generation feature called `this.app.aiManager.sendMessage(prompt)` but the correct method name is `processWithAI(prompt)`.
- Impact: "Generate Template with AI" button failed with TypeError and couldn't generate templates.
- Status: [Fixed]
- Fix: Changed the method call from `sendMessage` to `processWithAI`. Also improved error handling with more specific error messages and better AI connection validation.

**[Fixed] Poor text contrast in AI template dialog for dark mode**
- Location: `src/js/templates.js` lines 537-564, 464-498, 692-699, 825-831
- Description: Template suggestion buttons, modal headers, and text elements had poor contrast in dark mode, making text hard to read against dark backgrounds.
- Impact: Users couldn't properly see template suggestion buttons and dialog text in dark mode.
- Status: [Fixed]
- Fix: Added explicit `color: var(--text-primary)` and `color: var(--text-secondary)` styling to all text elements, buttons, and modal headers. Improved modal backgrounds using theme variables. Enhanced hover states for better visual feedback.


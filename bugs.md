Status information:
[New]: Newly discovered bug
[Broken]: Have tried to fix, but still not working
[Half-working]: Some aspect of it are fixed, but some are still broken
[Fixed]: Bugs has been squashed
[Wontfix]: Will not fix the bug.

## Offline Usage Bugs

### AI Functionality Offline Issues

**[New] AI Manager shows generic offline messages without specific guidance**
- Location: `src/js/ai.js` lines 498-506
- Description: When AI services are offline, the app shows generic messages like "AI features are currently offline. Please ensure Ollama is running locally" but doesn't provide specific steps or troubleshooting information.
- Impact: Users don't know how to resolve offline AI issues without checking logs or documentation.
- Status: [New]

**[New] AI connection timeouts don't provide clear recovery instructions**
- Location: `src/js/ai.js` lines 386, 422
- Description: Connection timeout errors throw generic errors like "Connection timeout - Ollama may not be running" but don't provide specific steps to start Ollama or check its status.
- Impact: Users see technical error messages without actionable steps to resolve them.
- Status: [New]

**[New] AI offline state not clearly communicated in UI**
- Location: `src/js/app.js` line 1768
- Description: When AI manager is not connected, the app shows a hardcoded message about Ollama without considering the actual AI backend configuration (Ollama vs OpenRouter).
- Impact: Users get confusing messages about Ollama even when they're configured to use OpenRouter.
- Status: [New]

**[New] SearXNG connection failures not handled gracefully offline**
- Location: `src/js/ai.js` lines 804, 1943
- Description: When SearXNG is unavailable, the app shows errors about tool execution issues but doesn't provide offline fallbacks or clear messaging about web search being unavailable.
- Impact: Users experience failures without understanding that web search features require internet connectivity.
- Status: [New]

### Google Drive Sync Offline Issues

**[New] Sync manager doesn't provide clear offline state messaging**
- Location: `src/js/google-drive-sync.js` lines 580-593
- Description: When sync operations fail due to network issues, the app shows generic "Sync failed" messages without distinguishing between temporary network issues and permanent offline states.
- Impact: Users can't tell if they need to wait for connectivity or if there's a permanent configuration issue.
- Status: [New]

**[New] Sync status indicators don't clearly show offline state**
- Location: `src/css/styles.css` lines 179, `src/js/app.js` lines 4277, 4283
- Description: The sync status only shows "disconnected" state but doesn't provide information about why it's disconnected or when it will reconnect.
- Impact: Users don't understand the difference between being offline temporarily vs having a sync configuration problem.
- Status: [New]

**[New] Auto-sync attempts continue indefinitely when offline**
- Location: `src/js/app.js` lines 4582, 5192, 5196
- Description: The app attempts auto-sync every 5 minutes even when clearly offline, leading to repeated failures and poor user experience.
- Impact: Unnecessary error notifications and wasted system resources when offline for extended periods.
- Status: [New]

### Web Scraping Offline Issues

**[New] Web scraper doesn't handle network failures gracefully**
- Location: `src/js/scraper.js` lines 69-77
- Description: When scraping fails due to network issues, the scraper shows generic "Failed to scrape content" messages without distinguishing network-related failures from other errors.
- Impact: Users can't tell if scraping failed due to being offline or due to other issues like site being down or blocked.
- Status: [New]

**[New] No offline fallback for web scraping features**
- Location: `src/js/ai.js` lines 40, 264
- Description: When web scraping is unavailable due to being offline, the app shows warnings about limited features but doesn't provide alternative functionality or clear messaging about requiring internet.
- Impact: Users don't understand that web scraping features specifically require internet connectivity.
- Status: [New]

### General Offline UX Issues

**[New] Error messages don't provide offline-specific guidance**
- Location: `src/js/app.js` lines 2227, 2340, 3301, 3714
- Description: Connection-related errors show generic messages like "Please check your connection" without specific steps for different types of connections (AI, sync, web scraping).
- Impact: Users get unhelpful error messages that don't guide them toward resolving the specific offline issue.
- Status: [New]

**[New] No offline state detection for different features**
- Location: Various files
- Description: The app doesn't have a unified system to detect and communicate different types of offline states (AI offline, sync offline, web features offline).
- Impact: Users experience confusing partial functionality without understanding which features work offline and which don't.
- Status: [New]


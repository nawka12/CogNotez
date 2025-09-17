// AI integration module
class AIManager {
    constructor(app) {
        this.app = app;
        // Backend configurations
        this.backend = 'ollama'; // 'ollama' or 'openrouter'
        this.ollamaEndpoint = 'http://localhost:11434'; // Default Ollama endpoint
        this.ollamaModel = 'llama2'; // Default Ollama model
        this.openRouterApiKey = ''; // OpenRouter API key
        this.openRouterModel = 'openai/gpt-4o-mini'; // Default OpenRouter model (better at tool calling)
        this.searxngUrl = 'http://localhost:8080'; // Default SearXNG instance URL
        this.searxngEnabled = false; // Enable SearXNG web search
        this.searxngMaxResults = 5; // Max search results from SearXNG
        this.isConnected = false;

        // Initialize web scraper
        this.webScraper = null;
        this.lastSearchResults = null; // Store last search results for fallback scraping
        this.initializeWebScraper();
    }

    /**
     * Initialize the web scraper module
     */
    async initializeWebScraper() {
        try {
            // Import WebScraper dynamically to handle both Node.js and browser contexts
            if (typeof require !== 'undefined') {
                const WebScraper = require('./scraper.js');
                this.webScraper = new WebScraper();
                console.log('[AIManager] Web scraper initialized successfully');
            } else if (typeof window !== 'undefined' && window.WebScraper) {
                this.webScraper = new window.WebScraper();
                console.log('[AIManager] Web scraper initialized (browser context)');
            } else {
                console.warn('[AIManager] Web scraper not available - some features may be limited');
                // Fallback: try to create a basic scraper using axios and cheerio directly
                await this.createFallbackScraper();
            }
        } catch (error) {
            console.warn('[AIManager] Failed to initialize web scraper:', error.message);
            // Try fallback scraper
            await this.createFallbackScraper();
        }
    }

    /**
     * Create a fallback scraper using direct imports
     */
    async createFallbackScraper() {
        try {
            // Try to import axios and cheerio directly
            const axios = require('axios');
            const cheerio = require('cheerio');

            // Create user agent function outside the object to avoid this binding issues
            const getRandomUserAgent = () => {
                const userAgents = [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.47',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0'
                ];
                return userAgents[Math.floor(Math.random() * userAgents.length)];
            };

            this.webScraper = {
                scrapeUrl: async (url, options = {}) => {
                    try {
                        console.log(`🌐 [FALLBACK SCRAPER] Scraping URL: ${url}`);

                        const response = await axios.get(url, {
                            headers: {
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                                'Accept-Language': 'en-US,en;q=0.5'
                            },
                            timeout: 15000
                        });

                        const $ = cheerio.load(response.data);

                        // Remove unwanted elements
                        $('nav, header, footer, script, style, iframe').remove();

                        // Extract title
                        const title = $('title').text().trim() || 'No title found';

                        // Extract main content - try multiple strategies
                        let content = '';

                        // Strategy 1: Look for lyrics-specific containers (common on Genius)
                        const lyricsSelectors = [
                            '.lyrics', '.lyric-text', '.song-lyrics',
                            '[data-lyrics-container="true"]', '.Lyrics__Container',
                            '.SongPage__Lyrics-sc-1q3g3qh-1', // Genius specific
                            '.lyrics-container'
                        ];

                        for (const selector of lyricsSelectors) {
                            const element = $(selector);
                            if (element.length && element.text().trim().length > 200) {
                                content = element.text().trim();
                                console.log(`🌐 [FALLBACK SCRAPER] Found lyrics content using selector: ${selector}`);
                                break;
                            }
                        }

                        // Strategy 2: General content containers
                        if (!content || content.length < 200) {
                            const contentSelectors = [
                                'main', 'article', '[role="main"]',
                                '.content', '#content', '.main', '#main',
                                '.post', '.article', '.entry-content',
                                '.post-content', '.page-content'
                            ];

                            for (const selector of contentSelectors) {
                                const element = $(selector);
                                if (element.length) {
                                    const text = element.text().trim();
                                    if (text.length > content.length && text.length > 200) {
                                        content = text;
                                        console.log(`🌐 [FALLBACK SCRAPER] Found content using selector: ${selector}`);
                                    }
                                }
                            }
                        }

                        // Strategy 3: Body text as fallback
                        if (!content || content.length < 200) {
                            content = $('body').text().trim();
                            console.log(`🌐 [FALLBACK SCRAPER] Using body text as fallback`);
                        }

                        // Clean up the content
                        content = content
                            .replace(/\s+/g, ' ')
                            .replace(/\n\s*\n/g, '\n\n')
                            .trim();

                        return {
                            url,
                            content: content || 'No content extracted',
                            title: title,
                            success: true
                        };
                    } catch (error) {
                        console.error(`❌ [FALLBACK SCRAPER] Failed:`, error.message);
                        return {
                            url,
                            content: `Failed to scrape: ${error.message}`,
                            title: 'Scraping Error',
                            success: false
                        };
                    }
                }
            };

            console.log('[AIManager] Fallback web scraper created successfully');
        } catch (error) {
            console.error('[AIManager] Failed to create fallback scraper:', error.message);
            this.webScraper = null;
        }
    }

    /**
     * Attempt to scrape a URL with proper error handling
     * @param {string} url - URL to scrape
     * @param {boolean} includeComments - Whether to include comments
     * @returns {Promise<Object>} Scraping result
     */
    async attemptScrape(url, includeComments = false) {
        try {
            const scrapeResult = await this.webScraper.scrapeUrl(url, {
                includeComments,
                maxSuccessful: 1
            });

            if (scrapeResult.success && scrapeResult.content && scrapeResult.content.length > 100) {
                return scrapeResult;
            } else {
                console.log(`⚠️ [WEB SCRAPE] Scraping succeeded but content too short (${scrapeResult.content.length} chars)`);
                return {
                    url,
                    content: scrapeResult.content || 'Content too short or empty',
                    title: scrapeResult.title || 'Unknown title',
                    success: false
                };
            }
        } catch (error) {
            console.error(`❌ [WEB SCRAPE] Exception during scrape of ${url}:`, error.message);
            return {
                url,
                content: `Failed to scrape: ${error.message}`,
                title: 'Scraping Error',
                success: false
            };
        }
    }

    /**
     * Generate tools array for AI models
     * @returns {Array} Tools array or empty array if SearXNG not available
     */
    async generateToolsArray() {
        if (!this.searxngEnabled) {
            return [];
        }

        try {
            await this.checkSearxngConnection();
            console.log('[AIManager] Generating tools array with web search and scraping');

            const tools = [{
                type: 'function',
                function: {
                    name: 'web_search',
                    description: 'Search the web for current information, news, prices, weather, or any time-sensitive data that may have changed since your last training cutoff. Use this when you need up-to-date information or when the user asks about recent events.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'The search query to find relevant information'
                            },
                            max_results: {
                                type: 'number',
                                description: `Maximum number of search results to return (default: ${this.searxngMaxResults})`,
                                default: this.searxngMaxResults
                            }
                        },
                        required: ['query']
                    }
                }
            }, {
                type: 'function',
                function: {
                    name: 'scrape_webpage',
                    description: 'Extract the full content and detailed information from a specific webpage URL. Use this tool when you need to read the complete content of a webpage found through web_search, especially for articles, documentation, or detailed explanations. If scraping fails, the system will automatically try alternative URLs from the search results.',
                    parameters: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'The full URL of the webpage to scrape (must include http:// or https://)'
                            },
                            include_comments: {
                                type: 'boolean',
                                description: 'Whether to include comments/discussions if available (useful for Reddit, forums, or social media threads)',
                                default: false
                            }
                        },
                        required: ['url']
                    }
                }
            }];

            return tools;
        } catch (error) {
            console.warn('[AIManager] SearXNG not available, returning empty tools array:', error.message);
            return [];
        }
    }

    // Initialize AI connection
    async initialize() {
        console.log('[DEBUG] AI Manager: Starting initialization...');
        try {
            // Load settings from database or localStorage
            if (this.app.notesManager && this.app.notesManager.db && this.app.notesManager.db.initialized) {
                console.log('[DEBUG] AI Manager: Loading settings from database...');
                const savedBackend = await this.app.notesManager.db.getSetting('ai_backend');
                const savedOllamaEndpoint = await this.app.notesManager.db.getSetting('ollama_endpoint');
                const savedOllamaModel = await this.app.notesManager.db.getSetting('ollama_model');
                const savedOpenRouterApiKey = await this.app.notesManager.db.getSetting('openrouter_api_key');
                const savedOpenRouterModel = await this.app.notesManager.db.getSetting('openrouter_model');
                const savedSearxngUrl = await this.app.notesManager.db.getSetting('searxng_url');
                const savedSearxngEnabled = await this.app.notesManager.db.getSetting('searxng_enabled');
                const savedSearxngMaxResults = await this.app.notesManager.db.getSetting('searxng_max_results');

                if (savedBackend) this.backend = savedBackend;
                if (savedOllamaEndpoint) this.ollamaEndpoint = savedOllamaEndpoint;
                if (savedOllamaModel) this.ollamaModel = savedOllamaModel;
                if (savedOpenRouterApiKey) this.openRouterApiKey = savedOpenRouterApiKey;
                if (savedOpenRouterModel) this.openRouterModel = savedOpenRouterModel;
                if (savedSearxngUrl) this.searxngUrl = savedSearxngUrl;
                if (savedSearxngEnabled !== undefined) this.searxngEnabled = savedSearxngEnabled;
                if (savedSearxngMaxResults) this.searxngMaxResults = parseInt(savedSearxngMaxResults);
            } else {
                // Fallback to localStorage when DB is not available
                console.log('[DEBUG] AI Manager: Loading settings from localStorage...');
                const savedBackend = localStorage.getItem('ai_backend');
                const savedOllamaEndpoint = localStorage.getItem('ollama_endpoint');
                const savedOllamaModel = localStorage.getItem('ollama_model');
                const savedOpenRouterApiKey = localStorage.getItem('openrouter_api_key');
                const savedOpenRouterModel = localStorage.getItem('openrouter_model');
                const savedSearxngUrl = localStorage.getItem('searxng_url');
                const savedSearxngEnabled = localStorage.getItem('searxng_enabled');
                const savedSearxngMaxResults = localStorage.getItem('searxng_max_results');

                if (savedBackend) this.backend = savedBackend;
                if (savedOllamaEndpoint) this.ollamaEndpoint = savedOllamaEndpoint;
                if (savedOllamaModel) this.ollamaModel = savedOllamaModel;
                if (savedOpenRouterApiKey) this.openRouterApiKey = savedOpenRouterApiKey;
                if (savedOpenRouterModel) this.openRouterModel = savedOpenRouterModel;
                if (savedSearxngUrl) this.searxngUrl = savedSearxngUrl;
                if (savedSearxngEnabled !== null) this.searxngEnabled = savedSearxngEnabled === 'true';
                if (savedSearxngMaxResults) this.searxngMaxResults = parseInt(savedSearxngMaxResults);
            }

            console.log('[DEBUG] AI Manager: Checking connection...');
            await this.checkConnection();
            console.log('[DEBUG] AI Manager: Loading available models...');
            await this.loadAvailableModels();
            console.log('[DEBUG] AI Manager: AI service initialized successfully');
        } catch (error) {
            console.warn('[DEBUG] AI Manager: AI service not available:', error.message);
            this.showOfflineMessage();
        }
    }

    async checkConnection() {
        try {
            if (this.backend === 'ollama') {
                return await this.checkOllamaConnection();
            } else if (this.backend === 'openrouter') {
                return await this.checkOpenRouterConnection();
            }
            throw new Error('Unknown backend: ' + this.backend);
        } catch (error) {
            this.isConnected = false;
            throw error;
        }
    }

    async checkOllamaConnection() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

            const response = await fetch(`${this.ollamaEndpoint}/api/tags`, {
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                this.isConnected = true;
                return true;
            } else {
                throw new Error(`Ollama responded with status: ${response.status}`);
            }
        } catch (error) {
            this.isConnected = false;
            if (error.name === 'AbortError') {
                throw new Error('Connection timeout - Ollama may not be running');
            }
            throw new Error(`Cannot connect to Ollama service: ${error.message}`);
        }
    }

    async checkOpenRouterConnection() {
        if (!this.openRouterApiKey || this.openRouterApiKey.trim() === '') {
            throw new Error('OpenRouter API key is required');
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for API

            const response = await fetch('https://openrouter.ai/api/v1/models', {
                signal: controller.signal,
                headers: {
                    'Authorization': `Bearer ${this.openRouterApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                this.isConnected = true;
                return true;
            } else if (response.status === 401) {
                throw new Error('Invalid OpenRouter API key');
            } else {
                throw new Error(`OpenRouter API responded with status: ${response.status}`);
            }
        } catch (error) {
            this.isConnected = false;
            if (error.name === 'AbortError') {
                throw new Error('Connection timeout - OpenRouter API may be unavailable');
            }
            throw new Error(`Cannot connect to OpenRouter API: ${error.message}`);
        }
    }

    async loadAvailableModels() {
        if (!this.isConnected) return;

        try {
            if (this.backend === 'ollama') {
                await this.loadOllamaModels();
            } else if (this.backend === 'openrouter') {
                await this.loadOpenRouterModels();
            }
        } catch (error) {
            console.error('Failed to load available models:', error);
            this.availableModels = [];
        }
    }

    async loadOllamaModels() {
        try {
            const response = await fetch(`${this.ollamaEndpoint}/api/tags`);
            const data = await response.json();

            this.availableModels = data.models || [];
            console.log('Available Ollama models:', this.availableModels.map(m => m.name));

            // Set default model if current model is not available
            if (this.availableModels.length > 0) {
                const currentModelExists = this.availableModels.some(m => m.name === this.ollamaModel);
                if (!currentModelExists) {
                    this.ollamaModel = this.availableModels[0].name;
                    await this.saveSettings();
                }
            }
        } catch (error) {
            console.error('Failed to load available models:', error);
            this.availableModels = [];
        }
    }

    async loadOpenRouterModels() {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: {
                    'Authorization': `Bearer ${this.openRouterApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = await response.json();
            this.availableModels = data.data || [];
            console.log('Available OpenRouter models:', this.availableModels.map(m => m.id));

            // Set default model if current model is not available
            if (this.availableModels.length > 0) {
                const currentModelExists = this.availableModels.some(m => m.id === this.openRouterModel);
                if (!currentModelExists) {
                    // Prefer GPT-3.5-turbo if available, otherwise use first model
                    const gpt35 = this.availableModels.find(m => m.id === 'openai/gpt-3.5-turbo');
                    this.openRouterModel = gpt35 ? gpt35.id : this.availableModels[0].id;
                    await this.saveSettings();
                }
            }
        } catch (error) {
            console.error('Failed to load OpenRouter models:', error);
            this.availableModels = [];
        }
    }

    showOfflineMessage() {
        let message = '';
        if (this.backend === 'ollama') {
            message = '🤖 AI features are currently offline. Please ensure Ollama is running locally.';
        } else if (this.backend === 'openrouter') {
            message = '🤖 AI features are currently offline. Please check your OpenRouter API key and internet connection.';
        }
        this.app.showAIMessage(message, 'assistant');
    }

    // Settings management
    async saveSettings() {
        if (this.app.notesManager && this.app.notesManager.db && this.app.notesManager.db.initialized) {
            await this.app.notesManager.db.setSetting('ai_backend', this.backend);
            await this.app.notesManager.db.setSetting('ollama_endpoint', this.ollamaEndpoint);
            await this.app.notesManager.db.setSetting('ollama_model', this.ollamaModel);
            await this.app.notesManager.db.setSetting('openrouter_api_key', this.openRouterApiKey);
            await this.app.notesManager.db.setSetting('openrouter_model', this.openRouterModel);
            await this.app.notesManager.db.setSetting('searxng_url', this.searxngUrl);
            await this.app.notesManager.db.setSetting('searxng_enabled', this.searxngEnabled);
            await this.app.notesManager.db.setSetting('searxng_max_results', this.searxngMaxResults);
        } else {
            // Fallback to localStorage when DB is not available
            localStorage.setItem('ai_backend', this.backend);
            localStorage.setItem('ollama_endpoint', this.ollamaEndpoint);
            localStorage.setItem('ollama_model', this.ollamaModel);
            localStorage.setItem('openrouter_api_key', this.openRouterApiKey);
            localStorage.setItem('openrouter_model', this.openRouterModel);
            localStorage.setItem('searxng_url', this.searxngUrl);
            localStorage.setItem('searxng_enabled', this.searxngEnabled.toString());
            localStorage.setItem('searxng_max_results', this.searxngMaxResults.toString());
        }
    }

    // Backend switching
    async switchBackend(newBackend) {
        if (newBackend !== 'ollama' && newBackend !== 'openrouter') {
            throw new Error('Invalid backend: ' + newBackend);
        }

        this.backend = newBackend;
        await this.saveSettings();
        await this.checkConnection();
        await this.loadAvailableModels();

        // Update offline message
        this.showOfflineMessage();
    }

    // Ollama settings
    async updateOllamaEndpoint(newEndpoint) {
        this.ollamaEndpoint = newEndpoint;
        await this.saveSettings();
        if (this.backend === 'ollama') {
            await this.checkConnection();
            await this.loadAvailableModels();
        }
    }

    async updateOllamaModel(newModel) {
        this.ollamaModel = newModel;
        await this.saveSettings();
    }

    // OpenRouter settings
    async updateOpenRouterApiKey(newApiKey) {
        this.openRouterApiKey = newApiKey;
        await this.saveSettings();
        if (this.backend === 'openrouter') {
            await this.checkConnection();
            await this.loadAvailableModels();
        }
    }

    async updateOpenRouterModel(newModel) {
        this.openRouterModel = newModel;
        await this.saveSettings();
    }

    async updateSearxngUrl(url) {
        this.searxngUrl = url;
        await this.saveSettings();
    }

    async updateSearxngEnabled(enabled) {
        this.searxngEnabled = enabled;
        await this.saveSettings();
    }

    async updateSearxngMaxResults(maxResults) {
        this.searxngMaxResults = parseInt(maxResults);
        await this.saveSettings();
    }

    // Tool call execution for OpenRouter tool calling
    async executeToolCalls(toolCalls) {
        console.log(`🔧 [TOOL EXECUTION] Starting execution of ${toolCalls.length} tool call(s)`);
        console.log(`🔧 [TOOL EXECUTION] Tools requested:`, toolCalls.map(tc => tc.function?.name || 'unknown').join(', '));
        const toolResults = [];

        for (const toolCall of toolCalls) {
            try {
                let toolResult = null;

                if (toolCall.type === 'function' && toolCall.function.name === 'web_search') {
                    // Execute web search
                    // Handle both string (OpenRouter) and object (Ollama) argument formats
                    let args;
                    if (typeof toolCall.function.arguments === 'string') {
                        args = JSON.parse(toolCall.function.arguments);
                    } else {
                        args = toolCall.function.arguments;
                    }
                    const query = args.query;
                    const maxResults = args.max_results || this.searxngMaxResults || 5;

                    console.log(`🔍 [WEB SEARCH] Executing search for: "${query}" (max ${maxResults} results, max length: ${this.searxngMaxResults})`);

                    const searchResults = await this.searchWithSearxng(query, { maxResults });
                    console.log(`✅ [WEB SEARCH] Search completed - found ${searchResults.results?.length || 0} results from ${searchResults.totalResults} total`);
                    console.log(`🔗 [WEB SEARCH] Result URLs:`, searchResults.results?.map(r => r.url).join(', ') || 'none');

                    // Format results for tool response
                    toolResult = JSON.stringify({
                        query: query,
                        results: searchResults.results.map(result => ({
                            title: result.title,
                            url: result.url,
                            content: result.content.substring(0, 500), // Limit content length
                            engine: result.engine
                        })),
                        total_found: searchResults.totalResults
                    });

                } else if (toolCall.type === 'function' && toolCall.function.name === 'scrape_webpage') {
                    // Execute webpage scraping with fallback logic
                    let args;
                    if (typeof toolCall.function.arguments === 'string') {
                        args = JSON.parse(toolCall.function.arguments);
                    } else {
                        args = toolCall.function.arguments;
                    }
                    const url = args.url;
                    const includeComments = args.include_comments || false;

                    console.log(`🌐 [WEB SCRAPE] Starting scrape for: ${url} (comments: ${includeComments})`);

                    if (!this.webScraper) {
                        console.log(`❌ [WEB SCRAPE] Web scraper not available`);
                        toolResult = JSON.stringify({
                            error: 'Web scraper is not available',
                            url: url
                        });
                    } else {
                        // Try to scrape the requested URL first
                        let scrapeResult = await this.attemptScrape(url, includeComments);

                        // If scraping failed and we have search results, try alternative URLs
                        if (!scrapeResult.success && this.lastSearchResults && this.lastSearchResults.length > 0) {
                            console.log(`🔄 [WEB SCRAPE] Primary URL failed, trying alternative URLs...`);

                            // Filter out the failed URL and try up to 2 more URLs
                            const alternativeUrls = this.lastSearchResults
                                .map(result => result.url)
                                .filter(altUrl => altUrl !== url)
                                .slice(0, 2);

                            for (const altUrl of alternativeUrls) {
                                console.log(`🔄 [WEB SCRAPE] Trying alternative: ${altUrl}`);
                                const altResult = await this.attemptScrape(altUrl, includeComments);
                                if (altResult.success) {
                                    scrapeResult = altResult;
                                    console.log(`✅ [WEB SCRAPE] Alternative URL successful: ${altUrl}`);
                                    break;
                                }
                            }
                        }

                        // Format results for tool response
                        if (scrapeResult.success) {
                            console.log(`✅ [WEB SCRAPE] Final result - Success: ${scrapeResult.success}, Title: "${scrapeResult.title}", Content: ${scrapeResult.content.length} chars`);
                        } else {
                            console.log(`❌ [WEB SCRAPE] All scraping attempts failed for ${url}`);
                        }

                        toolResult = JSON.stringify({
                            url: scrapeResult.url,
                            title: scrapeResult.title,
                            content: scrapeResult.content,
                            success: scrapeResult.success,
                            content_length: scrapeResult.content.length,
                            tried_alternatives: !scrapeResult.success && this.lastSearchResults ? this.lastSearchResults.length - 1 : 0
                        });
                    }

                } else {
                    // Unknown tool
                    toolResult = JSON.stringify({
                        error: `Unknown tool: ${toolCall.function.name}`
                    });
                }

                // Create tool result message
                toolResults.push({
                    role: 'tool',
                    tool_call_id: toolCall.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    content: toolResult
                });

            } catch (error) {
                console.error('Tool execution error:', error);

                // Return error result
                toolResults.push({
                    role: 'tool',
                    tool_call_id: toolCall.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    content: JSON.stringify({
                        error: `Tool execution failed: ${error.message}`
                    })
                });
            }
        }

        return toolResults;
    }

    // SearXNG web search functionality
    async searchWithSearxng(query, options = {}) {
        if (!this.searxngEnabled) {
            throw new Error('SearXNG is not enabled');
        }

        try {
            const searchUrl = new URL('/search', this.searxngUrl);
            searchUrl.searchParams.set('q', query);
            searchUrl.searchParams.set('format', 'json');
            searchUrl.searchParams.set('categories', 'general');
            searchUrl.searchParams.set('engines', 'duckduckgo,bing,google,startpage');
            searchUrl.searchParams.set('language', 'en');
            searchUrl.searchParams.set('safesearch', '1');

            const response = await fetch(searchUrl.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'CogNotez/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`SearXNG search failed: ${response.status}`);
            }

            const data = await response.json();

            // Extract and format the most relevant results
            const results = data.results || [];
            const maxResults = options.maxResults || this.searxngMaxResults || 5;

            const formattedResults = results.slice(0, maxResults).map(result => ({
                title: result.title,
                url: result.url,
                content: result.content || result.excerpt || '',
                engine: result.engine
            }));

            // Store search results for fallback scraping
            this.lastSearchResults = formattedResults;

            return {
                query: query,
                results: formattedResults,
                totalResults: results.length
            };

        } catch (error) {
            console.error('SearXNG search error:', error);
            throw new Error(`Failed to search with SearXNG: ${error.message}`);
        }
    }

    async checkSearxngConnection() {
        try {
            const testUrl = new URL('/search', this.searxngUrl);
            testUrl.searchParams.set('q', 'test');
            testUrl.searchParams.set('format', 'json');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(testUrl.toString(), {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'CogNotez/1.0'
                }
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                return true;
            } else {
                throw new Error(`SearXNG responded with status: ${response.status}`);
            }
        } catch (error) {
            console.error('SearXNG connection check failed:', error);
            throw new Error(`Cannot connect to SearXNG: ${error.message}`);
        }
    }

    // Backward compatibility
    async updateEndpoint(newEndpoint) {
        await this.updateOllamaEndpoint(newEndpoint);
    }

    async updateModel(newModel) {
        if (this.backend === 'ollama') {
            await this.updateOllamaModel(newModel);
        } else {
            await this.updateOpenRouterModel(newModel);
        }
    }

    // Core AI processing
    async processWithAI(prompt, context = '', options = {}) {
        if (!this.isConnected) {
            throw new Error('AI service is not available');
        }

        try {
            if (this.backend === 'ollama') {
                return await this.processWithOllama(prompt, context, options);
            } else if (this.backend === 'openrouter') {
                return await this.processWithOpenRouter(prompt, context, options);
            }
            throw new Error('Unknown backend: ' + this.backend);
        } catch (error) {
            console.error('AI processing error:', error);
            throw error;
        }
    }

    async processWithOllama(prompt, context = '', options = {}) {
        const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

        const requestBody = {
            model: this.ollamaModel,
            prompt: fullPrompt,
            stream: options.stream || false,
            options: {
                temperature: options.temperature || 0.7,
                top_p: options.top_p || 0.9,
                num_predict: options.max_tokens || 4096,
                ...options.parameters
            }
        };

        const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        return result.response;
    }

    /**
     * Force the use of web search tool for specific queries
     * @param {string} prompt - The user prompt
     * @param {string} context - Additional context
     * @param {Object} options - Processing options
     * @returns {Promise<string>} - AI response
     */
    async processWithForcedWebSearch(prompt, context = '', options = {}) {
        if (!this.searxngEnabled) {
            throw new Error('SearXNG is not enabled - cannot force web search');
        }

        // Create a modified prompt that forces web search usage
        const forcedPrompt = `You have access to web search. For this query, you MUST use the web_search tool to find current information, then optionally use scrape_webpage to get detailed content from relevant URLs.

Query: ${prompt}

Remember: Use web_search first, then scrape_webpage if you need more details from specific pages.`;

        const forcedContext = context ? `${context}\n\nIMPORTANT: Use the web_search tool for current information.` : 'IMPORTANT: Use the web_search tool for current information.';

        return await this.processWithOpenRouter(forcedPrompt, forcedContext, {
            ...options,
            forceTools: true
        });
    }

    async processWithOpenRouter(prompt, context = '', options = {}) {
        const currentDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const currentTime = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        const messages = [];
        if (context) {
            // If context is provided, prepend it with date/time awareness
            messages.push({
                role: 'system',
                content: `Today is ${currentDate} and the current time is ${currentTime}. ${context}`
            });
        } else {
            // Default system message with time awareness
            messages.push({
                role: 'system',
                content: `You are a helpful AI assistant for a note-taking application with access to web search for current information. Today is ${currentDate} and the current time is ${currentTime}. Use the web_search tool when you need current information that may have changed since your last training or that depends on the current date/time.`
            });
        }
        messages.push({ role: 'user', content: prompt });

        const requestBody = {
            model: this.openRouterModel,
            messages: messages,
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || 4096,
            top_p: options.top_p || 0.9,
            ...options.parameters
        };

        // Generate and add tools if available
        const tools = await this.generateToolsArray();
        if (tools.length > 0) {
            requestBody.tools = tools;
            // Force tool usage if requested, otherwise let model decide
            requestBody.tool_choice = options.forceTools ? {
                    type: 'function',
                function: { name: 'web_search' }
            } : 'auto';

            console.log(`🛠️ [INITIAL TOOLS] ${tools.length} tools configured for request:`);
            console.log(`🛠️ [INITIAL TOOLS] Available:`, tools.map(t => t.function.name).join(', '));
            console.log(`🛠️ [INITIAL TOOLS] Mode: ${options.forceTools ? 'FORCED (web_search)' : 'AUTO (model chooses)'}`);
        } else {
            console.log(`⚠️ [INITIAL TOOLS] No tools available (SearXNG not connected or disabled)`);
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.openRouterApiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://cognotez.kayfahaarukku.com',
                'X-Title': 'CogNotez'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        const assistantMessage = result.choices[0].message;

        // Handle tool calls if present
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            console.log(`🎯 [TOOL CALL DETECTED] Model requested ${assistantMessage.tool_calls.length} tool(s)`);
            console.log(`🎯 [TOOL CALL DETECTED] Tools:`, assistantMessage.tool_calls.map(tc => {
                let args = tc.function?.arguments;
                if (typeof args === 'string') {
                    try {
                        args = JSON.parse(args);
                    } catch (e) {
                        args = {};
                    }
                }
                const paramNames = Object.keys(args || {});
                return `${tc.function?.name}(${paramNames.join(', ')})`;
            }).join(', '));

            const toolResults = await this.executeToolCalls(assistantMessage.tool_calls);

            console.log(`📤 [TOOL RESULTS] Generated ${toolResults.length} tool result(s)`);

            // Continue conversation with tool results
            messages.push(assistantMessage);
            messages.push(...toolResults);

            console.log(`💬 [CONVERSATION] Added ${toolResults.length} tool results to conversation (total messages: ${messages.length})`);

            // Make follow-up request with tools still available
            const followUpRequest = {
                model: this.openRouterModel,
                messages: messages,
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 4096,
                ...options.parameters
            };

            // Include tools in follow-up request for multi-tool usage
            if (tools && tools.length > 0) {
                followUpRequest.tools = tools;
                followUpRequest.tool_choice = 'auto';
                console.log(`🔄 [FOLLOW-UP] Including ${tools.length} tools in follow-up request:`);
                console.log(`🔄 [FOLLOW-UP] Available tools:`, tools.map(t => t.function.name).join(', '));
                console.log(`🔄 [FOLLOW-UP] Tool choice: auto (model can choose)`);
            } else {
                console.log(`⚠️ [FOLLOW-UP] No tools available for follow-up request`);
            }

            const followUpResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.openRouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://cognotez.kayfahaarukku.com',
                    'X-Title': 'CogNotez'
                },
                body: JSON.stringify(followUpRequest)
            });

            if (!followUpResponse.ok) {
                const errorText = await followUpResponse.text();
                throw new Error(`OpenRouter follow-up request failed (${followUpResponse.status}): ${errorText}`);
            }

            const followUpResult = await followUpResponse.json();
            const followUpMessage = followUpResult.choices[0].message;

            console.log(`📝 [FOLLOW-UP RESPONSE] Model response received`);
            console.log(`📝 [FOLLOW-UP RESPONSE] Has tool calls: ${!!followUpMessage.tool_calls}`);
            if (followUpMessage.tool_calls) {
                console.log(`📝 [FOLLOW-UP RESPONSE] Tool calls:`, followUpMessage.tool_calls.map(tc => tc.function?.name).join(', '));
            }
            console.log(`📝 [FOLLOW-UP RESPONSE] Content length: ${followUpMessage.content?.length || 0} chars`);

            // Check if the follow-up response has tool calls that need to be executed
            if (followUpMessage.tool_calls && followUpMessage.tool_calls.length > 0) {
                console.log(`🔄 [MULTI-TOOL] Follow-up response contains ${followUpMessage.tool_calls.length} tool call(s), executing...`);

                // Execute the follow-up tool calls
                const followUpToolResults = await this.executeToolCalls(followUpMessage.tool_calls);

                console.log(`📤 [FOLLOW-UP TOOL RESULTS] Generated ${followUpToolResults.length} tool result(s)`);

                // Continue conversation with follow-up tool results
                messages.push(followUpMessage);
                messages.push(...followUpToolResults);

                console.log(`💬 [CONVERSATION] Added follow-up tool results to conversation (total messages: ${messages.length})`);

                // Make final follow-up request
                const finalFollowUpRequest = {
                    model: this.openRouterModel,
                    messages: messages,
                    temperature: options.temperature || 0.7,
                    max_tokens: options.max_tokens || 4096,
                    ...options.parameters
                };

                console.log(`🔄 [FINAL FOLLOW-UP] Making final request without tools for final answer`);

                const finalFollowUpResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.openRouterApiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://cognotez.kayfahaarukku.com',
                        'X-Title': 'CogNotez'
                    },
                    body: JSON.stringify(finalFollowUpRequest)
                });

                if (!finalFollowUpResponse.ok) {
                    const errorText = await finalFollowUpResponse.text();
                    throw new Error(`OpenRouter final follow-up request failed (${finalFollowUpResponse.status}): ${errorText}`);
                }

                const finalFollowUpResult = await finalFollowUpResponse.json();
                const finalMessage = finalFollowUpResult.choices[0].message;

                console.log(`📝 [FINAL RESPONSE] Final answer received`);
                console.log(`📝 [FINAL RESPONSE] Content length: ${finalMessage.content?.length || 0} chars`);

                console.log(`🎉 [TOOL CALLING COMPLETE] Multi-tool conversation finished successfully`);
                console.log(`📊 [TOOL CALLING SUMMARY] Initial tools: 2, Follow-up tools: ${followUpMessage.tool_calls.length}, Total tool calls: ${2 + followUpMessage.tool_calls.length}`);

                return finalMessage.content;
            }

            console.log(`🎉 [TOOL CALLING COMPLETE] Multi-tool conversation finished successfully`);
            console.log(`📊 [TOOL CALLING SUMMARY] Initial tools: 2, Follow-up tools: ${followUpMessage.tool_calls ? followUpMessage.tool_calls.length : 0}, Total tool calls: 2`);

            return followUpMessage.content;
        }

        console.log(`📝 [DIRECT RESPONSE] Model responded without tool calls`);
        console.log(`📝 [DIRECT RESPONSE] Content length: ${assistantMessage.content?.length || 0} chars`);

        return assistantMessage.content;
    }


    // Streaming response support
    async processWithAIStreaming(prompt, context = '', onChunk, options = {}) {
        if (!this.isConnected) {
            throw new Error('AI service is not available');
        }

        try {
            if (this.backend === 'ollama') {
                return await this.processWithOllamaStreaming(prompt, context, onChunk, options);
            } else if (this.backend === 'openrouter') {
                return await this.processWithOpenRouterStreaming(prompt, context, onChunk, options);
            }
            throw new Error('Unknown backend: ' + this.backend);
        } catch (error) {
            console.error('AI streaming error:', error);
            throw error;
        }
    }

    async processWithOllamaStreaming(prompt, context = '', onChunk, options = {}) {
        const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

        const requestBody = {
            model: this.ollamaModel,
            prompt: fullPrompt,
            stream: true,
            options: {
                temperature: options.temperature || 0.7,
                top_p: options.top_p || 0.9,
                num_predict: options.max_tokens || 4096,
                ...options.parameters
            }
        };

        const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Ollama streaming request failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            buffer += chunk;

            // Process complete JSON objects from buffer
            let startIndex = 0;
            while (startIndex < buffer.length) {
                try {
                    // Find the end of the next complete JSON object
                    let braceCount = 0;
                    let inString = false;
                    let escapeNext = false;
                    let jsonEnd = -1;

                    for (let i = startIndex; i < buffer.length; i++) {
                        const char = buffer[i];

                        if (escapeNext) {
                            escapeNext = false;
                            continue;
                        }

                        if (char === '\\') {
                            escapeNext = true;
                            continue;
                        }

                        if (char === '"') {
                            inString = !inString;
                            continue;
                        }

                        if (!inString) {
                            if (char === '{') {
                                braceCount++;
                            } else if (char === '}') {
                                braceCount--;
                                if (braceCount === 0) {
                                    jsonEnd = i;
                                    break;
                                }
                            }
                        }
                    }

                    if (jsonEnd === -1) {
                        // No complete JSON object found, wait for more data
                        break;
                    }

                    const jsonStr = buffer.substring(startIndex, jsonEnd + 1);
                    const data = JSON.parse(jsonStr);

                    if (data.response) {
                        fullResponse += data.response;
                        if (onChunk) onChunk(data.response, false);
                    }
                    if (data.done) {
                        if (onChunk) onChunk('', true);
                        break;
                    }

                    startIndex = jsonEnd + 1;
                    // Skip whitespace between objects
                    while (startIndex < buffer.length && /\s/.test(buffer[startIndex])) {
                        startIndex++;
                    }
                } catch (e) {
                    // If we can't parse at this position, skip to next potential JSON start
                    const nextBrace = buffer.indexOf('{', startIndex);
                    if (nextBrace === -1) {
                        break;
                    }
                    startIndex = nextBrace;
                }
            }

            // Remove processed data from buffer
            buffer = buffer.substring(startIndex);
        }

        return fullResponse;
    }

    async processWithOpenRouterStreaming(prompt, context = '', onChunk, options = {}) {
        const messages = [];
        if (context) {
            messages.push({ role: 'system', content: context });
        }
        messages.push({ role: 'user', content: prompt });

        const requestBody = {
            model: this.openRouterModel,
            messages: messages,
            stream: true,
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || 4096,
            top_p: options.top_p || 0.9,
            ...options.parameters
        };

        // Add tools to streaming requests if available
        const tools = await this.generateToolsArray();
        if (tools.length > 0) {
            requestBody.tools = tools;
            requestBody.tool_choice = options.forceTools ? {
                type: 'function',
                function: { name: 'web_search' }
            } : 'auto';
            console.log(`[DEBUG] processWithOpenRouterStreaming: Tools added (forced: ${!!options.forceTools})`);
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.openRouterApiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://cognotez.kayfahaarukku.com',
                'X-Title': 'CogNotez'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`OpenRouter streaming request failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process Server-Sent Events format
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        if (onChunk) onChunk('', true);
                        return fullResponse;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices[0]?.delta;

                        // Handle tool calls in streaming
                        if (delta?.tool_calls) {
                            console.log('[DEBUG] processWithOpenRouterStreaming: Tool calls detected in stream');
                            // For now, we'll just log tool calls in streaming
                            // Full tool call handling would require more complex state management
                            if (onChunk) onChunk(`[Tool call detected: ${delta.tool_calls[0]?.function?.name}]`, false);
                        }

                        // Handle regular content
                        if (delta?.content) {
                            fullResponse += delta.content;
                            if (onChunk) onChunk(delta.content, false);
                        }
                    } catch (e) {
                        // Skip invalid JSON
                        console.warn('Failed to parse streaming response:', e);
                    }
                }
            }
        }

        return fullResponse;
    }

    // Get current model (for backward compatibility)
    get model() {
        return this.backend === 'ollama' ? this.ollamaModel : this.openRouterModel;
    }

    // AI Feature implementations
    async summarize(text, options = {}) {
        const prompt = `Please provide a concise and informative summary of the following text. Keep it brief but capture the key points:

${text}

Summary:`;
        return await this.processWithAI(prompt, '', {
            temperature: 0.3,
            max_tokens: 4096,
            ...options
        });
    }

    async askQuestion(question, context, options = {}) {
        // For Ollama backend, use tool calling if SearXNG is enabled, otherwise manual search
        if (this.backend === 'ollama') {
            if (this.searxngEnabled) {
                return this.askQuestionWithOllamaToolCalling(question, context, options);
            } else {
                return this.askQuestionWithManualSearch(question, context, options);
            }
        }

        // For OpenRouter backend, use tool calling if SearXNG is enabled
        return this.askQuestionWithToolCalling(question, context, options);
    }

    // Traditional approach for Ollama (manual search)
    async askQuestionWithManualSearch(question, context, options = {}) {
        let enhancedContext = context;
        let webSearchResults = null;

        // If SearXNG is enabled, perform web search and add results to context
        if (this.searxngEnabled && this.backend === 'ollama') {
            try {
                webSearchResults = await this.searchWithSearxng(question, { maxResults: this.searxngMaxResults });

                if (webSearchResults.results && webSearchResults.results.length > 0) {
                    let searchContext = '\n\nWeb Search Results:\n';
                    webSearchResults.results.forEach((result, index) => {
                        searchContext += `${index + 1}. ${result.title}\n   ${result.content}\n   Source: ${result.url}\n\n`;
                    });
                    enhancedContext += searchContext;
                }
            } catch (error) {
                console.warn('Web search failed, continuing without it:', error.message);
                // Continue without web search if it fails
            }
        }

        const prompt = `You are a helpful assistant analyzing text content. Answer the user's question based on the provided context.

Context:
${enhancedContext}

Question: ${question}

Please provide a clear, accurate answer based on the context. If the context doesn't contain enough information to fully answer the question, please say so.`;

        const answer = await this.processWithAI(prompt, '', {
            temperature: 0.7,
            max_tokens: 4096,
            ...options
        });

        // If we have web search results, append source information
        if (webSearchResults && webSearchResults.results && webSearchResults.results.length > 0) {
            let sourcesText = '\n\n**Sources:**\n';
            webSearchResults.results.forEach((result, index) => {
                sourcesText += `${index + 1}. [${result.title}](${result.url})\n`;
            });
            return answer + sourcesText;
        }

        return answer;
    }

    // Tool calling approach for OpenRouter
    async askQuestionWithToolCalling(question, context, options = {}) {
        const currentDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const currentTime = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        const messages = [
            {
                role: 'system',
                content: `You are a helpful assistant with access to web search. Today is ${currentDate} and the current time is ${currentTime}. Answer questions based on the provided context. If you need current information, recent news, prices, weather data, or any information that may have changed since your last training or that depends on the current date/time, use the web_search tool to get accurate, up-to-date data.`
            },
            {
                role: 'user',
                content: `Context:\n${context}\n\nQuestion: ${question}`
            }
        ];

        // Generate tools for OpenRouter
        const tools = await this.generateToolsArray();

        const requestBody = {
            model: this.openRouterModel,
            messages: messages,
            temperature: 0.7,
            max_tokens: 4096,
            ...options.parameters
        };

        // Add tools if available
        if (tools.length > 0) {
            requestBody.tools = tools;
            requestBody.tool_choice = 'auto'; // Let model decide when to use tools
            console.log('[DEBUG] askQuestion: Sending request with tools:', {
                model: this.openRouterModel,
                hasTools: tools.length,
                searxngEnabled: this.searxngEnabled
            });
        }

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.openRouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://cognotez.kayfahaarukku.com',
                    'X-Title': 'CogNotez'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            const assistantMessage = result.choices[0].message;

            console.log('[DEBUG] Model response:', {
                hasToolCalls: !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0),
                toolCallsCount: assistantMessage.tool_calls?.length || 0,
                contentLength: assistantMessage.content?.length || 0
            });

            // Check if the model wants to use tools
            if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                console.log('[DEBUG] Model requested tool use! Processing tool calls...');
                // Handle tool calls
                const toolResults = await this.executeToolCalls(assistantMessage.tool_calls);
                console.log('[DEBUG] Tool execution completed, sending follow-up request');

                // Continue conversation with tool results
                messages.push(assistantMessage);
                messages.push(...toolResults);

                // Make second call with tool results and tools still available
                const followUpRequest = {
                    model: this.openRouterModel,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 4096,
                    ...options.parameters
                };

                // Include tools in follow-up for multi-tool usage
                if (tools && tools.length > 0) {
                    followUpRequest.tools = tools;
                    followUpRequest.tool_choice = 'auto';
                    console.log('[DEBUG] askQuestionWithToolCalling: Tools included in follow-up request');
                }

                const followUpResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.openRouterApiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://cognotez.kayfahaarukku.com',
                        'X-Title': 'CogNotez'
                    },
                    body: JSON.stringify(followUpRequest)
                });

                if (!followUpResponse.ok) {
                    const errorText = await followUpResponse.text();
                    throw new Error(`OpenRouter follow-up request failed (${followUpResponse.status}): ${errorText}`);
                }

                const followUpResult = await followUpResponse.json();
                return followUpResult.choices[0].message.content;
            } else {
                // No tool calls, return the direct response
                return assistantMessage.content;
            }

        } catch (error) {
            console.error('AI processing error:', error);
            throw error;
        }
    }

    // Ollama-specific tool calling method using /api/chat endpoint
    async askQuestionWithOllamaToolCalling(question, context, options = {}) {
        const currentDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const currentTime = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        const messages = [
            {
                role: 'system',
                content: `You are a helpful assistant with access to web search. Today is ${currentDate} and the current time is ${currentTime}. Answer questions based on the provided context. If you need current information, recent news, prices, weather data, or any information that may have changed since your last training or that depends on the current date/time, use the web_search tool to get accurate, up-to-date data.`
            },
            {
                role: 'user',
                content: `Context:\n${context}\n\nQuestion: ${question}`
            }
        ];

        // Generate tools for Ollama
        const tools = await this.generateToolsArray();

        const requestBody = {
            model: this.ollamaModel,
            messages: messages,
            stream: false,
            options: {
                temperature: 0.7,
                ...options.parameters
            }
        };

        // Add tools if available
        if (tools.length > 0) {
            requestBody.tools = tools;
            console.log('[DEBUG] askQuestionWithOllamaToolCalling: Sending request with tools:', {
                model: this.ollamaModel,
                hasTools: tools.length,
                searxngEnabled: this.searxngEnabled
            });
        }

        try {
            const response = await fetch(`${this.ollamaEndpoint}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama chat request failed (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            const assistantMessage = result.message;

            console.log('[DEBUG] Ollama response:', {
                hasToolCalls: !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0),
                toolCallsCount: assistantMessage.tool_calls?.length || 0,
                contentLength: assistantMessage.content?.length || 0
            });

            // Check if the model wants to use tools
            if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                console.log(`🎯 [OLLAMA TOOL CALL] Model requested ${assistantMessage.tool_calls.length} tool(s)`);
            console.log(`🎯 [OLLAMA TOOL CALL] Tools:`, assistantMessage.tool_calls.map(tc => {
                let args = tc.function?.arguments;
                if (typeof args === 'string') {
                    try {
                        args = JSON.parse(args);
                    } catch (e) {
                        args = {};
                    }
                }
                const paramNames = Object.keys(args || {});
                return `${tc.function?.name}(${paramNames.join(', ')})`;
            }).join(', '));
                // Handle tool calls
                const toolResults = await this.executeToolCalls(assistantMessage.tool_calls);
                console.log(`📤 [OLLAMA TOOL RESULTS] Generated ${toolResults.length} tool result(s), sending follow-up request`);

                // Continue conversation with tool results
                messages.push(assistantMessage);
                messages.push(...toolResults);

                // Make second call with tool results and tools still available
                const followUpRequest = {
                    model: this.ollamaModel,
                    messages: messages,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        ...options.parameters
                    }
                };

                // Include tools in follow-up for multi-tool usage
                if (tools && tools.length > 0) {
                    followUpRequest.tools = tools;
                    console.log(`🔄 [OLLAMA FOLLOW-UP] Including ${tools.length} tools in follow-up request:`);
                    console.log(`🔄 [OLLAMA FOLLOW-UP] Available tools:`, tools.map(t => t.function.name).join(', '));
                } else {
                    console.log(`⚠️ [OLLAMA FOLLOW-UP] No tools available for follow-up request`);
                }

                const followUpResponse = await fetch(`${this.ollamaEndpoint}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(followUpRequest)
                });

                if (!followUpResponse.ok) {
                    const errorText = await followUpResponse.text();
                    throw new Error(`Ollama follow-up request failed (${followUpResponse.status}): ${errorText}`);
                }

                const followUpResult = await followUpResponse.json();
                const followUpMessage = followUpResult.message;

                // Check if the follow-up response has tool calls that need to be executed
                if (followUpMessage.tool_calls && followUpMessage.tool_calls.length > 0) {
                    console.log(`🔄 [OLLAMA MULTI-TOOL] Follow-up response contains ${followUpMessage.tool_calls.length} tool call(s), executing...`);

                    // Execute the follow-up tool calls
                    const followUpToolResults = await this.executeToolCalls(followUpMessage.tool_calls);

                    console.log(`📤 [OLLAMA FOLLOW-UP TOOL RESULTS] Generated ${followUpToolResults.length} tool result(s)`);

                    // Continue conversation with follow-up tool results
                    messages.push(followUpMessage);
                    messages.push(...followUpToolResults);

                    console.log(`💬 [OLLAMA CONVERSATION] Added follow-up tool results to conversation (total messages: ${messages.length})`);

                    // Make final follow-up request
                    const finalFollowUpRequest = {
                        model: this.ollamaModel,
                        messages: messages,
                        stream: false,
                        options: {
                            temperature: 0.7,
                            ...options.parameters
                        }
                    };

                    console.log(`🔄 [OLLAMA FINAL FOLLOW-UP] Making final request without tools for final answer`);

                    const finalFollowUpResponse = await fetch(`${this.ollamaEndpoint}/api/chat`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(finalFollowUpRequest)
                    });

                    if (!finalFollowUpResponse.ok) {
                        const errorText = await finalFollowUpResponse.text();
                        throw new Error(`Ollama final follow-up request failed (${finalFollowUpResponse.status}): ${errorText}`);
                    }

                    const finalFollowUpResult = await finalFollowUpResponse.json();
                    const finalMessage = finalFollowUpResult.message;

                    console.log(`📝 [OLLAMA FINAL RESPONSE] Final answer received`);
                    console.log(`📝 [OLLAMA FINAL RESPONSE] Content length: ${finalMessage.content?.length || 0} chars`);

                    console.log(`🎉 [OLLAMA TOOL CALLING COMPLETE] Multi-tool conversation finished successfully`);
                    console.log(`📊 [OLLAMA TOOL CALLING SUMMARY] Initial tools: 2, Follow-up tools: ${followUpMessage.tool_calls.length}, Total tool calls: ${2 + followUpMessage.tool_calls.length}`);

                    return finalMessage.content;
                }

                console.log(`🎉 [OLLAMA TOOL CALLING COMPLETE] Multi-tool conversation finished successfully`);
                console.log(`📊 [OLLAMA TOOL CALLING SUMMARY] Initial tools: 2, Follow-up tools: ${followUpMessage.tool_calls ? followUpMessage.tool_calls.length : 0}, Total tool calls: 2`);

                return followUpMessage.content;
            } else {
                // No tool calls, return the direct response
                return assistantMessage.content;
            }

        } catch (error) {
            console.error('Ollama tool calling error:', error);
            throw error;
        }
    }

    async editText(text, instruction, options = {}) {
        const prompt = `You are a text editing assistant. The user wants you to modify the following text according to their instruction.

Text to modify:
${text}

Instruction: ${instruction}

Provide only the modified text without any additional explanations, comments, or questions. Maintain the original formatting and structure as much as possible.`;
        return await this.processWithAI(prompt, '', {
            temperature: 0.2,
            max_tokens: Math.max(text.length * 2, 4096),
            ...options
        });
    }


    // Advanced AI features
    async rewriteText(text, style = 'professional', options = {}) {
        const stylePrompts = {
            professional: 'Rewrite this text in a professional, business-appropriate tone. Provide only the rewritten text without any additional explanations.',
            casual: 'Rewrite this text in a casual, conversational tone. Provide only the rewritten text without any additional explanations.',
            academic: 'Rewrite this text in an academic, formal tone. Provide only the rewritten text without any additional explanations.',
            simple: 'Simplify this text to make it easier to understand. Provide only the rewritten text without any additional explanations.',
            creative: 'Rewrite this text in a more creative and engaging way. Provide only one rewritten version without any options, explanations, or additional questions.'
        };

        const prompt = `${stylePrompts[style] || 'Rewrite this text'}:

${text}

Rewritten version:`;
        return await this.processWithAI(prompt, '', {
            temperature: 0.7,
            max_tokens: Math.max(text.length * 1.5, 4096),
            ...options
        });
    }

    async extractKeyPoints(text, options = {}) {
        const prompt = `Analyze the following text and extract the most important key points. Present them as a clear, numbered list:

${text}

Key Points:`;
        return await this.processWithAI(prompt, '', {
            temperature: 0.3,
            max_tokens: 4096,
            ...options
        });
    }

    async generateTags(text, options = {}) {
        const prompt = `Analyze the following text and suggest relevant tags that would help categorize and find this content. Provide 5-10 tags as a comma-separated list:

${text}

Suggested tags:`;
        return await this.processWithAI(prompt, '', {
            temperature: 0.5,
            max_tokens: 4096,
            ...options
        });
    }

    // Conversation management
    async saveConversation(noteId, userMessage, aiResponse, context = '', actionType = 'general') {
        if (this.app.notesManager && this.app.notesManager.db && this.app.notesManager.db.initialized) {
            await this.app.notesManager.db.saveAIConversation({
                id: Date.now().toString(),
                noteId: noteId || (this.app.currentNote ? this.app.currentNote.id : null),
                userMessage,
                aiResponse,
                context,
                actionType
            });
        }
    }

    // Integration with app
    async handleSummarize(text) {
        try {
            // Ensure AI panel is visible
            if (!this.app.aiPanelVisible) {
                this.app.toggleAIPanel();
            }
            this.app.showLoading();
            const summary = await this.summarize(text);
            this.app.showAIMessage(`${summary}`, 'assistant');
        } catch (error) {
            if (!this.app.aiPanelVisible) {
                this.app.toggleAIPanel();
            }
            this.app.showAIMessage('❌ Failed to generate summary. Please check your AI connection.', 'assistant');
        } finally {
            this.app.hideLoading();
        }
    }

    async handleAskAI(question, context) {
        try {
            // Ensure AI panel is visible
            if (!this.app.aiPanelVisible) {
                this.app.toggleAIPanel();
            }
            this.app.showLoading();
            const answer = await this.askQuestion(question, context);
            this.app.showAIMessage(`${answer}`, 'assistant');
        } catch (error) {
            if (!this.app.aiPanelVisible) {
                this.app.toggleAIPanel();
            }
            this.app.showAIMessage('❌ Failed to get AI response. Please check your AI connection.', 'assistant');
        } finally {
            this.app.hideLoading();
        }
    }

    async handleEditText(text, instruction) {
        let toolExecutionSuccessful = true;
        let editedResult = null;

        try {
            // Ensure AI panel is visible
            if (!this.app.aiPanelVisible) {
                this.app.toggleAIPanel();
            }
            this.app.showLoading();
            
            console.log('[DEBUG] AI handleEditText: Starting with text:', text.substring(0, 50) + '...');
            console.log('[DEBUG] AI handleEditText: Instruction:', instruction);
            
            editedResult = await this.editText(text, instruction);

            // Check if the result indicates tool failure
            if (editedResult && (
                editedResult.includes('Failed to scrape') ||
                editedResult.includes('Web scraper not available') ||
                editedResult.includes('Tool execution failed') ||
                editedResult.includes('All scraping attempts failed') ||
                editedResult.length < 10 // Too short to be meaningful
            )) {
                toolExecutionSuccessful = false;
                console.log('[DEBUG] AI handleEditText: Tool execution appears to have failed - will not edit note');
            } else {
                console.log('[DEBUG] AI handleEditText: Tool execution appears successful');
            }

            // Only proceed with text replacement if tools were successful
            if (toolExecutionSuccessful && editedResult) {
                console.log('[DEBUG] AI handleEditText: Got edited result:', editedResult.substring(0, 50) + '...');
            
            // Call replaceSelection on the app instance
            if (this.app && typeof this.app.replaceSelection === 'function') {
                    this.app.replaceSelection(editedResult);
                console.log('[DEBUG] AI handleEditText: replaceSelection called successfully');
                this.app.showAIMessage('✅ Text edited successfully!', 'assistant');
            } else {
                console.error('[DEBUG] AI handleEditText: app.replaceSelection is not available');
                throw new Error('replaceSelection method not available');
                }
            } else {
                console.log('[DEBUG] AI handleEditText: Skipping text replacement due to tool failure');
                this.app.showAIMessage('❌ Text editing cancelled due to tool execution failure. The note has not been modified. Please check your SearXNG connection and try again.', 'assistant');
            }
        } catch (error) {
            toolExecutionSuccessful = false;
            console.error('[DEBUG] AI handleEditText error:', error);
            if (!this.app.aiPanelVisible) {
                this.app.toggleAIPanel();
            }
            this.app.showAIMessage(`❌ Failed to edit text: ${error.message}. Please check your AI connection and SearXNG setup.`, 'assistant');
        } finally {
            this.app.hideLoading();
        }
    }


    // Settings and configuration
    async getAvailableModels() {
        try {
            if (this.backend === 'ollama') {
                const response = await fetch(`${this.ollamaEndpoint}/api/tags`);
                const data = await response.json();
                return data.models || [];
            } else if (this.backend === 'openrouter') {
                const response = await fetch('https://openrouter.ai/api/v1/models', {
                    headers: {
                        'Authorization': `Bearer ${this.openRouterApiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
                const data = await response.json();
                return data.data || [];
            }
            return [];
        } catch (error) {
            console.error('Failed to get available models:', error);
            return [];
        }
    }

    setModel(model) {
        if (this.backend === 'ollama') {
            this.ollamaModel = model;
        } else {
            this.openRouterModel = model;
        }
    }

    setEndpoint(endpoint) {
        this.ollamaEndpoint = endpoint;
    }

    // Fallback for when AI is not available
    getFallbackResponse(action) {
        const fallbacks = {
            summarize: 'This appears to be a summary of the selected text. AI summarization is currently offline.',
            ask: 'I would analyze this text and provide an answer to your question. AI features are currently offline.',
            edit: 'I would modify this text according to your instructions. AI features are currently offline.'
        };
        return fallbacks[action] || 'AI feature is currently unavailable.';
    }

    // Batch processing for multiple items
    async processBatch(items, action) {
        const results = [];
        for (const item of items) {
            try {
                let result;
                switch (action) {
                    case 'summarize':
                        result = await this.summarize(item);
                        break;
                    case 'edit':
                        result = await this.editText(item.text, item.instruction);
                        break;
                }
                results.push(result);
            } catch (error) {
                results.push(this.getFallbackResponse(action));
            }
        }
        return results;
    }

    // Real-time AI suggestions (future enhancement)
    async getSuggestions(text, cursorPosition) {
        // This could provide real-time suggestions as user types
        // Implementation would depend on specific use case
        return [];
    }
}

// Export for use in main app
window.AIManager = AIManager;


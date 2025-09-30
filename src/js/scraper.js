const axios = require('axios');
const cheerio = require('cheerio');

/**
 * WebScraper class for scraping content from web pages
 * Integrated with CogNotez for enhanced web search capabilities
 */
class WebScraper {
    constructor() {
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.47',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'
        ];
    }

    /**
     * Rotates through multiple user agents to avoid detection
     * @returns {string} A random user agent string
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * Delay execution for a specified time
     * @param {number} ms - The number of milliseconds to delay
     * @returns {Promise} - A promise that resolves after the delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Scrapes content from a URL and extracts main content
     * @param {string} url - The URL to scrape
     * @param {Object} options - Scraping options
     * @returns {Promise<Object>} - A promise that resolves to an object with url, content, and title
     */
    async scrapeUrl(url, options = {}) {
        try {
            console.log(`[WebScraper] Scraping URL: ${url}`);

            // Handle invalid URLs gracefully
            if (!url || !url.startsWith('http')) {
                return {
                    url,
                    content: 'Invalid URL format - URL must start with http:// or https://',
                    title: 'Invalid URL',
                    success: false,
                    errorType: 'invalid_url'
                };
            }

            // Check if it's Reddit
            if (url.includes('reddit.com')) {
                return await this.scrapeReddit(url, options);
            }

            // Check if it's Fandom
            if (url.includes('fandom.com') || url.includes('wikia.com') || url.includes('wiki')) {
                return await this.scrapeFandom(url, options);
            }

            // Default scraping method
            return await this.scrapeGeneric(url, options);
        } catch (error) {
            console.error(`[WebScraper] Error scraping ${url}:`, error.message);
            
            // Determine error type for better messaging
            let errorType = 'unknown';
            let errorMessage = error.message;
            
            if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
                errorType = 'network';
                errorMessage = 'No internet connection or DNS resolution failed. Check your network connection.';
            } else if (error.code === 'ECONNREFUSED') {
                errorType = 'connection';
                errorMessage = 'Connection refused - the website may be down or blocking requests.';
            } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                errorType = 'timeout';
                errorMessage = 'Request timed out - the website is not responding or connection is too slow.';
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorType = 'network';
                errorMessage = 'Network error - please check your internet connection.';
            }
            
            return {
                url,
                content: `Failed to scrape content: ${errorMessage}`,
                title: 'Scraping Error',
                success: false,
                errorType: errorType
            };
        }
    }

    /**
     * Scrapes multiple URLs and returns their content
     * @param {Array<string>} urls - Array of URLs to scrape
     * @param {Object} options - Scraping options
     * @returns {Promise<Array>} - Promise resolving to array of scraped content
     */
    async scrapeMultipleUrls(urls, options = {}) {
        const MAX_SUCCESSFUL_SCRAPES = options.maxSuccessful || 3;
        const results = [];
        let successfulScrapes = 0;

        try {
            for (const url of urls) {
                if (successfulScrapes >= MAX_SUCCESSFUL_SCRAPES) {
                    break;
                }

                try {
                    console.log(`[WebScraper] Attempting to scrape URL ${successfulScrapes+1}/${MAX_SUCCESSFUL_SCRAPES}: ${url}`);
                    const result = await this.scrapeUrl(url, options);
                    results.push(result);

                    if (result.success && result.content.length > 100) {
                        successfulScrapes++;
                        console.log(`[WebScraper] Successfully scraped ${url}`);
                    } else {
                        console.log(`[WebScraper] Failed to get useful content from ${url}`);
                    }

                    // Add delay between requests
                    const randomDelay = 1000 + Math.floor(Math.random() * 2000);
                    await this.delay(randomDelay);
                } catch (error) {
                    console.error(`[WebScraper] Error scraping ${url}:`, error);
                    results.push({
                        url,
                        content: `Failed to scrape content: ${error.message || 'Unknown error'}`,
                        title: 'Scraping Error',
                        success: false
                    });
                }
            }

            console.log(`[WebScraper] Completed scraping with ${successfulScrapes}/${results.length} successful URLs`);
            return results;
        } catch (error) {
            console.error('[WebScraper] Error in batch scraping:', error);
            return results;
        }
    }

    /**
     * Specialized method to scrape Reddit using JSON API
     * @param {string} url - The Reddit URL to scrape
     * @param {Object} options - Scraping options
     * @returns {Promise<Object>} - A promise that resolves to scraping result
     */
    async scrapeReddit(url, options = {}) {
        try {
            console.log(`[WebScraper] Scraping Reddit URL: ${url}`);

            const jsonUrl = url.endsWith('.json') ? url : `${url}.json`;

            const response = await axios.get(jsonUrl, {
                headers: {
                    'User-Agent': this.getRandomUserAgent(),
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://www.reddit.com/',
                    'Origin': 'https://www.reddit.com',
                    'DNT': '1',
                    'Connection': 'keep-alive'
                },
                timeout: 15000
            });

            const data = response.data;
            let title = '';
            let content = '';
            let postAuthor = '';

            if (Array.isArray(data) && data.length > 0 && data[0].data && data[0].data.children && data[0].data.children.length > 0) {
                const post = data[0].data.children[0].data;
                title = post.title || '';
                postAuthor = post.author || '';

                content = post.selftext || '';

                if (content) {
                    content = `[Post by u/${postAuthor}] ${content}\n\n`;
                } else {
                    if (post.url && !post.url.includes('reddit.com')) {
                        content = `[Link post by u/${postAuthor}] URL: ${post.url}\n\n`;
                    }
                }

                if (post.link_flair_text) {
                    content = `[Flair: ${post.link_flair_text}] ${content}`;
                }
            }

            // Extract comments if they exist
            if (Array.isArray(data) && data.length > 1 && data[1].data && data[1].data.children) {
                content += "===COMMENTS===\n\n";

                const comments = data[1].data.children;
                let commentCount = 0;

                comments.forEach((commentObj) => {
                    if (commentObj.kind !== 't1' || !commentObj.data || commentCount >= 10) return;

                    const comment = commentObj.data;
                    if (comment.body && !comment.stickied) {
                        content += `[Comment by u/${comment.author}] ${comment.body}\n\n`;
                        commentCount++;
                    }
                });
            }

            return {
                url,
                content: content || 'No content extracted from Reddit',
                title: title || 'Reddit Post',
                success: true
            };
        } catch (error) {
            console.error(`[WebScraper] Error scraping Reddit ${url}:`, error.message);
            return {
                url,
                content: `Failed to scrape Reddit content: ${error.message}`,
                title: 'Reddit Scraping Error',
                success: false
            };
        }
    }

    /**
     * Specialized method to scrape Fandom wikis
     * @param {string} url - The Fandom URL to scrape
     * @param {Object} options - Scraping options
     * @returns {Promise<Object>} - A promise that resolves to scraping result
     */
    async scrapeFandom(url, options = {}) {
        try {
            console.log(`[WebScraper] Scraping Fandom URL: ${url}`);

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive'
                },
                timeout: 15000
            });

            const $ = cheerio.load(response.data);

            const title = $('h1.page-header__title').text().trim() || $('title').text().trim();
            let content = '';

            const contentSelectors = [
                '.mw-parser-output',
                '#mw-content-text',
                '.WikiaArticle',
                '.page-content'
            ];

            for (const selector of contentSelectors) {
                const element = $(selector);
                if (element.length) {
                    element.find('.wikia-gallery, .toc, .navbox, .infobox, table, .reference, script, style').remove();

                    element.find('p, h1, h2, h3, h4, h5, h6, li').each((i, el) => {
                        const text = $(el).text().trim();
                        if (text) {
                            if (el.name.startsWith('h')) {
                                content += `\n## ${text}\n\n`;
                            } else {
                                content += `${text}\n\n`;
                            }
                        }
                    });

                    break;
                }
            }

            content = content
                .replace(/\[\d+\]/g, '')
                .replace(/\s+/g, ' ')
                .replace(/\n\s*\n/g, '\n\n')
                .trim();

            return {
                url,
                content: content || 'No content extracted from Fandom',
                title: title || 'Fandom Wiki Page',
                success: true
            };
        } catch (error) {
            console.error(`[WebScraper] Error scraping Fandom ${url}:`, error.message);
            return {
                url,
                content: `Failed to scrape Fandom content: ${error.message}`,
                title: 'Fandom Scraping Error',
                success: false
            };
        }
    }

    /**
     * Generic scraper for websites other than Reddit and Fandom
     * @param {string} url - The URL to scrape
     * @param {Object} options - Scraping options
     * @returns {Promise<Object>} - A promise that resolves to scraping result
     */
    async scrapeGeneric(url, options = {}) {
        try {
            console.log(`[WebScraper] Generic scraping for URL: ${url}`);

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'DNT': '1'
                },
                timeout: 15000,
                maxContentLength: 10 * 1024 * 1024,
                validateStatus: function (status) {
                    return status >= 200 && status < 300;
                }
            });

            const contentType = response.headers['content-type'] || '';
            if (!contentType.includes('text/html')) {
                return {
                    url,
                    content: `This is not an HTML page. Content type: ${contentType}`,
                    title: 'Non-HTML Content',
                    success: false
                };
            }

            const $ = cheerio.load(response.data);

            // Remove unwanted elements
            $('nav, header, footer, script, style, iframe, [id*="nav"], [id*="header"], [id*="footer"], [id*="menu"], [class*="nav"], [class*="header"], [class*="footer"], [class*="menu"], [class*="sidebar"], [class*="ad"], [class*="banner"]').remove();

            let mainContent = '';

            const contentSelectors = [
                'main',
                'article',
                '[role="main"]',
                '.content',
                '#content',
                '.main',
                '#main',
                '.post',
                '.article',
                '.post-content',
                '.entry-content',
                '.page-content'
            ];

            for (const selector of contentSelectors) {
                const content = $(selector).text().trim();
                if (content && content.length > 100) {
                    mainContent = content;
                    break;
                }
            }

            if (!mainContent) {
                $('p, h1, h2, h3, h4, h5, h6').each((i, el) => {
                    const text = $(el).text().trim();
                    if (text) {
                        mainContent += text + '\n\n';
                    }
                });
            }

            let cleanedContent = mainContent
                .replace(/\s+/g, ' ')
                .replace(/\n\s*\n/g, '\n\n')
                .trim();

            if (!cleanedContent || cleanedContent.length < 100) {
                cleanedContent = $('body').text()
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            return {
                url,
                content: cleanedContent || 'No content extracted',
                title: $('title').text().trim() || 'No title',
                success: true
            };
        } catch (error) {
            console.error(`[WebScraper] Error in generic scraping for ${url}:`, error.message);

            let errorMessage = 'Failed to scrape content';
            let errorType = 'unknown';
            
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                errorMessage = 'Request timed out - website not responding';
                errorType = 'timeout';
            } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
                errorMessage = 'Domain not found - check your internet connection or the URL';
                errorType = 'network';
            } else if (error.code === 'ECONNREFUSED') {
                errorMessage = 'Connection refused - website may be down or blocking requests';
                errorType = 'connection';
            } else if (error.response) {
                errorMessage = `Server responded with status ${error.response.status}`;
                errorType = 'http_error';
                if (error.response.status === 403) {
                    errorMessage += ' - Access forbidden (website may be blocking scrapers)';
                } else if (error.response.status === 404) {
                    errorMessage += ' - Page not found';
                } else if (error.response.status >= 500) {
                    errorMessage += ' - Server error';
                }
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = 'Network error - check your internet connection';
                errorType = 'network';
            }

            return {
                url,
                content: `${errorMessage}: ${error.message}`,
                title: 'Scraping Error',
                success: false,
                errorType: errorType
            };
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebScraper;
}

// Also make available globally for browser context
if (typeof window !== 'undefined') {
    window.WebScraper = WebScraper;
}

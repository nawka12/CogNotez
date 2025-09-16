const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Rotates through multiple user agents to avoid detection
 * @returns {string} A random user agent string
 */
function getRandomUserAgent() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.47',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'
    ];
    
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Specialized method to scrape Reddit using JSON API
 * @param {string} url - The Reddit URL to scrape
 * @returns {Promise<Object>} - A promise that resolves to an object with url, content, and title
 */
async function scrapeReddit(url) {
    try {
        console.log(`Scraping Reddit URL: ${url}`);
        
        // Convert Reddit URL to JSON API URL
        // Example: https://www.reddit.com/r/Hololive/comments/1c1ezb4/... -> https://www.reddit.com/r/Hololive/comments/1c1ezb4/....json
        const jsonUrl = url.endsWith('.json') ? url : `${url}.json`;
        
        // Make the request with appropriate headers
        const response = await axios.get(jsonUrl, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.reddit.com/',
                'Origin': 'https://www.reddit.com',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            },
            timeout: 15000
        });
        
        // Reddit API returns an array with post data and comments
        const data = response.data;
        
        // Extract the post title and content
        let title = '';
        let content = '';
        let postAuthor = '';
        
        if (Array.isArray(data) && data.length > 0 && data[0].data && data[0].data.children && data[0].data.children.length > 0) {
            const post = data[0].data.children[0].data;
            title = post.title || '';
            postAuthor = post.author || 'Unknown';
            
            // Content could be in selftext or body_html
            content = post.selftext || '';
            
            // If there's post content, add it
            if (content) {
                content = `[Post by u/${postAuthor}] ${content}\n\n`;
            } else {
                // Check if it's a link post
                if (post.url && !post.url.includes('reddit.com')) {
                    content = `[Link post by u/${postAuthor}] URL: ${post.url}\n\n`;
                }
            }
            
            // Include post flair if available
            if (post.link_flair_text) {
                content = `[Flair: ${post.link_flair_text}] ${content}`;
            }
        }
        
        // Extract comments if they exist
        if (Array.isArray(data) && data.length > 1 && data[1].data && data[1].data.children) {
            content += "===COMMENTS===\n\n";
            
            // Get top level comments
            const comments = data[1].data.children;
            
            comments.forEach((commentObj, index) => {
                if (commentObj.kind !== 't1' || !commentObj.data) return; // Skip non-comments
                
                const comment = commentObj.data;
                if (comment.body && !comment.stickied) { // Skip stickied comments (usually mod comments)
                    content += `[Comment by u/${comment.author}] ${comment.body}\n\n`;
                    
                    // Only include up to 10 top comments to keep size reasonable
                    if (index >= 9) return;
                }
            });
        }
        
        return {
            url,
            content: content || 'No content extracted from Reddit',
            title: title || 'Reddit Post'
        };
    } catch (error) {
        console.error(`Error scraping Reddit ${url}:`, error.message);
        return {
            url,
            content: `Failed to scrape Reddit content: ${error.message}`,
            title: 'Reddit Scraping Error'
        };
    }
}

/**
 * Specialized method to scrape Fandom wikis
 * @param {string} url - The Fandom URL to scrape
 * @returns {Promise<Object>} - A promise that resolves to an object with url, content, and title
 */
async function scrapeFandom(url) {
    try {
        console.log(`Scraping Fandom URL: ${url}`);
        
        // Make the request with appropriate headers for Fandom
        const response = await axios.get(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
                'Referer': 'https://www.google.com/'
            },
            timeout: 15000
        });
        
        // Load the HTML into cheerio
        const $ = cheerio.load(response.data);
        
        // Get the title
        const title = $('h1.page-header__title').text().trim() || $('title').text().trim();
        
        // Get the content - Fandom wikis usually have the main content in specific containers
        let content = '';
        
        // Try to find the main content by Fandom-specific selectors
        const contentSelectors = [
            '.mw-parser-output',
            '#mw-content-text',
            '.WikiaArticle',
            '.page-content'
        ];
        
        // Check each selector and use the first one that has content
        for (const selector of contentSelectors) {
            const element = $(selector);
            if (element.length) {
                // Remove unnecessary elements within the content
                element.find('.wikia-gallery, .toc, .navbox, .infobox, table, .reference, script, style, .navigation-menu').remove();
                
                // Extract text from paragraphs and headings
                content = '';
                element.find('p, h1, h2, h3, h4, h5, h6, li').each((i, el) => {
                    const text = $(el).text().trim();
                    if (text) {
                        // Add heading format for better structure
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
        
        // Clean up the content
        content = content
            .replace(/\[\d+\]/g, '') // Remove citation numbers
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();
        
        return {
            url,
            content: content || 'No content extracted from Fandom',
            title: title || 'Fandom Wiki Page'
        };
    } catch (error) {
        console.error(`Error scraping Fandom ${url}:`, error.message);
        return {
            url,
            content: `Failed to scrape Fandom content: ${error.message}`,
            title: 'Fandom Scraping Error'
        };
    }
}

/**
 * Delay execution for a specified time
 * @param {number} ms - The number of milliseconds to delay
 * @returns {Promise} - A promise that resolves after the delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scrapes content from a URL and cleans it to extract main content
 * @param {string} url - The URL to scrape
 * @returns {Promise<Object>} - A promise that resolves to an object with url, content, and title
 */
async function scrapeUrl(url) {
    try {
        console.log(`Scraping URL: ${url}`);
        
        // Handle invalid URLs gracefully
        if (!url || !url.startsWith('http')) {
            return {
                url,
                content: 'Invalid URL format',
                title: 'Invalid URL'
            };
        }
        
        // Check if it's Reddit
        if (url.includes('reddit.com')) {
            return scrapeReddit(url);
        }
        
        // Check if it's Fandom
        if (url.includes('fandom.com') || url.includes('wikia.com') || url.includes('wiki')) {
            return scrapeFandom(url);
        }
        
        // For other websites, use the general scraping method
        // Set a user agent to mimic a browser
        const response = await axios.get(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0',
                'Referer': 'https://www.google.com/',
                'DNT': '1'
            },
            timeout: 15000, // 15 second timeout
            maxContentLength: 10 * 1024 * 1024, // 10MB max content size
            validateStatus: function (status) {
                return status >= 200 && status < 300; // Only accept valid status codes
            }
        });
        
        // Check if content type is HTML
        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('text/html')) {
            return {
                url,
                content: `This is not an HTML page. Content type: ${contentType}`,
                title: 'Non-HTML Content'
            };
        }
        
        // Load the HTML into cheerio
        const $ = cheerio.load(response.data);
        
        // Remove unwanted elements that typically contain navigation, ads, etc.
        $('nav, header, footer, script, style, iframe, [id*="nav"], [id*="header"], [id*="footer"], [id*="menu"], [class*="nav"], [class*="header"], [class*="footer"], [class*="menu"], [class*="sidebar"], [class*="ad"], [class*="banner"]').remove();
        
        // Extract text from the main content areas
        let mainContent = '';
        
        // Try to find the main content by common selectors
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
        
        // Check each selector and use the first one that has content
        for (const selector of contentSelectors) {
            const content = $(selector).text().trim();
            if (content && content.length > 100) { // Only use if it has meaningful content
                mainContent = content;
                break;
            }
        }
        
        // If no content found with specific selectors, extract from body
        if (!mainContent) {
            // Extract text from paragraphs and headings
            $('p, h1, h2, h3, h4, h5, h6').each((i, el) => {
                const text = $(el).text().trim();
                if (text) {
                    mainContent += text + '\n\n';
                }
            });
        }
        
        // Clean the text
        let cleanedContent = mainContent
            .replace(/\s+/g, ' ')        // Replace multiple spaces with a single space
            .replace(/\n\s*\n/g, '\n\n') // Replace multiple newlines with double newlines
            .trim();
        
        // If still no content, use the body text as a fallback
        if (!cleanedContent || cleanedContent.length < 100) {
            cleanedContent = $('body').text()
                .replace(/\s+/g, ' ')
                .trim();
        }
        
        return {
            url,
            content: cleanedContent || 'No content extracted',
            title: $('title').text().trim() || 'No title'
        };
    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
        
        // Provide more specific error messages based on error type
        let errorMessage = 'Failed to scrape content';
        
        if (error.code === 'ECONNABORTED') {
            errorMessage = 'Request timed out';
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = 'Domain not found';
        } else if (error.response) {
            errorMessage = `Server responded with status ${error.response.status}`;
        } else if (error.request) {
            errorMessage = 'No response received from server';
        }
        
        return {
            url,
            content: `${errorMessage}: ${error.message}`,
            title: 'Scraping Error'
        };
    }
}

/**
 * Scrapes multiple URLs and returns their content
 * @param {Array<string>} urls - Array of URLs to scrape
 * @returns {Promise<Array>} - Promise resolving to array of scraped content
 */
async function scrapeMultipleUrls(urls) {
    const MAX_SUCCESSFUL_SCRAPES = 3;
    const results = [];
    let successfulScrapes = 0;
    
    try {
        // Try to scrape URLs until we have enough successful ones or run out of URLs
        for (const url of urls) {
            // If we already have enough successful scrapes, break
            if (successfulScrapes >= MAX_SUCCESSFUL_SCRAPES) {
                break;
            }
            
            try {
                console.log(`Attempting to scrape URL ${successfulScrapes+1}/${MAX_SUCCESSFUL_SCRAPES}: ${url}`);
                const result = await scrapeUrl(url);
                results.push(result);
                
                // Check if scrape was successful (no error in title and has content)
                if (!result.title.includes('Error') && result.content.length > 100 && 
                    !result.content.startsWith('Failed to scrape content')) {
                    successfulScrapes++;
                    console.log(`Successfully scraped ${url}`);
                } else {
                    console.log(`Failed to get useful content from ${url}, will try another URL`);
                }
                
                // Add a random delay between requests (1-3 seconds)
                const randomDelay = 1000 + Math.floor(Math.random() * 2000);
                await delay(randomDelay);
            } catch (error) {
                console.error(`Error scraping ${url}:`, error);
                results.push({
                    url,
                    content: `Failed to scrape content: ${error.message || 'Unknown error'}`,
                    title: 'Scraping Error'
                });
            }
        }
        
        console.log(`Completed scraping with ${successfulScrapes}/${results.length} successful URLs`);
        return results;
    } catch (error) {
        console.error('Error in batch scraping:', error);
        return results;
    }
}

/**
 * Scrape a single URL and return its content
 * @param {string} url - The URL to scrape
 * @returns {Promise<Object>} - A promise that resolves to an object with url, content, and title
 */
async function scrapeUrl(url) {
  console.log(`Scraping single URL: ${url}`);
  
  // Check if it's a Reddit URL
  if (url.includes('reddit.com')) {
    return await scrapeReddit(url);
  }
  
  // Check if it's a Fandom URL
  if (url.includes('fandom.com') || url.includes('wikia.com')) {
    return await scrapeFandom(url);
  }
  
  // Default scraper for other websites
  return await scrapeGeneric(url);
}

/**
 * Scrape multiple URLs and return their contents
 * @param {Array<string>} urls - The URLs to scrape
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of objects with url, content, and title
 */
async function scrapeMultipleUrls(urls) {
  console.log(`Scraping multiple URLs: ${urls.length} URLs`);
  
  // Process URLs concurrently with a limit of 5 concurrent requests
  const results = [];
  const batchSize = 5;
  
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchPromises = batch.map(url => scrapeUrl(url));
    
    const batchResults = await Promise.all(
      batchPromises.map(p => p.catch(err => ({ 
        url: 'unknown', 
        content: `Error: ${err.message}`, 
        title: 'Error scraping URL' 
      })))
    );
    
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Generic scraper for websites other than Reddit and Fandom
 * @param {string} url - The URL to scrape
 * @returns {Promise<Object>} - A promise that resolves to an object with url, content, and title
 */
async function scrapeGeneric(url) {
  try {
    console.log(`Generic scraping for URL: ${url}`);
    
    // Make the request with appropriate headers
    const response = await axios.get(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://www.google.com/'
      },
      timeout: 15000
    });
    
    // Load the HTML into cheerio
    const $ = cheerio.load(response.data);
    
    // Remove noisy/non-content elements
    $('script, style, nav, footer, header, aside, iframe, noscript, svg, form, input, button, [role="banner"], [role="navigation"], [role="search"], [aria-hidden="true"], .sidebar, .comments, .ad, .advertisement, .cookie, .cookie-banner, .consent, .modal, .tooltip, .toast, .banner').remove();

    // Extract the title
    const title = $('title').text().trim() || 'No title found';
    
    // Extract the main content
    // This is a heuristic approach that looks for common content containers
    const contentSelectors = [
      'article', 'main', '.content', '#content', '.article', 
      '.post', '.entry', '[role="main"]', '.main-content',
      '.article-content', '.entry-content', '.post-content'
    ];
    
    let content = '';
    
    // Try each selector to find content
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        // Extract text from the first matching element
        content = element.text().trim();
        if (content.length > 100) {  // If we found substantial content, use it
          break;
        }
      }
    }
    
    // If no content was found with selectors, grab the body text
    if (!content || content.length < 100) {
      // Remove common chrome before extracting text
      $('script, style, nav, footer, header, aside, .sidebar, .comments, .ad, .advertisement').remove();
      content = $('body').text().trim();
      
      // Clean up the content - remove extra whitespace
      content = content
        .replace(/\r/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s+\n/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // Final normalization pass
    content = content
      .replace(/\r/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+\n/g, '\n')
      .trim();
    
    return {
      url,
      content: content || 'No content extracted from page',
      title
    };
  } catch (error) {
    console.error(`Error in generic scraping for ${url}:`, error.message);
    return {
      url,
      content: `Failed to scrape content: ${error.message}`,
      title: 'Scraping Error'
    };
  }
}

// Export functions
module.exports = {
  scrapeUrl,
  scrapeMultipleUrls,
  scrapeReddit,
  scrapeFandom,
  scrapeGeneric
};
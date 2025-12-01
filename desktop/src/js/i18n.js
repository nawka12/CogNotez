// Internationalization (i18n) module for CogNotez
class I18n {
    constructor() {
        this.currentLanguage = 'en';
        this.translations = {};
        this.fallbackLanguage = 'en';
    }

    /**
     * Initialize i18n with a language code
     * @param {string} langCode - Language code (e.g., 'en', 'id')
     */
    async initialize(langCode = null) {
        // Get language from localStorage or use provided/default
        const savedLang = localStorage.getItem('language') || langCode || navigator.language.split('-')[0] || 'en';
        this.currentLanguage = savedLang;

        // Load translations
        await this.loadTranslations(this.currentLanguage);
        
        // Apply translations to the page
        this.applyTranslations();
    }

    /**
     * Load translations for a specific language
     * @param {string} langCode - Language code
     */
    async loadTranslations(langCode) {
        try {
            // Try to load the requested language
            const response = await fetch(`./locales/${langCode}.json`);
            if (response.ok) {
                this.translations = await response.json();
                this.currentLanguage = langCode;
                localStorage.setItem('language', langCode);
                return;
            }
        } catch (error) {
            console.warn(`Failed to load translations for ${langCode}:`, error);
        }

        // Fallback to English if requested language fails
        if (langCode !== this.fallbackLanguage) {
            try {
                const fallbackResponse = await fetch(`./locales/${this.fallbackLanguage}.json`);
                if (fallbackResponse.ok) {
                    this.translations = await fallbackResponse.json();
                    this.currentLanguage = this.fallbackLanguage;
                    console.warn(`Falling back to ${this.fallbackLanguage} translations`);
                }
            } catch (error) {
                console.error(`Failed to load fallback translations:`, error);
            }
        }
    }

    /**
     * Get a translated string
     * @param {string} key - Translation key (supports dot notation, e.g., 'ui.header.title')
     * @param {Object} params - Parameters to replace in the translation
     * @returns {string} Translated string
     */
    t(key, params = {}) {
        if (!key) return '';

        // Support dot notation for nested keys
        const keys = key.split('.');
        let value = this.translations;

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // Key not found, return the key itself or fallback
                console.warn(`Translation key not found: ${key}`);
                return key;
            }
        }

        // If value is not a string, return the key
        if (typeof value !== 'string') {
            console.warn(`Translation value is not a string for key: ${key}`);
            return key;
        }

        // Replace parameters in the translation
        if (Object.keys(params).length > 0) {
            return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
                return params[paramKey] !== undefined ? params[paramKey] : match;
            });
        }

        return value;
    }

    /**
     * Change the current language
     * @param {string} langCode - Language code
     */
    async setLanguage(langCode) {
        if (this.currentLanguage === langCode) return;
        
        await this.loadTranslations(langCode);
        this.applyTranslations();
        
        // Dispatch event for other modules to react to language change
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: langCode } }));
    }

    /**
     * Get current language code
     * @returns {string} Current language code
     */
    getLanguage() {
        return this.currentLanguage;
    }

    /**
     * Apply translations to elements with data-i18n attribute
     */
    applyTranslations() {
        // Translate elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);
            
            if (translation) {
                // Check if it's a placeholder, title, or text content
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    if (element.hasAttribute('data-i18n-placeholder')) {
                        element.placeholder = translation;
                    } else {
                        element.value = translation;
                    }
                } else if (element.hasAttribute('data-i18n-html')) {
                    element.innerHTML = translation;
                } else {
                    element.textContent = translation;
                }
            }
        });

        // Translate elements with data-i18n-title attribute
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = this.t(key);
            if (translation) {
                element.title = translation;
            }
        });

        // Translate elements with data-i18n-placeholder attribute
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            if (translation && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
                element.placeholder = translation;
            }
        });

        // Update HTML lang attribute
        document.documentElement.lang = this.currentLanguage;
    }

    /**
     * Translate a string and return it (for use in JavaScript)
     * This is an alias for t() for convenience
     */
    translate(key, params = {}) {
        return this.t(key, params);
    }
}

// Create global i18n instance
window.i18n = new I18n();

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18n;
}


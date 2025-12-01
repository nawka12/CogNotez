// Google Drive Authentication Module for CogNotez
// Handles OAuth2 authentication and token management for Google Drive API

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GoogleAuthManager {
    constructor() {
        this.oauth2Client = null;
        this.isAuthenticated = false;
        this.tokens = null;
        this.credentialsPath = null;
        this.tokensPath = null;

        // Google Drive API scopes
        this.scopes = [
            'https://www.googleapis.com/auth/drive.file', // Access to files created by the app (includes permission management)
            'https://www.googleapis.com/auth/drive.metadata.readonly' // Read metadata of files
        ];

        this.initialize();
    }

    async initialize() {
        try {
            // Set up paths for storing credentials and tokens
            const userDataPath = await this.getUserDataPath();
            this.credentialsPath = path.join(userDataPath, 'google-drive-credentials.json');
            this.tokensPath = path.join(userDataPath, 'google-drive-tokens.json');

            console.log('[GoogleAuth] Initialized with paths:', {
                credentials: this.credentialsPath,
                tokens: this.tokensPath
            });

            // Attempt to eagerly setup OAuth2 client and load tokens for persistence
            const setupOk = await this.setupOAuth2Client();
            if (setupOk && this.isAuthenticated) {
                console.log('[GoogleAuth] Persistent authentication detected on startup');
            }
        } catch (error) {
            console.error('[GoogleAuth] Initialization failed:', error);
        }
    }

    async getUserDataPath() {
        // Get the user data directory from Electron
        // Use different methods for main vs renderer process
        if (typeof window !== 'undefined') {
            // Renderer process - use IPC
            const { ipcRenderer } = require('electron');
            return await ipcRenderer.invoke('get-app-path');
        } else {
            // Main process - use app directly
            const { app } = require('electron');
            return app.getPath('userData');
        }
    }

    async setupOAuth2Client() {
        try {
            // Load client credentials
            const credentials = await this.loadCredentials();
            if (!credentials) {
                throw new Error('Google Drive credentials file not found. Please upload your Google Drive credentials JSON file first by clicking "Import Credentials" in the sync settings.');
            }

            // Validate credentials structure
            // Handle both direct OAuth2 format and nested "installed" format
            let clientId, clientSecret, redirectUris;

            if (credentials.installed) {
                // OAuth2 client credentials format (nested under "installed")
                clientId = credentials.installed.client_id;
                clientSecret = credentials.installed.client_secret;
                redirectUris = credentials.installed.redirect_uris;
            } else if (credentials.client_id && credentials.client_secret) {
                // Direct OAuth2 format
                clientId = credentials.client_id;
                clientSecret = credentials.client_secret;
                redirectUris = credentials.redirect_uris;
            } else {
                throw new Error('Invalid credentials file: missing client_id or client_secret. Please ensure you have downloaded OAuth2 client credentials (not service account credentials) from Google Cloud Console.');
            }

            // Check if it's a service account key instead of OAuth2 client credentials
            if (credentials.type === 'service_account') {
                throw new Error('You have uploaded service account credentials, but OAuth2 client credentials are required. Please go to Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client IDs → Web application.');
            }

            // Validate required fields
            if (!clientId || !clientSecret) {
                throw new Error('Invalid credentials file: missing client_id or client_secret. Please ensure you have downloaded OAuth2 client credentials (not service account credentials) from Google Cloud Console.');
            }

            // For OAuth2 client credentials, redirect_uris should exist
            if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
                throw new Error('Invalid credentials file: missing or empty redirect_uris. Please ensure you have downloaded OAuth2 client credentials from Google Cloud Console.');
            }

            // Create OAuth2 client
            this.oauth2Client = new google.auth.OAuth2(
                clientId,
                clientSecret,
                redirectUris[0]
            );

            // Load existing tokens if available
            await this.loadTokens();

            console.log('[GoogleAuth] OAuth2 client setup complete');
            return true;
        } catch (error) {
            console.error('[GoogleAuth] Failed to setup OAuth2 client:', error);
            return false;
        }
    }

    async loadCredentials() {
        try {
            const credentialsData = await fs.readFile(this.credentialsPath, 'utf8');
            return JSON.parse(credentialsData);
        } catch (error) {
            console.warn('[GoogleAuth] Credentials file not found or invalid');
            return null;
        }
    }

    async checkCredentialsExist() {
        try {
            await fs.access(this.credentialsPath);
            return true;
        } catch (error) {
            return false;
        }
    }

    async saveCredentials(credentials) {
        try {
            await fs.writeFile(this.credentialsPath, JSON.stringify(credentials, null, 2));
            console.log('[GoogleAuth] Credentials saved successfully');
            return true;
        } catch (error) {
            console.error('[GoogleAuth] Failed to save credentials:', error);
            return false;
        }
    }

    async loadTokens() {
        try {
            const tokensData = await fs.readFile(this.tokensPath, 'utf8');
            this.tokens = JSON.parse(tokensData);

            // Set credentials on OAuth2 client
            this.oauth2Client.setCredentials(this.tokens);
            this.isAuthenticated = true;

            console.log('[GoogleAuth] Tokens loaded and set successfully');
            return true;
        } catch (error) {
            console.warn('[GoogleAuth] Tokens file not found or invalid');
            this.isAuthenticated = false;
            return false;
        }
    }

    async saveTokens(tokens) {
        try {
            this.tokens = tokens;
            await fs.writeFile(this.tokensPath, JSON.stringify(tokens, null, 2));
            this.oauth2Client.setCredentials(tokens);
            this.isAuthenticated = true;

            console.log('[GoogleAuth] Tokens saved successfully');
            return true;
        } catch (error) {
            console.error('[GoogleAuth] Failed to save tokens:', error);
            return false;
        }
    }

    async authenticate() {
        try {
            if (!this.oauth2Client) {
                const success = await this.setupOAuth2Client();
                if (!success) {
                    throw new Error('Failed to setup OAuth2 client');
                }
            }

            // Check if we have valid tokens
            if (this.isAuthenticated && this.tokens) {
                // Verify tokens are still valid
                const isValid = await this.verifyTokens();
                if (isValid) {
                    console.log('[GoogleAuth] Using existing valid tokens');
                    return true;
                }
            }

            // Generate authentication URL
            const authUrl = this.oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: this.scopes,
                prompt: 'consent' // Force consent screen to get refresh token
            });

            console.log('[GoogleAuth] Authentication URL generated:', authUrl);

            return {
                authUrl: authUrl,
                needsAuth: true
            };
        } catch (error) {
            console.error('[GoogleAuth] Authentication failed:', error);
            throw error;
        }
    }

    async handleAuthCallback(code) {
        try {
            if (!this.oauth2Client) {
                throw new Error('OAuth2 client not initialized');
            }

            // Exchange authorization code for tokens
            const { tokens } = await this.oauth2Client.getToken(code);
            console.log('[GoogleAuth] Received tokens from authorization code');

            // Save tokens
            await this.saveTokens(tokens);

            console.log('[GoogleAuth] Authentication successful');
            return true;
        } catch (error) {
            console.error('[GoogleAuth] Failed to handle auth callback:', error);
            throw error;
        }
    }

    async verifyTokens() {
        try {
            if (!this.tokens || !this.oauth2Client) {
                return false;
            }

            // Try to make a simple API call to verify tokens
            const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

            // Test with a simple about request
            await drive.about.get({ fields: 'user' });

            console.log('[GoogleAuth] Tokens verified successfully');
            return true;
        } catch (error) {
            console.warn('[GoogleAuth] Token verification failed:', error.message);
            this.isAuthenticated = false;
            return false;
        }
    }

    async refreshTokens() {
        try {
            if (!this.oauth2Client || !this.tokens) {
                throw new Error('No tokens available to refresh');
            }

            // Force token refresh
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            await this.saveTokens(credentials);

            console.log('[GoogleAuth] Tokens refreshed successfully');
            return true;
        } catch (error) {
            console.error('[GoogleAuth] Failed to refresh tokens:', error);
            this.isAuthenticated = false;
            throw error;
        }
    }

    async disconnect() {
        try {
            // Remove stored tokens
            if (this.tokensPath) {
                try {
                    await fs.unlink(this.tokensPath);
                } catch (error) {
                    console.warn('[GoogleAuth] Could not remove tokens file:', error.message);
                }
            }

            // Reset state
            this.tokens = null;
            this.isAuthenticated = false;

            if (this.oauth2Client) {
                this.oauth2Client.setCredentials({});
            }

            console.log('[GoogleAuth] Disconnected successfully');
            return true;
        } catch (error) {
            console.error('[GoogleAuth] Failed to disconnect:', error);
            throw error;
        }
    }

    async getUserInfo() {
        try {
            if (!this.isAuthenticated || !this.oauth2Client) {
                throw new Error('Not authenticated');
            }

            const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
            const response = await drive.about.get({
                fields: 'user(displayName,emailAddress,photoLink)'
            });

            return {
                displayName: response.data.user.displayName,
                emailAddress: response.data.user.emailAddress,
                photoLink: response.data.user.photoLink
            };
        } catch (error) {
            console.error('[GoogleAuth] Failed to get user info:', error);
            return null;
        }
    }

    async getAuthStatus() {
        const status = {
            isAuthenticated: this.isAuthenticated,
            hasCredentials: !!this.tokens,
            hasCredentialsFile: false,
            userInfo: null // We'll get this separately if needed
        };

        // Check if credentials file exists
        status.hasCredentialsFile = await this.checkCredentialsExist();

        // Check if credentials exist and add error info if not
        if (!this.tokens) {
            if (!status.hasCredentialsFile) {
                status.error = 'Google Drive credentials file not found. Please upload your Google Drive credentials JSON file first by clicking "Import Credentials" in the sync settings.';
            } else {
                status.error = 'Google Drive credentials file exists but authentication is required. Please connect to Google Drive.';
            }
        }

        return status;
    }
}

// Export for use in main app
// Use window for renderer process, module.exports for main process
if (typeof window !== 'undefined') {
    window.GoogleAuthManager = GoogleAuthManager;
} else {
    module.exports = { GoogleAuthManager };
}

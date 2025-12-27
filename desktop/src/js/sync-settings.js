/**
 * Sync Settings Module
 * Handles the Google Drive sync settings dialog for CogNotez
 */

/**
 * Shows the sync settings modal dialog
 * @param {Object} app - The CogNotezApp instance
 */
function showSyncSettings(app) {
    try {
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        const content = `
            <div style="max-width: 700px;">
                <div style="margin-bottom: 24px;">
                    <h4 style="margin: 0 0 16px 0; color: var(--text-primary);"><i class="fas fa-cloud"></i> ${t('settings.sync.title', 'Google Drive Sync Settings')}</h4>
                </div>

                <div id="sync-settings-content">
                    <!-- Status Section -->
                    <div class="sync-section" style="margin-bottom: 24px;">
                        <div id="sync-status-display">
                            <div class="sync-status-card" style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                                <div class="sync-status-header" style="display: flex; align-items: center; margin-bottom: 12px;">
                                    <div class="sync-status-indicator" id="modal-sync-indicator" style="width: 12px; height: 12px; border-radius: 50%; margin-right: 8px;"></div>
                                    <span class="sync-status-text" id="modal-sync-status-text" style="font-weight: 500;">${t('settings.sync.statusLoading', 'Loading...')}</span>
                                </div>
                                <div class="sync-last-sync" id="modal-sync-last-sync" style="font-size: 0.9rem; color: var(--text-secondary);"></div>
                                <div class="sync-buttons" style="margin-top: 12px;">
                                    <button id="modal-google-drive-connect-btn" class="sync-button" style="background: var(--accent-color); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; margin-right: 8px;">${t('settings.sync.connectGoogleDrive', 'Connect Google Drive')}</button>
                                    <button id="modal-google-drive-disconnect-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; margin-right: 8px; display: none;">${t('settings.sync.disconnect', 'Disconnect')}</button>
                                    <button id="modal-google-drive-sync-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;" disabled>${t('settings.sync.syncNow', 'Sync Now')}</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Options Section -->
                    <div class="sync-section" style="margin-bottom: 24px;">
                        <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">${t('settings.sync.syncOptions', 'Sync Options')}</h5>
                        <div class="sync-options" style="display: grid; gap: 12px;">
                            <div class="sync-option" style="display: flex; align-items: center; padding: 12px; background: var(--surface-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                                <input type="checkbox" id="modal-auto-sync" style="margin-right: 12px;">
                                <div>
                                    <label for="modal-auto-sync" style="cursor: pointer; color: var(--text-primary); font-weight: 500;">${t('settings.sync.autoSyncLabel', 'Automatic Sync')}</label>
                                    <div class="sync-option-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">${t('settings.sync.autoSyncDescription', 'Automatically sync changes every 5 minutes when connected')}</div>
                                </div>
                            </div>
                            <div class="sync-option" style="display: flex; align-items: center; padding: 12px; background: var(--surface-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                                <input type="checkbox" id="modal-sync-on-startup" style="margin-right: 12px;">
                                <div>
                                    <label for="modal-sync-on-startup" style="cursor: pointer; color: var(--text-primary); font-weight: 500;">${t('settings.sync.syncOnStartupLabel', 'Sync on Startup')}</label>
                                    <div class="sync-option-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">${t('settings.sync.syncOnStartupDescription', 'Sync data when the application starts')}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Encryption Section -->
                    <div class="sync-section" style="margin-bottom: 24px;">
                        <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;"><i class="fas fa-lock"></i> ${t('settings.sync.encryptionSectionTitle', 'End-to-End Encryption')}</h5>
                        <div class="sync-encryption-section" style="background: var(--surface-bg); border-radius: 6px; padding: 16px; border: 1px solid var(--border-color);">
                            <div class="encryption-status" id="encryption-status" style="margin-bottom: 16px;">
                                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                                    <div id="encryption-indicator" style="width: 12px; height: 12px; border-radius: 50%; margin-right: 8px;"></div>
                                    <span id="encryption-status-text" style="font-weight: 500;"></span>
                                </div>
                                <div id="encryption-description" style="font-size: 0.85rem; color: var(--text-secondary);"></div>
                            </div>

                            <div class="encryption-controls" id="encryption-controls">
                                <div class="sync-option" style="display: flex; align-items: center; padding: 12px; background: var(--surface-bg); border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 12px;">
                                    <input type="checkbox" id="modal-encryption-enabled" style="margin-right: 12px;">
                                    <div>
                                        <label for="modal-encryption-enabled" style="cursor: pointer; color: var(--text-primary); font-weight: 500;">${t('settings.sync.enableEncryption', 'Enable End-to-End Encryption')}</label>
                                        <div class="sync-option-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">${t('settings.sync.encryptionDescription', 'Encrypt your data before uploading to Google Drive. Your data will only be accessible with your passphrase.')}</div>
                                    </div>
                                </div>

                                <div class="encryption-passphrase-section" id="encryption-passphrase-section" style="display: none;">
                                    <div style="margin-bottom: 12px;">
                                        <label for="modal-encryption-passphrase" style="display: block; margin-bottom: 4px; color: var(--text-primary); font-weight: 500;">${t('settings.sync.passphraseLabel', 'Passphrase')}</label>
                                        <input type="password" id="modal-encryption-passphrase" placeholder="${t('settings.sync.passphrasePlaceholder', 'Enter your passphrase (min. 8 characters)')}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-color);">
                                        <div class="encryption-passphrase-help" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
                                            ${t('settings.sync.passphraseHelp', 'Your passphrase is used to encrypt and decrypt your data. Choose a strong passphrase and keep it safe.')}
                                        </div>
                                    </div>

                                    <div style="margin-bottom: 12px;">
                                        <label for="modal-encryption-passphrase-confirm" style="display: block; margin-bottom: 4px; color: var(--text-primary); font-weight: 500;">${t('settings.sync.confirmPassphraseLabel', 'Confirm Passphrase')}</label>
                                        <input type="password" id="modal-encryption-passphrase-confirm" placeholder="${t('settings.sync.confirmPassphrasePlaceholder', 'Confirm your passphrase')}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-color);">
                                    </div>

                                    <div class="encryption-buttons" style="display: flex; gap: 8px;">
                                        <button id="modal-encryption-save-btn" class="sync-button" style="background: var(--accent-color); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">${t('settings.sync.saveEncryption', 'Save Encryption Settings')}</button>
                                        <button id="modal-encryption-cancel-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">${t('settings.sync.cancel', 'Cancel')}</button>
                                    </div>

                                    <div id="encryption-validation" style="margin-top: 8px; font-size: 0.8rem;"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Conflicts Section (hidden by default) -->
                    <div id="modal-conflicts-section" class="sync-section" style="display: none;">
                        <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">${t('settings.sync.conflictsTitle', 'Sync Conflicts')}</h5>
                        <div id="modal-conflicts-list" style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 16px;">
                            <!-- Conflicts will be populated here -->
                        </div>
                    </div>

                    <!-- Setup Section -->
                    <div class="sync-section">
                        <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">${t('settings.sync.setupInstructions', 'Setup Instructions')}</h5>
                        <div class="sync-setup-section" style="background: var(--surface-bg); border-radius: 6px; padding: 16px; border: 1px solid var(--border-color);">
                            <div class="sync-setup-steps" style="counter-reset: step-counter;">
                                <div class="sync-setup-step" style="counter-increment: step-counter; margin-bottom: 12px; position: relative; padding-left: 32px;">
                                    <div style="position: absolute; left: 0; top: 0; width: 24px; height: 24px; background: var(--accent-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600;">1</div>
                                    <h6 style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-primary);">${t('settings.sync.step1Title', 'Create Google Cloud Project')}</h6>
                                    <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">${t('settings.sync.step1Description', 'Go to Google Cloud Console and create a new project.')}</p>
                                </div>
                                <div class="sync-setup-step" style="counter-increment: step-counter; margin-bottom: 12px; position: relative; padding-left: 32px;">
                                    <div style="position: absolute; left: 0; top: 0; width: 24px; height: 24px; background: var(--accent-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600;">2</div>
                                    <h6 style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-primary);">${t('settings.sync.step2Title', 'Enable Google Drive API')}</h6>
                                    <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">${t('settings.sync.step2Description', 'In the Cloud Console, enable the Google Drive API for your project.')}</p>
                                </div>
                                <div class="sync-setup-step" style="counter-increment: step-counter; margin-bottom: 12px; position: relative; padding-left: 32px;">
                                    <div style="position: absolute; left: 0; top: 0; width: 24px; height: 24px; background: var(--accent-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600;">3</div>
                                    <h6 style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-primary);">${t('settings.sync.step3Title', 'Import Credentials')}</h6>
                                    <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">${t('settings.sync.step3Description', 'Download your OAuth client credentials JSON and import it into CogNotez.')}</p>
                                </div>
                            </div>

                            <div style="margin-top: 16px;">
                                <button id="modal-import-credentials-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">${t('settings.sync.importCredentialsButton', 'Import Credentials File')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalTitle = t('settings.sync.cloudTitle', 'Cloud Sync Settings');
        const closeLabel = window.i18n ? window.i18n.t('modals.close') : 'Close';
        const modal = app.createModal(modalTitle, content, [
            { text: closeLabel, type: 'secondary', action: 'close-sync-settings' }
        ]);

        // Initialize sync status in modal
        app.initializeModalSyncHandlers(modal);

        // Initialize encryption status in modal
        app.initializeModalEncryptionHandlers(modal);

    } catch (error) {
        console.error('[Sync] Failed to show sync settings modal:', error);
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        app.showNotification(t('settings.sync.failedToOpenSyncSettings'), 'error');
    }
}

/**
 * Initialize encryption handlers for the sync settings modal
 * @param {Object} app - The CogNotezApp instance
 * @param {HTMLElement} modal - The modal DOM element
 */
async function initializeModalEncryptionHandlers(app, modal) {
    try {
        const { ipcRenderer } = require('electron');

        // Get current encryption settings
        const encryptionResult = await ipcRenderer.invoke('get-encryption-settings');
        if (!encryptionResult.success) {
            console.error('[Encryption] Failed to get encryption settings:', encryptionResult.error);
            return;
        }

        const settings = encryptionResult.settings;
        app.updateModalEncryptionStatus(modal, settings);

        // Encryption enabled checkbox
        const encryptionEnabledCheckbox = modal.querySelector('#modal-encryption-enabled');
        const encryptionPassphraseSection = modal.querySelector('#encryption-passphrase-section');
        const encryptionPassphraseInput = modal.querySelector('#modal-encryption-passphrase');
        const encryptionPassphraseConfirmInput = modal.querySelector('#modal-encryption-passphrase-confirm');
        const encryptionSaveBtn = modal.querySelector('#modal-encryption-save-btn');
        const encryptionCancelBtn = modal.querySelector('#modal-encryption-cancel-btn');
        const encryptionValidation = modal.querySelector('#encryption-validation');

        // Enable/disable checkbox - remove existing listeners to prevent duplicates
        encryptionEnabledCheckbox.checked = settings.enabled;

        // Clone and replace the checkbox to remove all existing event listeners
        const newCheckbox = encryptionEnabledCheckbox.cloneNode(true);
        encryptionEnabledCheckbox.parentNode.replaceChild(newCheckbox, encryptionEnabledCheckbox);

        const updateEncryptionControlsUI = (isEnabled) => {
            // Always keep section visible so Save button is accessible
            encryptionPassphraseSection.style.display = 'block';

            if (isEnabled) {
                // Show inputs when enabling
                encryptionPassphraseInput.style.display = '';
                encryptionPassphraseConfirmInput.style.display = '';
                encryptionValidation.style.display = '';
                encryptionSaveBtn.textContent = window.i18n
                    ? window.i18n.t('settings.sync.saveEncryption')
                    : 'Save Encryption Settings';
            } else {
                // Hide inputs when disabling but keep Save button visible
                encryptionPassphraseInput.style.display = 'none';
                encryptionPassphraseConfirmInput.style.display = 'none';
                encryptionValidation.style.display = 'none';
                encryptionPassphraseInput.value = '';
                encryptionPassphraseConfirmInput.value = '';
                encryptionValidation.textContent = '';
                encryptionSaveBtn.textContent = window.i18n
                    ? window.i18n.t('settings.sync.disableEncryption', 'Disable Encryption')
                    : 'Disable Encryption';
            }
        };

        newCheckbox.addEventListener('change', () => {
            updateEncryptionControlsUI(newCheckbox.checked);
            if (newCheckbox.checked) {
                encryptionPassphraseInput.focus();
            }
        });

        // Initialize controls based on current setting
        updateEncryptionControlsUI(settings.enabled);

        // Passphrase validation
        const validatePassphrases = () => {
            const passphrase = encryptionPassphraseInput.value;
            const confirmPassphrase = encryptionPassphraseConfirmInput.value;

            if (!passphrase) {
                encryptionValidation.textContent = '';
                return;
            }

            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            if (passphrase.length < 8) {
                encryptionValidation.textContent = t('encryption.passphraseMinLengthLong');
                encryptionValidation.style.color = 'var(--error-color)';
                return;
            }

            if (passphrase !== confirmPassphrase) {
                encryptionValidation.textContent = t('encryption.passphrasesDoNotMatch');
                encryptionValidation.style.color = 'var(--error-color)';
                return;
            }

            encryptionValidation.textContent = t('encryption.passphrasesMatch');
            encryptionValidation.style.color = 'var(--success-color)';
        };

        encryptionPassphraseInput.addEventListener('input', validatePassphrases);
        encryptionPassphraseConfirmInput.addEventListener('input', validatePassphrases);

        // Save button
        encryptionSaveBtn.addEventListener('click', async () => {
            try {
                const passphrase = encryptionPassphraseInput.value;
                const confirmPassphrase = encryptionPassphraseConfirmInput.value;
                const enabled = newCheckbox.checked;

                // Always compute a salt value to send (null if not used)
                let saltToUse = settings.saltBase64 || null;

                if (enabled) {
                    if (!passphrase) {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        app.showNotification(t('encryption.passphraseRequired'), 'error');
                        return;
                    }

                    if (passphrase.length < 8) {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        app.showNotification(t('encryption.passphraseMinLengthLong'), 'error');
                        return;
                    }

                    if (passphrase !== confirmPassphrase) {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        app.showNotification(t('encryption.passphrasesDoNotMatch'), 'error');
                        return;
                    }

                    // Generate salt if needed for first-time encryption setup
                    if (!saltToUse) {
                        const saltResult = await ipcRenderer.invoke('derive-salt-from-passphrase', passphrase);
                        if (!saltResult.success) {
                            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                            app.showNotification(t('encryption.failedToDeriveSalt', { error: saltResult.error }), 'error');
                            return;
                        }
                        saltToUse = saltResult.saltBase64;
                    }

                    // Validate with backend
                    const validationResult = await ipcRenderer.invoke('validate-encryption-settings', {
                        passphrase: passphrase,
                        saltBase64: saltToUse
                    });

                    if (!validationResult.success || !validationResult.isValid) {
                        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                        app.showNotification(t('notifications.invalidEncryptionSettings', { errors: validationResult.errors?.join(', ') || 'Unknown error' }), 'error');
                        return;
                    }
                }

                encryptionSaveBtn.disabled = true;
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                encryptionSaveBtn.textContent = t('encryption.saving');

                console.log('[Encryption] Sending settings:', {
                    enabled: enabled,
                    hasPassphrase: !!passphrase,
                    hasSalt: !!saltToUse,
                    iterations: settings.iterations
                });

                const saveResult = await ipcRenderer.invoke('set-encryption-settings', {
                    enabled: enabled,
                    // When disabling, explicitly clear passphrase to null so DB doesn't retain it
                    passphrase: enabled ? passphrase : null,
                    saltBase64: enabled ? saltToUse : null,
                    iterations: settings.iterations
                });

                console.log('[Encryption] Save result:', saveResult);

                if (saveResult.success) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    app.showNotification(t('encryption.encryptionSettingsSaved'), 'success');
                    app.updateModalEncryptionStatus(modal, saveResult.settings);
                    await app.updateModalSyncStatus(modal); // Refresh sync status

                    // Reset form
                    encryptionPassphraseInput.value = '';
                    encryptionPassphraseConfirmInput.value = '';
                    encryptionValidation.textContent = '';
                    // Keep section visible; UI will reflect current state via updateModalEncryptionStatus
                } else {
                    app.showNotification(saveResult.error || 'Failed to save encryption settings', 'error');
                }
            } catch (error) {
                console.error('[Encryption] Failed to save settings:', error);
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                app.showNotification(t('encryption.failedToSaveEncryptionSettings'), 'error');
            } finally {
                encryptionSaveBtn.disabled = false;
                encryptionSaveBtn.textContent = window.i18n
                    ? window.i18n.t('settings.sync.saveEncryption')
                    : 'Save Encryption Settings';
            }
        });

        // Cancel button
        encryptionCancelBtn.addEventListener('click', () => {
            encryptionPassphraseInput.value = '';
            encryptionPassphraseConfirmInput.value = '';
            encryptionValidation.textContent = '';
            newCheckbox.checked = settings.enabled;
            updateEncryptionControlsUI(settings.enabled);
        });

    } catch (error) {
        console.error('[Encryption] Failed to initialize encryption handlers:', error);
    }
}

/**
 * Initialize sync handlers for the sync settings modal
 * @param {Object} app - The CogNotezApp instance
 * @param {HTMLElement} modal - The modal DOM element
 */
async function initializeModalSyncHandlers(app, modal) {
    try {
        // Get sync status and update modal
        await app.updateModalSyncStatus(modal);

        // Setup event listeners for modal buttons
        const connectBtn = modal.querySelector('#modal-google-drive-connect-btn');
        const disconnectBtn = modal.querySelector('#modal-google-drive-disconnect-btn');
        const syncBtn = modal.querySelector('#modal-google-drive-sync-btn');
        const importBtn = modal.querySelector('#modal-import-credentials-btn');
        const autoSyncCheckbox = modal.querySelector('#modal-auto-sync');
        const startupSyncCheckbox = modal.querySelector('#modal-sync-on-startup');

        // Encryption controls
        const encryptionEnabledCheckbox = modal.querySelector('#modal-encryption-enabled');
        const encryptionPassphraseInput = modal.querySelector('#modal-encryption-passphrase');
        const encryptionPassphraseConfirmInput = modal.querySelector('#modal-encryption-passphrase-confirm');
        const encryptionSaveBtn = modal.querySelector('#modal-encryption-save-btn');
        const encryptionCancelBtn = modal.querySelector('#modal-encryption-cancel-btn');
        const encryptionPassphraseSection = modal.querySelector('#encryption-passphrase-section');
        const encryptionStatus = modal.querySelector('#encryption-status');
        const encryptionIndicator = modal.querySelector('#encryption-indicator');
        const encryptionStatusText = modal.querySelector('#encryption-status-text');
        const encryptionDescription = modal.querySelector('#encryption-description');
        const encryptionValidation = modal.querySelector('#encryption-validation');

        // Connect button
        connectBtn.addEventListener('click', async () => {
            try {
                connectBtn.disabled = true;
                const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                connectBtn.textContent = t('settings.sync.statusConnecting', 'Connecting...');

                const result = await app.backendAPI.connectGoogleDrive();

                if (result.success) {
                    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                    app.showNotification(result.message || t('settings.sync.connectedSuccessfully', 'Successfully connected to Google Drive'), 'success');
                    await app.updateModalSyncStatus(modal);
                    await app.updateSyncStatus(); // Update main UI

                    // Close the sync settings modal and show restart dialog
                    app.closeModal(modal);
                    setTimeout(() => {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        app.showRestartDialog(t('modals.restartGoogleDriveConnect'));
                    }, 500);
                } else {
                    // Don't show notification here - let the IPC error event handler do it
                    // This prevents duplicate notifications
                    console.log('[Sync] Google Drive connection failed:', result.error);
                }
            } catch (error) {
                // Don't show notification here - let the IPC error event handler do it
                // This prevents duplicate notifications
                console.error('[Sync] Failed to connect Google Drive:', error);
            } finally {
                connectBtn.disabled = false;
                const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                connectBtn.textContent = t('settings.sync.connectGoogleDrive', 'Connect Google Drive');
            }
        });

        // Disconnect button
        disconnectBtn.addEventListener('click', async () => {
            try {
                disconnectBtn.disabled = true;
                const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                disconnectBtn.textContent = t('settings.sync.statusDisconnecting', 'Disconnecting...');

                const result = await app.backendAPI.disconnectGoogleDrive();

                if (result.success) {
                    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                    app.showNotification(t('settings.sync.disconnectedSuccessfully', 'Successfully disconnected from Google Drive'), 'success');
                    await app.updateModalSyncStatus(modal);
                    await app.updateSyncStatus(); // Update main UI

                    // Close the sync settings modal and show restart dialog
                    app.closeModal(modal);
                    setTimeout(() => {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        app.showRestartDialog(t('modals.restartGoogleDriveDisconnect'));
                    }, 500);
                } else {
                    app.showNotification(result.error || 'Failed to disconnect from Google Drive', 'error');
                }
            } catch (error) {
                console.error('[Sync] Failed to disconnect Google Drive:', error);
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                app.showNotification(t('settings.sync.failedToDisconnect'), 'error');
            } finally {
                disconnectBtn.disabled = false;
                const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                disconnectBtn.textContent = t('settings.sync.disconnect', 'Disconnect');
            }
        });

        // Sync now button
        syncBtn.addEventListener('click', async () => {
            try {
                syncBtn.disabled = true;
                const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                syncBtn.textContent = t('settings.sync.statusSyncing', 'Syncing...');

                // Export local data from the renderer process database manager
                let localData = null;
                let localChecksum = null;
                if (app.notesManager && app.notesManager.db) {
                    const exportResult = app.notesManager.db.exportDataForSync();
                    localData = exportResult.data;
                    localChecksum = exportResult.checksum;
                }

                const lastSync = (app.notesManager && app.notesManager.db) ? app.notesManager.db.getSyncMetadata().lastSync : null;
                const result = await app.backendAPI.syncWithGoogleDrive({ localData, localChecksum, lastSync });

                if (result.success) {
                    // Success notification handled by sync-completed event
                    await app.updateModalSyncStatus(modal);
                    await app.updateSyncStatus(); // Update main UI
                } else if (result && result.encryptionRequired) {
                    // Prompt for passphrase immediately
                    await app.promptForDecryptionPassphrase({ message: 'Cloud data is encrypted. Enter your passphrase to decrypt.' });
                } else {
                    // Error notification handled by sync-completed event
                }
            } catch (error) {
                console.error('[Sync] Manual sync failed:', error);
                // Error notification handled by sync-completed event
            } finally {
                syncBtn.disabled = false;
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                syncBtn.textContent = t('settings.sync.syncNow');
            }
        });

        // Import credentials button
        importBtn.addEventListener('click', async () => {
            try {
                const { ipcRenderer } = require('electron');

                const result = await ipcRenderer.invoke('show-open-dialog', {
                    filters: [
                        { name: 'JSON Files', extensions: ['json'] },
                        { name: 'All Files', extensions: ['*'] }
                    ],
                    properties: ['openFile']
                });

                if (!result.canceled && result.filePaths.length > 0) {
                    importBtn.disabled = true;
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    importBtn.textContent = t('settings.sync.importing');

                    const credentialsPath = result.filePaths[0];
                    const setupResult = await app.backendAPI.setupGoogleDriveCredentials(credentialsPath);

                    if (setupResult.success) {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        app.showNotification(t('settings.sync.credentialsImportedSuccess'), 'success');
                        // Update modal to show connection options
                        modal.querySelector('.sync-setup-section').style.display = 'none';
                    } else {
                        app.showNotification(setupResult.error || 'Failed to import credentials', 'error');
                    }
                }
            } catch (error) {
                console.error('[Sync] Failed to import credentials:', error);
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                app.showNotification(t('settings.sync.failedToImportCredentials'), 'error');
            } finally {
                importBtn.disabled = false;
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                importBtn.textContent = t('settings.sync.importCredentialsButton');
            }
        });

        // Auto sync checkbox
        autoSyncCheckbox.addEventListener('change', async () => {
            try {
                const enabled = autoSyncCheckbox.checked;

                if (!app.notesManager || !app.notesManager.db) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    app.showNotification(t('notifications.databaseNotAvailable'), 'error');
                    return;
                }

                const db = app.notesManager.db;
                db.setAutoSync(enabled);

                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                const syncKey = enabled ? 'notifications.autoSyncEnabled' : 'notifications.autoSyncDisabled';
                app.showNotification(t(syncKey), 'info');

                if (enabled) {
                    app.startAutoSync();
                } else {
                    app.stopAutoSync();
                }
            } catch (error) {
                console.error('[Sync] Failed to toggle auto sync:', error);
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                app.showNotification(t('settings.sync.failedToUpdateAutoSync'), 'error');
            }
        });

        // Sync on startup checkbox
        startupSyncCheckbox.addEventListener('change', async () => {
            try {
                const enabled = startupSyncCheckbox.checked;

                if (!app.notesManager || !app.notesManager.db) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    app.showNotification(t('notifications.databaseNotAvailable'), 'error');
                    return;
                }

                const db = app.notesManager.db;
                db.updateSyncMetadata({ syncOnStartup: enabled });

                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                const startupKey = enabled ? 'notifications.syncOnStartupEnabled' : 'notifications.syncOnStartupDisabled';
                app.showNotification(t(startupKey), 'info');
            } catch (error) {
                console.error('[Sync] Failed to toggle sync on startup:', error);
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                app.showNotification(t('settings.sync.failedToUpdateSyncOnStartup'), 'error');
            }
        });

    } catch (error) {
        console.error('[Sync] Failed to initialize modal handlers:', error);
    }
}

/**
 * Update the sync status display in the modal
 * @param {Object} app - The CogNotezApp instance
 * @param {HTMLElement} modal - The modal DOM element
 */
async function updateModalSyncStatus(app, modal) {
    try {
        if (!app.backendAPI) return;

        const status = await app.backendAPI.getGoogleDriveSyncStatus();

        const indicator = modal.querySelector('#modal-sync-indicator');
        const statusText = modal.querySelector('#modal-sync-status-text');
        const lastSync = modal.querySelector('#modal-sync-last-sync');
        const connectBtn = modal.querySelector('#modal-google-drive-connect-btn');
        const disconnectBtn = modal.querySelector('#modal-google-drive-disconnect-btn');
        const syncBtn = modal.querySelector('#modal-google-drive-sync-btn');
        const autoSyncCheckbox = modal.querySelector('#modal-auto-sync');
        const startupSyncCheckbox = modal.querySelector('#modal-sync-on-startup');

        if (!indicator || !statusText) return;

        // Initialize checkbox states from database (renderer)
        if (app.notesManager && app.notesManager.db) {
            const db = app.notesManager.db;
            const syncMetadata = db.getSyncMetadata();

            if (autoSyncCheckbox) {
                autoSyncCheckbox.checked = syncMetadata.autoSync || false;
            }
            if (startupSyncCheckbox) {
                startupSyncCheckbox.checked = syncMetadata.syncOnStartup || false;
            }
        }

        // Prefer renderer DB for syncEnabled since main-process DB doesn't persist localStorage
        const rendererSyncEnabled = (app.notesManager && app.notesManager.db) ? app.notesManager.db.isSyncEnabled() : false;

        // Update status indicator
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        if (status.isAuthenticated && (status.syncEnabled || rendererSyncEnabled)) {
            indicator.style.backgroundColor = 'var(--success-color)';
            statusText.textContent = t('settings.sync.statusConnectedLabel', 'Connected');
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-block';
            syncBtn.disabled = false;
        } else if (status.isAuthenticated) {
            indicator.style.backgroundColor = 'var(--warning-color)';
            statusText.textContent = t('settings.sync.statusReadyToSync', 'Ready to sync');
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-block';
            syncBtn.disabled = false;
        } else {
            indicator.style.backgroundColor = 'var(--error-color)';
            statusText.textContent = t('settings.sync.statusNotConnected', 'Not connected');
            connectBtn.style.display = 'inline-block';
            disconnectBtn.style.display = 'none';
            syncBtn.disabled = true;

            // Add a note about credentials if they're missing
            if (status.error && (status.error.includes('credentials not found') || status.error.includes('Google Drive credentials'))) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                statusText.textContent = t('settings.sync.setupRequired');
                lastSync.textContent = t('settings.sync.importCredentialsToStart');
            }
        }

        // Update last sync time
        if (status.lastSync) {
            const lastSyncDate = new Date(status.lastSync);
            const timeAgo = app.getTimeAgo(lastSyncDate);
            lastSync.textContent = window.i18n
                ? window.i18n.t('settings.sync.lastSynced', { timeAgo })
                : `Last synced: ${timeAgo}`;
        } else {
            lastSync.textContent = window.i18n
                ? window.i18n.t('settings.sync.neverSynced')
                : 'Never synced';
        }

        // Check for and display conflicts
        await app.displayModalConflicts(modal);

    } catch (error) {
        console.error('[Sync] Failed to update modal sync status:', error);
    }
}

module.exports = { showSyncSettings, initializeModalEncryptionHandlers, initializeModalSyncHandlers, updateModalSyncStatus };



/**
 * General Settings Module
 * Handles the general settings dialog for CogNotez
 */

/**
 * Shows the general settings modal dialog
 * @param {Object} app - The CogNotezApp instance
 */
function showGeneralSettings(app) {
    const currentAutoSave = localStorage.getItem('autoSave') !== 'false'; // Default to true
    const currentTheme = localStorage.getItem('theme') || 'light';
    const currentWordCount = localStorage.getItem('showWordCount') === 'true';

    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

    const content = `
        <div style="max-width: 400px;">
            <div style="margin-bottom: 24px;">
                <h4 style="margin: 0 0 16px 0; color: var(--text-primary);"><i class="fas fa-cog"></i> ${t('settings.general.title', 'General Settings')}</h4>
            </div>

            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div class="setting-item">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="auto-save-toggle" ${currentAutoSave ? 'checked' : ''} style="margin: 0;">
                        <span style="color: var(--text-primary); font-weight: 500;">${t('settings.general.autoSaveLabel', 'Enable Auto-Save')}</span>
                    </label>
                    <div style="margin-top: 4px; color: var(--text-secondary); font-size: 12px;">
                        ${t('settings.general.autoSaveDescription', 'Automatically save your notes every 30 seconds when changes are detected')}
                    </div>
                </div>

                <div class="setting-item">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="word-count-toggle" ${currentWordCount ? 'checked' : ''} style="margin: 0;">
                        <span style="color: var(--text-primary); font-weight: 500;">${t('settings.general.wordCountLabel', 'Show Word Count')}</span>
                    </label>
                    <div style="margin-top: 4px; color: var(--text-secondary); font-size: 12px;">
                        ${t('settings.general.wordCountDescription', 'Display word count in the editor header')}
                    </div>
                </div>

                <div class="setting-item">
                    <label style="color: var(--text-primary); font-weight: 500;">${t('settings.general.themeLabel', 'Theme')}</label>
                    <select id="theme-select" style="width: 100%; padding: 8px; margin-top: 4px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                        <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>${t('settings.general.themeLight', 'Light')}</option>
                        <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>${t('settings.general.themeDark', 'Dark')}</option>
                    </select>
                </div>
            </div>
        </div>
    `;

    const modal = app.createModal(t('settings.general.title', 'General Settings'), content, [
        { text: t('settings.general.saveButton', 'Save Settings'), type: 'primary', action: 'save-general-settings' },
        { text: window.i18n ? window.i18n.t('modals.cancel') : 'Cancel', type: 'secondary', action: 'cancel' }
    ]);

    const saveBtn = modal.querySelector('[data-action="save-general-settings"]');
    saveBtn.addEventListener('click', () => {
        const autoSaveEnabled = modal.querySelector('#auto-save-toggle').checked;
        const wordCountEnabled = modal.querySelector('#word-count-toggle').checked;
        const theme = modal.querySelector('#theme-select').value;

        // Track if auto-save setting changed
        const previousAutoSave = localStorage.getItem('autoSave') === 'true';
        const autoSaveChanged = previousAutoSave !== autoSaveEnabled;

        // Save settings
        localStorage.setItem('autoSave', autoSaveEnabled.toString());
        localStorage.setItem('showWordCount', wordCountEnabled.toString());
        localStorage.setItem('theme', theme);

        // Apply theme immediately
        app.theme = theme;
        app.loadTheme();

        // Refresh word count display based on new settings
        if (app.uiManager) {
            app.uiManager.refreshWordCount();
        }

        // Handle auto-save changes
        if (app.notesManager) {
            if (autoSaveEnabled) {
                // Ensure autosave is running
                if (!app.notesManager.autoSaveInterval) {
                    app.notesManager.startAutoSave();
                    console.log('[DEBUG] Auto-save enabled');
                }
            } else {
                // Ensure autosave is stopped
                if (app.notesManager.autoSaveInterval) {
                    app.notesManager.stopAutoSave();
                    console.log('[DEBUG] Auto-save disabled');
                }
            }
        }

        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        app.showNotification(`✅ ${t('settings.sync.generalSettingsSaved')}`, 'success');
        app.closeModal(modal);

        // Show restart dialog if auto-save setting changed
        if (autoSaveChanged) {
            setTimeout(() => {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                app.showRestartDialog(t('modals.restartAutoSave'));
            }, 500);
        }
    });
}

module.exports = { showGeneralSettings };

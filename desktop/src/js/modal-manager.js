const { ipcRenderer } = require('electron');
const { setSafeInnerHTML } = require('./shared');

class ModalManager {
    constructor(app) {
        this.app = app;
    }

    createModal(title, content, buttons = []) {
        const modal = document.createElement('div');
        modal.className = 'modal';

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.style.maxWidth = '600px';

        const header = document.createElement('div');
        header.className = 'modal-header';

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        header.appendChild(titleEl);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.textContent = '\u00d7';
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal-body';
        setSafeInnerHTML(body, content);

        modalContent.appendChild(header);
        modalContent.appendChild(body);

        if (buttons.length > 0) {
            const footer = document.createElement('div');
            footer.className = 'modal-footer';
            footer.style.padding = '16px 20px';
            footer.style.borderTop = '1px solid var(--border-color)';
            footer.style.display = 'flex';
            footer.style.gap = '12px';
            footer.style.justifyContent = 'flex-end';

            buttons.forEach(btn => {
                const btnElement = document.createElement('button');
                btnElement.className = `btn-${btn.type || 'secondary'}`;
                btnElement.dataset.action = btn.action;
                btnElement.textContent = btn.text;
                btnElement.addEventListener('click', () => {
                    if (btn.callback) btn.callback();
                    this.closeModal(modal);
                });
                footer.appendChild(btnElement);
            });

            modalContent.appendChild(footer);
        }

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Event listeners
        closeBtn.addEventListener('click', () => this.closeModal(modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });

        return modal;
    }

    closeModal(modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }

    closeAllModals() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        });
    }

    showConfirmation(title, message) {
        return new Promise((resolve) => {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            const cancelText = t('modals.cancel', 'Cancel');
            const confirmText = t('modals.confirm', 'Confirm');

            const content = `
                <div style="padding: 10px 0;">
                    <p style="margin: 0; color: var(--text-primary); white-space: pre-line;">
                        ${this.app.escapeHtml(message)}
                    </p>
                </div>
            `;

            const modal = this.createModal(title, content, [
                { text: cancelText, type: 'secondary', action: 'cancel', callback: () => resolve(false) },
                { text: confirmText, type: 'primary', action: 'confirm', callback: () => resolve(true) }
            ]);

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    resolve(false);
                }
            });

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEscape);
                    resolve(false);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    showInputPrompt(title, message, defaultValue = '', placeholder = '') {
        return new Promise((resolve) => {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            const cancelText = t('modals.cancel', 'Cancel');
            const okText = t('modals.ok', 'OK');

            const inputId = 'prompt-input-' + Date.now();
            const content = `
                <div style="padding: 10px 0;">
                    ${message ? `<p style="margin: 0 0 16px 0; color: var(--text-primary);">${this.app.escapeHtml(message)}</p>` : ''}
                    <input type="text"
                           id="${inputId}"
                           class="ai-dialog-input"
                           placeholder="${this.app.escapeHtml(placeholder)}"
                           value="${this.app.escapeHtml(defaultValue)}"
                           style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-size: 14px;">
                </div>
            `;

            const modal = this.createModal(title, content, [
                { text: cancelText, type: 'secondary', action: 'cancel', callback: () => resolve(null) },
                {
                    text: okText, type: 'primary', action: 'confirm', callback: () => {
                        const input = modal.querySelector(`#${inputId}`);
                        resolve(input ? input.value.trim() : null);
                    }
                }
            ]);

            setTimeout(() => {
                const input = modal.querySelector(`#${inputId}`);
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 100);

            const handleEnter = (e) => {
                if (e.key === 'Enter') {
                    const input = modal.querySelector(`#${inputId}`);
                    const okBtn = modal.querySelector('[data-action="confirm"]');
                    if (okBtn && input) {
                        e.preventDefault();
                        okBtn.click();
                    }
                }
            };
            modal.addEventListener('keydown', handleEnter);

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    resolve(null);
                }
            });

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEscape);
                    resolve(null);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    async showAboutDialog() {
        try {
            const version = await ipcRenderer.invoke('get-app-version');
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            const content = `
                <div style="padding: 20px 0; text-align: center;">
                    <div style="margin-bottom: 24px;">
                        <h2 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 24px; font-weight: 600;">
                            CogNotez
                        </h2>
                        <p style="margin: 0; color: var(--text-secondary); font-size: 16px;">
                            ${t('about.subtitle', 'AI-Powered Note App')}
                        </p>
                    </div>
                    <div style="margin-bottom: 24px; padding: 16px; background: var(--bg-secondary, rgba(128, 128, 128, 0.1)); border-radius: 8px;">
                        <p style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 14px;">
                            <strong>${t('about.versionLabel', 'Version:')}</strong> ${this.app.escapeHtml(version)}
                        </p>
                        <p style="margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6;">
                            ${t('about.descriptionLine1', 'An offline-first note-taking application')}<br>
                            ${t('about.descriptionLine2', 'with local LLM integration.')}
                        </p>
                    </div>
                    <div style="margin-top: 20px; color: var(--text-secondary); font-size: 12px;">
                        <p style="margin: 0;">\u00a9 2025 KayfaHaarukku/nawka12</p>
                    </div>
                </div>
            `;

            this.createModal(t('about.title', 'About CogNotez'), content, [
                { text: window.i18n ? window.i18n.t('modals.close') : 'Close', type: 'primary', action: 'close' }
            ]);
        } catch (error) {
            console.error('Error showing about dialog:', error);
            const content = `
                <div style="padding: 20px 0; text-align: center;">
                    <div style="margin-bottom: 24px;">
                        <h2 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 24px; font-weight: 600;">
                            CogNotez
                        </h2>
                        <p style="margin: 0; color: var(--text-secondary); font-size: 16px;">
                            AI-Powered Note App
                        </p>
                    </div>
                    <div style="margin-bottom: 24px; padding: 16px; background: var(--bg-secondary, rgba(128, 128, 128, 0.1)); border-radius: 8px;">
                        <p style="margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6;">
                            An offline-first note-taking application<br>
                            with local LLM integration.
                        </p>
                    </div>
                    <div style="margin-top: 20px; color: var(--text-secondary); font-size: 12px;">
                        <p style="margin: 0;">\u00a9 2025 KayfaHaarukku/nawka12</p>
                    </div>
                </div>
            `;

            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.createModal(t('about.title'), content, [
                { text: t('modals.close'), type: 'primary', action: 'close' }
            ]);
        }
    }

    showAlert(title, message) {
        return new Promise((resolve) => {
            const content = `
                <div style="padding: 10px 0;">
                    <p style="margin: 0; color: var(--text-primary); white-space: pre-line;">
                        ${this.app.escapeHtml(message)}
                    </p>
                </div>
            `;

            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            const modal = this.createModal(title, content, [
                { text: t('modals.ok'), type: 'primary', action: 'ok', callback: () => resolve() }
            ]);

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    resolve();
                }
            });

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEscape);
                    resolve();
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }
}

module.exports = ModalManager;

// Encryption utilities for CogNotez
// Provides AES-256-GCM encryption for Google Drive sync data

const crypto = require('crypto');

class EncryptionManager {
    constructor() {
        this.defaultIterations = 210000; // OWASP recommended minimum for PBKDF2
    }

    /**
     * Derive encryption key from passphrase using PBKDF2
     * @param {string} passphrase - User's passphrase
     * @param {string} saltBase64 - Base64 encoded salt
     * @param {number} iterations - Number of iterations (default: 210000)
     * @returns {Buffer} - 32-byte encryption key
     */
    deriveKeyFromPassphrase(passphrase, saltBase64, iterations = this.defaultIterations) {
        if (!passphrase || !saltBase64) {
            throw new Error('Passphrase and salt are required');
        }

        const salt = Buffer.from(saltBase64, 'base64');
        const key = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');
        return key;
    }

    /**
     * Generate a deterministic salt from passphrase for multi-device compatibility
     * @param {string} passphrase - User's passphrase
     * @returns {string} - Base64 encoded salt
     */
    deriveSaltFromPassphrase(passphrase) {
        if (!passphrase) {
            throw new Error('Passphrase is required to derive salt');
        }

        // Use PBKDF2 with fixed parameters to derive salt deterministically
        const salt = crypto.pbkdf2Sync(passphrase, 'CogNotez-Salt-Derivation-Key', 1, 16, 'sha256');
        return salt.toString('base64');
    }

    /**
     * Generate a random salt for key derivation (legacy method)
     * @returns {string} - Base64 encoded salt
     */
    generateSalt() {
        return crypto.randomBytes(16).toString('base64');
    }

    /**
     * Encrypt JSON data with passphrase
     * @param {Object} data - Data to encrypt
     * @param {string} passphrase - User's passphrase
     * @param {Object} options - Encryption options
     * @param {string} options.saltBase64 - Base64 encoded salt
     * @param {number} options.iterations - PBKDF2 iterations
     * @returns {Object} - Encrypted envelope
     */
    encryptData(data, passphrase, options = {}) {
        if (!data || !passphrase) {
            throw new Error('Data and passphrase are required');
        }

        const iv = crypto.randomBytes(12); // 96-bit IV for GCM
        const salt = options.saltBase64 ? Buffer.from(options.saltBase64, 'base64') : crypto.randomBytes(16);
        const iterations = options.iterations || this.defaultIterations;

        const key = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');

        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();

        return {
            v: 1, // Version for future compatibility
            alg: 'AES-256-GCM',
            kdf: 'PBKDF2-SHA256',
            iter: iterations,
            salt: salt.toString('base64'),
            iv: iv.toString('base64'),
            ct: ciphertext.toString('base64'),
            tag: tag.toString('base64')
        };
    }

    /**
     * Decrypt encrypted envelope with passphrase
     * @param {Object} envelope - Encrypted data envelope
     * @param {string} passphrase - User's passphrase
     * @returns {Object} - Decrypted data
     */
    decryptData(envelope, passphrase) {
        if (!envelope || !passphrase) {
            throw new Error('Envelope and passphrase are required');
        }

        // Validate envelope format
        if (envelope.v !== 1 || envelope.alg !== 'AES-256-GCM') {
            throw new Error('Unsupported encryption format');
        }

        try {
            const salt = Buffer.from(envelope.salt, 'base64');
            const iv = Buffer.from(envelope.iv, 'base64');
            const tag = Buffer.from(envelope.tag, 'base64');
            const ct = Buffer.from(envelope.ct, 'base64');
            const iterations = envelope.iter || this.defaultIterations;

            const key = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);

            const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
            return JSON.parse(plaintext.toString('utf8'));

        } catch (error) {
            if (error.code === 'EBADDECRYPT') {
                throw new Error('Incorrect passphrase or corrupted data');
            }
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Check if data is encrypted
     * @param {Object} data - Data to check
     * @returns {boolean} - True if data is encrypted envelope
     */
    isEncrypted(data) {
        return data &&
               typeof data === 'object' &&
               data.v === 1 &&
               data.alg === 'AES-256-GCM' &&
               data.ct &&
               data.tag;
    }

    /**
     * Validate encryption settings
     * @param {Object} settings - Encryption settings
     * @returns {Object} - Validation result with isValid and errors
     */
    validateSettings(settings) {
        const errors = [];

        if (!settings.passphrase || settings.passphrase.length < 8) {
            errors.push('Passphrase must be at least 8 characters long');
        }

        if (!settings.saltBase64) {
            errors.push('Salt is required for encryption');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Generate new encryption parameters
     * @returns {Object} - New salt and iterations
     */
    generateEncryptionParams() {
        return {
            saltBase64: this.generateSalt(),
            iterations: this.defaultIterations
        };
    }
}

// Export singleton instance
const encryptionManager = new EncryptionManager();
module.exports = encryptionManager;

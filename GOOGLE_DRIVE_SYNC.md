# Google Drive Sync Setup Guide

This guide explains how to set up and use Google Drive cloud synchronization for CogNotez, allowing you to sync your notes across multiple devices while maintaining privacy and control over your data.

## Overview

CogNotez's Google Drive sync feature provides:
- **Privacy-focused**: Your notes stay encrypted and under your control
- **Bidirectional sync**: Changes sync automatically between devices
- **Conflict resolution**: Intelligent merging of conflicting changes
- **Offline-first**: Works seamlessly when offline, syncs when connected
- **Optional**: Completely opt-in, can be disabled at any time

## Prerequisites

### 1. Google Cloud Project Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"

### 2. Create OAuth 2.0 Credentials

1. In the Cloud Console, go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Configure the OAuth consent screen if prompted
4. Select "Desktop application" as the application type
5. Under "Authorized redirect URIs", add: `http://localhost`
   - **Note**: The app will handle OAuth callbacks from any localhost URL, so you don't need to specify a port
6. Click "Save" and download the JSON file containing your credentials

### 3. Install CogNotez

Ensure you have CogNotez installed and running. The sync feature is available in version 0.1.0 and later.

## Setup Instructions

### Step 1: Import Google Drive Credentials

1. Launch CogNotez
2. Click the cloud icon (☁️) in the header to open Sync Settings
3. In the setup section, click "Import Credentials File"
4. **Important**: Add your email as a test user:
   - Go to Google Cloud Console → OAuth consent screen → Audience → Test users
   - Click "ADD USERS" and add your email address
   - This is required because the app is in testing mode

5. Select the JSON file you downloaded from Google Cloud Console
6. The credentials will be securely stored locally

### Step 2: Connect to Google Drive

1. In the Sync Settings dialog, click "Connect Google Drive"
2. A browser window will open for Google authentication
3. Sign in to your Google account
4. Grant permission for CogNotez to access your Google Drive
5. The connection will be established

### Step 3: Configure Sync Options

After connecting, you can configure:

- **Automatic Sync**: Enable/disable automatic synchronization every 5 minutes
- **Sync on Startup**: Automatically sync when the app starts
- **Sync Notifications**: Show notifications for sync events

## How Sync Works

### Data Storage

- Your notes are stored in a dedicated folder called `CogNotez_Backup` in your Google Drive
- The data remains encrypted and accessible only through CogNotez
- You maintain full control and can revoke access at any time

### Sync Process

1. **Local Changes**: When you create or modify notes, they're marked for sync
2. **Upload**: Changes are uploaded to Google Drive in the background
3. **Download**: Changes from other devices are downloaded and merged
4. **Conflict Resolution**: If conflicts occur, you're prompted to choose which version to keep

### Conflict Resolution

When the same note is modified on multiple devices:

1. **Automatic Merge**: Most conflicts are resolved automatically by keeping the most recent changes
2. **Manual Resolution**: For complex conflicts, you'll be prompted to choose:
   - Keep local version
   - Keep remote version
   - Merge manually

## Usage

### Manual Sync

- Click the sync icon (🔄) in the header to manually trigger synchronization
- The icon shows the current sync status:
  - ☁️ Connected and synced
  - ⬆️ Ready to upload changes
  - ❌ Not connected

### Automatic Sync

When enabled, sync happens automatically:
- Every 5 minutes when the app is running
- When the app starts (if "Sync on Startup" is enabled)
- After significant changes (new notes, major edits)

### Monitoring Sync Status

The header shows real-time sync status:
- **Connected**: Green indicator, sync is active
- **Syncing**: Yellow indicator with spinner, sync in progress
- **Disconnected**: Red indicator, sync unavailable
- **Last synced**: Time since last successful sync

## Privacy & Security

### Your Data Stays Private

- Notes are stored in your Google Drive, not on CogNotez servers
- Only you can access your data
- **Optional end-to-end encryption**: Enable encryption to secure your data before upload
- No third-party access to your content

#### End-to-End Encryption

CogNotez supports optional AES-256-GCM encryption for your sync data:

- **Encryption**: Data is encrypted locally before being uploaded to Google Drive
- **Key Management**: Encryption keys and salts are derived from your passphrase using PBKDF2
- **Security**: Uses industry-standard AES-256-GCM with authenticated encryption
- **Multi-Device Support**: Same passphrase generates identical keys and salts across all devices
- **Backward Compatibility**: Existing unencrypted files continue to work seamlessly

To enable encryption:
1. Open Sync Settings
2. Enable "End-to-End Encryption"
3. Set a strong passphrase (minimum 8 characters)
4. Use the **same passphrase** on all your devices
5. Your data will be encrypted before the next sync

### Access Control

- You can revoke CogNotez's access anytime through Google account settings
- Credentials are stored locally and encrypted
- Sync can be disabled or paused at any time

### Data Usage

- Only note content and metadata are synced
- AI conversation history is included for continuity
- Settings and preferences sync across devices
- No analytics or usage data is collected

## Troubleshooting

### Connection Issues

**Problem**: "Failed to connect to Google Drive"
**Solutions**:
1. Check your internet connection
2. Verify your Google Cloud project is properly configured
3. Ensure the OAuth credentials are valid
4. Try re-importing the credentials file

**Problem**: "Authentication failed"
**Solutions**:
1. Clear browser cache and cookies
2. Try signing out and back into your Google account
3. Check if 2-factor authentication is interfering
4. Ensure the redirect URI is correctly configured

### Sync Issues

**Problem**: "Sync failed" or "Upload failed"
**Solutions**:
1. Check available storage space in Google Drive
2. Verify internet connection stability
3. Try manual sync after a few minutes
4. Check Google Drive API quota limits

**Problem**: "Download failed"
**Solutions**:
1. Ensure the CogNotez folder exists in Google Drive
2. Check if the file was corrupted during upload
3. Try disconnecting and reconnecting
4. Restore from a local backup if needed

### Performance Issues

**Problem**: Sync is slow
**Solutions**:
1. Reduce the number of large notes
2. Check internet connection speed
3. Temporarily disable automatic sync
4. Close other bandwidth-intensive applications

## Advanced Configuration

### Custom Sync Intervals

You can modify the automatic sync interval by editing the database settings:
```javascript
// In the database sync settings
syncInterval: 300000 // 5 minutes in milliseconds
```

### Sync Exclusions

Currently, all note data is synced. Future versions may allow excluding specific notes or types of content.

### Multiple Google Accounts

Each CogNotez installation can only connect to one Google account. To use different accounts:
1. Set up separate CogNotez installations
2. Use different Google accounts for each
3. Manually transfer data between installations if needed

## Backup and Restore

### Automatic Backups

- Sync creates automatic backups before major operations
- Backups are stored locally and can be restored independently
- Google Drive provides additional backup redundancy

### Manual Backup

1. Go to File > Export
2. Choose "Export All Notes (JSON)" for complete backup
3. Store the backup file securely
4. Use "Import" to restore from backup

### Disaster Recovery

If sync data becomes corrupted:
1. Disconnect from Google Drive in settings
2. Clear sync data
3. Restore from a local backup
4. Reconnect and upload clean data

## Uninstallation

To completely remove Google Drive sync:

1. **Disconnect the account**:
   - Open Sync Settings
   - Click "Disconnect" next to Google Drive
   - Confirm disconnection

2. **Remove app permissions**:
   - Go to Google account settings
   - Navigate to "Security" > "Third-party apps"
   - Remove CogNotez from authorized apps

3. **Delete sync data** (optional):
   - The `CogNotez_Backup` folder will remain in your Google Drive
   - You can delete it manually if desired

4. **Clear local credentials**:
   - Use "Clear Sync Data" in settings to remove stored credentials

## Technical Details

### File Structure

```
Google Drive/
└── CogNotez_Backup/
    └── cognotez_sync_backup.json
```

### Data Format

The sync file contains:
- Notes with full content and metadata
- AI conversation history
- Tags and categories
- Settings and preferences
- Sync metadata (timestamps, versions, checksums)

### API Permissions

CogNotez requests minimal Google Drive permissions:
- `https://www.googleapis.com/auth/drive.file`: Access to files created by the app
- `https://www.googleapis.com/auth/drive.metadata.readonly`: Read metadata of files

### Encryption Implementation

#### Optional AES-256-GCM Encryption

When enabled, CogNotez encrypts your data using:

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: PBKDF2 with 210,000 iterations and 16-byte salt
- **Storage**: Encryption parameters stored in local settings
- **Passphrase**: User-provided passphrase, never stored in plain text

#### Security Features

- **Client-side encryption**: All encryption/decryption happens locally
- **Authenticated encryption**: Prevents tampering with encrypted data
- **Key derivation**: Uses industry-standard PBKDF2 for secure key generation
- **Salt derivation**: Deterministic 16-byte salt derived from passphrase for multi-device compatibility
- **Backward compatibility**: Existing unencrypted files continue to work

#### Encryption Workflow

1. **Upload**: Data → Encrypt locally → Upload encrypted envelope to Google Drive
2. **Download**: Download encrypted envelope → Decrypt locally → Use decrypted data
3. **Key Management**: Passphrase-derived keys never leave your device

## Support

### Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review the console logs for error messages
3. Ensure all prerequisites are met
4. Try disconnecting and reconnecting

### Reporting Issues

When reporting sync issues, please include:
- CogNotez version
- Operating system
- Error messages from console
- Steps to reproduce the issue
- Whether the issue is intermittent or consistent

### Feature Requests

For sync-related feature requests:
- Automatic conflict resolution improvements
- Selective sync options
- Multi-account support
- Enhanced encryption options (e.g., Argon2, hardware security keys)

---

**Note**: Google Drive sync is an optional feature designed to enhance your note-taking experience while maintaining CogNotez's commitment to privacy and user control. Your data always remains under your ownership and control.

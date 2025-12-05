import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:googleapis/drive/v3.dart' as drive;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'encryption_service.dart';
import 'media_storage_service.dart';

/// Authenticated HTTP client for Google APIs
class GoogleAuthClient extends http.BaseClient {
  final Map<String, String> _headers;
  final http.Client _client = http.Client();

  GoogleAuthClient(this._headers);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    return _client.send(request..headers.addAll(_headers));
  }

  @override
  void close() {
    _client.close();
  }
}

/// Sync status information
class SyncStatus {
  final bool isConnected;
  final bool isSyncing;
  final DateTime? lastSync;
  final String? userEmail;
  final String? userName;
  final String? userPhotoUrl;
  final String? error;
  final bool hasRemoteBackup;
  final bool isEncrypted;
  final bool encryptionEnabled;
  final bool needsPassphrase;

  SyncStatus({
    this.isConnected = false,
    this.isSyncing = false,
    this.lastSync,
    this.userEmail,
    this.userName,
    this.userPhotoUrl,
    this.error,
    this.hasRemoteBackup = false,
    this.isEncrypted = false,
    this.encryptionEnabled = false,
    this.needsPassphrase = false,
  });

  SyncStatus copyWith({
    bool? isConnected,
    bool? isSyncing,
    DateTime? lastSync,
    String? userEmail,
    String? userName,
    String? userPhotoUrl,
    String? error,
    bool? hasRemoteBackup,
    bool? isEncrypted,
    bool? encryptionEnabled,
    bool? needsPassphrase,
  }) {
    return SyncStatus(
      isConnected: isConnected ?? this.isConnected,
      isSyncing: isSyncing ?? this.isSyncing,
      lastSync: lastSync ?? this.lastSync,
      userEmail: userEmail ?? this.userEmail,
      userName: userName ?? this.userName,
      userPhotoUrl: userPhotoUrl ?? this.userPhotoUrl,
      error: error,
      hasRemoteBackup: hasRemoteBackup ?? this.hasRemoteBackup,
      isEncrypted: isEncrypted ?? this.isEncrypted,
      encryptionEnabled: encryptionEnabled ?? this.encryptionEnabled,
      needsPassphrase: needsPassphrase ?? this.needsPassphrase,
    );
  }
}

/// Sync result information
class SyncResult {
  final bool success;
  final String action; // 'upload', 'download', 'merge', 'none', 'error', 'encryption_required'
  final String message;
  final int notesUploaded;
  final int notesDownloaded;
  final int conflicts;
  final Map<String, dynamic>? mergedData;
  final bool encryptionRequired;
  final int mediaUploaded;
  final int mediaDownloaded;

  SyncResult({
    required this.success,
    required this.action,
    required this.message,
    this.notesUploaded = 0,
    this.notesDownloaded = 0,
    this.conflicts = 0,
    this.mergedData,
    this.encryptionRequired = false,
    this.mediaUploaded = 0,
    this.mediaDownloaded = 0,
  });
}

/// Google Drive Sync Service for CogNotez
/// Handles OAuth2 authentication and synchronization with Google Drive
class GoogleDriveService extends ChangeNotifier {
  static const String _appFolderName = 'CogNotez_Backup';
  static const String _backupFileName = 'cognotez_sync_backup.json';
  static const String _mediaFolderName = 'media';
  static const String _e2eeEnabledKey = 'e2ee_enabled';
  static const String _e2eeSaltKey = 'e2ee_salt';
  static const String _e2eePassphraseKey = 'e2ee_passphrase';

  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
    ),
  );

  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: [
      'email',
      drive.DriveApi.driveFileScope,
      drive.DriveApi.driveMetadataReadonlyScope,
    ],
  );

  GoogleSignInAccount? _currentUser;
  drive.DriveApi? _driveApi;
  String? _appFolderId;
  String? _remoteFileId;
  String? _mediaFolderId;
  
  final MediaStorageService _mediaStorageService = MediaStorageService();
  
  SyncStatus _status = SyncStatus();
  SyncStatus get status => _status;

  DateTime? _lastSync;
  String? _localChecksum;
  String? _remoteChecksum;

  // Encryption settings
  bool _encryptionEnabled = false;
  String? _encryptionPassphrase;
  String? _encryptionSalt;
  
  bool get encryptionEnabled => _encryptionEnabled;
  bool get hasPassphrase => _encryptionPassphrase != null && _encryptionPassphrase!.isNotEmpty;

  GoogleDriveService() {
    _initialize();
  }

  /// Load E2EE settings from persistent storage
  Future<void> _loadE2EESettings() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _encryptionEnabled = prefs.getBool(_e2eeEnabledKey) ?? false;
      _encryptionSalt = prefs.getString(_e2eeSaltKey);
      
      // Load passphrase from secure storage
      if (_encryptionEnabled) {
        _encryptionPassphrase = await _secureStorage.read(key: _e2eePassphraseKey);
      }
      
      debugPrint('[GoogleDriveService] Loaded E2EE settings: enabled=$_encryptionEnabled, hasSalt=${_encryptionSalt != null}, hasPassphrase=$hasPassphrase');
      
      _updateStatus(_status.copyWith(
        encryptionEnabled: _encryptionEnabled,
        needsPassphrase: _encryptionEnabled && !hasPassphrase,
      ));
    } catch (e) {
      debugPrint('[GoogleDriveService] Failed to load E2EE settings: $e');
    }
  }

  /// Save E2EE settings to persistent storage
  Future<void> _saveE2EESettings() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_e2eeEnabledKey, _encryptionEnabled);
      if (_encryptionSalt != null) {
        await prefs.setString(_e2eeSaltKey, _encryptionSalt!);
      } else {
        await prefs.remove(_e2eeSaltKey);
      }
      
      // Save passphrase to secure storage
      if (_encryptionPassphrase != null && _encryptionPassphrase!.isNotEmpty) {
        await _secureStorage.write(key: _e2eePassphraseKey, value: _encryptionPassphrase);
      } else {
        await _secureStorage.delete(key: _e2eePassphraseKey);
      }
      
      debugPrint('[GoogleDriveService] Saved E2EE settings: enabled=$_encryptionEnabled, hasPassphrase=$hasPassphrase');
    } catch (e) {
      debugPrint('[GoogleDriveService] Failed to save E2EE settings: $e');
    }
  }

  /// Update encryption settings
  Future<void> updateEncryptionSettings({
    required bool enabled,
    String? passphrase,
  }) async {
    _encryptionEnabled = enabled;
    if (passphrase != null && passphrase.isNotEmpty) {
      _encryptionPassphrase = passphrase;
      // Derive deterministic salt from passphrase for multi-device compatibility
      _encryptionSalt = EncryptionService.deriveSaltFromPassphrase(passphrase);
    } else if (!enabled) {
      _encryptionPassphrase = null;
      _encryptionSalt = null;
    }
    
    // Persist E2EE settings
    await _saveE2EESettings();
    
    _updateStatus(_status.copyWith(
      encryptionEnabled: _encryptionEnabled,
      needsPassphrase: _encryptionEnabled && !hasPassphrase,
    ));
    
    debugPrint('[GoogleDriveService] Encryption settings updated: enabled=$_encryptionEnabled, hasPassphrase=$hasPassphrase');
  }

  /// Clear encryption passphrase (for security)
  void clearPassphrase() {
    _encryptionPassphrase = null;
  }

  Future<void> _initialize() async {
    try {
      // Load E2EE settings first
      await _loadE2EESettings();
      
      // Try to sign in silently (restore previous session)
      final account = await _googleSignIn.signInSilently();
      if (account != null) {
        await _setupDriveApi(account);
      }
    } catch (e) {
      debugPrint('[GoogleDriveService] Silent sign-in failed: $e');
    }
  }

  /// Sign in to Google
  Future<bool> signIn() async {
    try {
      _updateStatus(_status.copyWith(error: null));
      
      final account = await _googleSignIn.signIn();
      if (account == null) {
        _updateStatus(_status.copyWith(error: 'Sign in cancelled'));
        return false;
      }

      await _setupDriveApi(account);
      return true;
    } catch (e) {
      debugPrint('[GoogleDriveService] Sign in failed: $e');
      _updateStatus(_status.copyWith(
        isConnected: false,
        error: 'Sign in failed: ${e.toString()}',
      ));
      return false;
    }
  }

  /// Sign out from Google
  Future<void> signOut() async {
    try {
      await _googleSignIn.signOut();
      _currentUser = null;
      _driveApi = null;
      _appFolderId = null;
      _remoteFileId = null;
      _updateStatus(SyncStatus());
    } catch (e) {
      debugPrint('[GoogleDriveService] Sign out failed: $e');
    }
  }

  /// Disconnect (revoke access)
  Future<void> disconnect() async {
    try {
      await _googleSignIn.disconnect();
      _currentUser = null;
      _driveApi = null;
      _appFolderId = null;
      _remoteFileId = null;
      _mediaFolderId = null;
      _updateStatus(SyncStatus());
    } catch (e) {
      debugPrint('[GoogleDriveService] Disconnect failed: $e');
    }
  }

  Future<void> _setupDriveApi(GoogleSignInAccount account) async {
    _currentUser = account;
    
    final authHeaders = await account.authHeaders;
    final authenticateClient = GoogleAuthClient(authHeaders);
    _driveApi = drive.DriveApi(authenticateClient);

    // Ensure app folder exists
    await _ensureAppFolder();
    
    // Ensure media folder exists
    await _ensureMediaFolder();

    // Check for remote backup
    final hasRemote = await _findRemoteFile();

    _updateStatus(_status.copyWith(
      isConnected: true,
      userEmail: account.email,
      userName: account.displayName,
      userPhotoUrl: account.photoUrl,
      hasRemoteBackup: hasRemote,
      error: null,
    ));

    debugPrint('[GoogleDriveService] Connected as ${account.email}');
  }

  Future<void> _ensureAppFolder() async {
    if (_driveApi == null) return;

    try {
      // Search for existing folder
      final query = "name='$_appFolderName' and mimeType='application/vnd.google-apps.folder' and trashed=false";
      final result = await _driveApi!.files.list(
        q: query,
        spaces: 'drive',
        $fields: 'files(id,name)',
      );

      if (result.files != null && result.files!.isNotEmpty) {
        _appFolderId = result.files!.first.id;
        debugPrint('[GoogleDriveService] Found existing app folder: $_appFolderId');
      } else {
        // Create folder
        final folder = drive.File()
          ..name = _appFolderName
          ..mimeType = 'application/vnd.google-apps.folder';

        final created = await _driveApi!.files.create(folder);
        _appFolderId = created.id;
        debugPrint('[GoogleDriveService] Created app folder: $_appFolderId');
      }
    } catch (e) {
      debugPrint('[GoogleDriveService] Failed to ensure app folder: $e');
      rethrow;
    }
  }

  /// Ensure media folder exists inside app folder
  Future<void> _ensureMediaFolder() async {
    if (_driveApi == null || _appFolderId == null) return;

    try {
      // Search for existing media folder
      final query = "name='$_mediaFolderName' and mimeType='application/vnd.google-apps.folder' and '$_appFolderId' in parents and trashed=false";
      final result = await _driveApi!.files.list(
        q: query,
        spaces: 'drive',
        $fields: 'files(id,name)',
      );

      if (result.files != null && result.files!.isNotEmpty) {
        _mediaFolderId = result.files!.first.id;
        debugPrint('[GoogleDriveService] Found existing media folder: $_mediaFolderId');
      } else {
        // Create media folder inside app folder
        final folder = drive.File()
          ..name = _mediaFolderName
          ..mimeType = 'application/vnd.google-apps.folder'
          ..parents = [_appFolderId!];

        final created = await _driveApi!.files.create(folder);
        _mediaFolderId = created.id;
        debugPrint('[GoogleDriveService] Created media folder: $_mediaFolderId');
      }
    } catch (e) {
      debugPrint('[GoogleDriveService] Failed to ensure media folder: $e');
      // Don't rethrow - media folder is not critical
    }
  }

  Future<bool> _findRemoteFile() async {
    if (_driveApi == null || _appFolderId == null) return false;

    try {
      final query = "name='$_backupFileName' and '$_appFolderId' in parents and trashed=false";
      final result = await _driveApi!.files.list(
        q: query,
        spaces: 'drive',
        $fields: 'files(id,name,modifiedTime,size)',
        orderBy: 'modifiedTime desc',
      );

      if (result.files != null && result.files!.isNotEmpty) {
        _remoteFileId = result.files!.first.id;
        debugPrint('[GoogleDriveService] Found remote backup: $_remoteFileId');
        return true;
      }

      debugPrint('[GoogleDriveService] No remote backup found');
      return false;
    } catch (e) {
      debugPrint('[GoogleDriveService] Failed to find remote file: $e');
      return false;
    }
  }

  /// Calculate content checksum for comparison
  String _calculateChecksum(Map<String, dynamic> data) {
    // Create content-only snapshot (exclude sync metadata)
    final snapshot = {
      'notes': data['notes'] ?? {},
      'tags': data['tags'] ?? {},
      'note_tags': data['note_tags'] ?? {},
      'metadata': {
        ...(data['metadata'] as Map<String, dynamic>? ?? {}),
        'exportVersion': (data['metadata'] as Map<String, dynamic>?)?['exportVersion'] ?? '1.0',
      }..remove('exportedAt')..remove('exportedForSync'),
    };
    
    final str = jsonEncode(snapshot);
    int hash = 0;
    for (int i = 0; i < str.length; i++) {
      final char = str.codeUnitAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toRadixString(16);
  }

  /// Upload data to Google Drive
  /// If encryption is enabled, data will be encrypted before upload
  Future<bool> uploadData(Map<String, dynamic> data) async {
    if (_driveApi == null || _appFolderId == null) {
      throw Exception('Not connected to Google Drive');
    }

    try {
      final checksum = _calculateChecksum(data);
      
      // Encrypt data if encryption is enabled
      dynamic dataToUpload = data;
      if (_encryptionEnabled) {
        if (_encryptionPassphrase == null || _encryptionPassphrase!.isEmpty) {
          throw Exception('Encryption is enabled but no passphrase is set');
        }
        
        debugPrint('[GoogleDriveService] Encrypting data before upload...');
        dataToUpload = await EncryptionService.encryptSyncData(
          data,
          _encryptionPassphrase!,
          saltBase64: _encryptionSalt,
        );
        debugPrint('[GoogleDriveService] Data encrypted successfully');
      }
      
      final jsonData = jsonEncode(dataToUpload);
      final bytes = utf8.encode(jsonData);

      final media = drive.Media(
        Stream.value(bytes),
        bytes.length,
        contentType: 'application/json',
      );

      if (_remoteFileId != null) {
        // Update existing file
        debugPrint('[GoogleDriveService] Updating existing backup');
        await _driveApi!.files.update(
          drive.File()..name = _backupFileName,
          _remoteFileId!,
          uploadMedia: media,
        );
      } else {
        // Create new file
        debugPrint('[GoogleDriveService] Creating new backup');
        final file = drive.File()
          ..name = _backupFileName
          ..parents = [_appFolderId!];

        final created = await _driveApi!.files.create(
          file,
          uploadMedia: media,
        );
        _remoteFileId = created.id;
      }

      _remoteChecksum = checksum;
      _lastSync = DateTime.now();
      _updateStatus(_status.copyWith(
        lastSync: _lastSync,
        hasRemoteBackup: true,
        isEncrypted: _encryptionEnabled,
      ));

      debugPrint('[GoogleDriveService] Upload successful, checksum: $checksum, encrypted: $_encryptionEnabled');
      return true;
    } catch (e) {
      debugPrint('[GoogleDriveService] Upload failed: $e');
      rethrow;
    }
  }

  /// Download data from Google Drive
  /// If data is encrypted, it will be decrypted automatically (requires passphrase)
  /// Throws EncryptionRequiredException if data is encrypted but no passphrase is set
  Future<Map<String, dynamic>?> downloadData() async {
    if (_driveApi == null || _remoteFileId == null) {
      return null;
    }

    try {
      debugPrint('[GoogleDriveService] Downloading backup');
      
      final response = await _driveApi!.files.get(
        _remoteFileId!,
        downloadOptions: drive.DownloadOptions.fullMedia,
      ) as drive.Media;

      final List<int> bytes = [];
      await for (final chunk in response.stream) {
        bytes.addAll(chunk);
      }

      final jsonString = utf8.decode(bytes);
      var data = jsonDecode(jsonString) as Map<String, dynamic>;
      
      // Check if data is encrypted
      final isEncrypted = EncryptionService.isEncryptedSyncData(data);
      debugPrint('[GoogleDriveService] Downloaded data isEncrypted: $isEncrypted');
      
      if (isEncrypted) {
        _updateStatus(_status.copyWith(isEncrypted: true));
        
        if (_encryptionPassphrase == null || _encryptionPassphrase!.isEmpty) {
          // Data is encrypted but we don't have a passphrase
          _updateStatus(_status.copyWith(needsPassphrase: true));
          throw EncryptionRequiredException('Cloud data is encrypted. Please enter your E2EE passphrase.');
        }
        
        debugPrint('[GoogleDriveService] Decrypting downloaded data...');
        try {
          data = await EncryptionService.decryptSyncData(data, _encryptionPassphrase!);
          debugPrint('[GoogleDriveService] Data decrypted successfully');
          _updateStatus(_status.copyWith(needsPassphrase: false));
        } catch (e) {
          debugPrint('[GoogleDriveService] Decryption failed: $e');
          _updateStatus(_status.copyWith(needsPassphrase: true));
          throw EncryptionRequiredException('Decryption failed. Please check your passphrase.');
        }
      } else {
        _updateStatus(_status.copyWith(isEncrypted: false, needsPassphrase: false));
      }
      
      _remoteChecksum = _calculateChecksum(data);
      debugPrint('[GoogleDriveService] Download successful');
      
      return data;
    } catch (e) {
      if (e is EncryptionRequiredException) {
        rethrow;
      }
      debugPrint('[GoogleDriveService] Download failed: $e');
      rethrow;
    }
  }

  /// Perform full sync operation
  Future<SyncResult> sync({
    required Map<String, dynamic> localData,
    required Future<void> Function(Map<String, dynamic>) applyData,
  }) async {
    if (!_status.isConnected) {
      return SyncResult(
        success: false,
        action: 'error',
        message: 'Not connected to Google Drive',
      );
    }

    if (_status.isSyncing) {
      return SyncResult(
        success: false,
        action: 'error',
        message: 'Sync already in progress',
      );
    }

    _updateStatus(_status.copyWith(isSyncing: true, error: null));

    try {
      // Refresh remote file info
      await _findRemoteFile();

      final localChecksum = _calculateChecksum(localData);
      _localChecksum = localChecksum;

      Map<String, dynamic>? remoteData;
      String? remoteChecksum;

      // Download remote data if exists
      if (_remoteFileId != null) {
        try {
          remoteData = await downloadData();
          if (remoteData != null) {
            remoteChecksum = _calculateChecksum(remoteData);
            _remoteChecksum = remoteChecksum;
          }
        } on EncryptionRequiredException catch (e) {
          _updateStatus(_status.copyWith(
            isSyncing: false,
            error: e.message,
            needsPassphrase: true,
          ));
          return SyncResult(
            success: false,
            action: 'encryption_required',
            message: e.message,
            encryptionRequired: true,
          );
        }
      }

      debugPrint('[GoogleDriveService] Local checksum: $localChecksum');
      debugPrint('[GoogleDriveService] Remote checksum: $remoteChecksum');

      SyncResult result;

      if (remoteData == null) {
        // First time sync - upload local data
        debugPrint('[GoogleDriveService] First sync - uploading local data');
        await uploadData(localData);
        result = SyncResult(
          success: true,
          action: 'upload',
          message: 'Uploaded ${_countNotes(localData)} notes to Google Drive${_encryptionEnabled ? " (encrypted)" : ""}',
          notesUploaded: _countNotes(localData),
        );
      } else if (localChecksum == remoteChecksum) {
        // Data is identical - no sync needed
        debugPrint('[GoogleDriveService] Data is identical - no sync needed');
        result = SyncResult(
          success: true,
          action: 'none',
          message: 'Data is already in sync',
        );
      } else if (_isLocalEmpty(localData) && !_isLocalEmpty(remoteData)) {
        // Local is empty, remote has data - download
        debugPrint('[GoogleDriveService] Local empty - downloading remote data');
        await applyData(remoteData);
        result = SyncResult(
          success: true,
          action: 'download',
          message: 'Downloaded ${_countNotes(remoteData)} notes from Google Drive',
          notesDownloaded: _countNotes(remoteData),
        );
      } else {
        // Both have data - merge
        debugPrint('[GoogleDriveService] Merging local and remote data');
        final mergeResult = _mergeData(localData, remoteData);
        
        // Apply merged data locally
        await applyData(mergeResult.data);
        
        // Upload merged data to cloud
        await uploadData(mergeResult.data);
        
        result = SyncResult(
          success: true,
          action: 'merge',
          message: 'Merged data: ${mergeResult.localAdded} local notes, ${mergeResult.remoteAdded} remote notes${_encryptionEnabled ? " (encrypted)" : ""}',
          notesUploaded: mergeResult.localAdded,
          notesDownloaded: mergeResult.remoteAdded,
          conflicts: mergeResult.conflicts,
          mergedData: mergeResult.data,
        );
      }

      _lastSync = DateTime.now();
      _updateStatus(_status.copyWith(
        isSyncing: false,
        lastSync: _lastSync,
        error: null,
      ));

      return result;
    } on EncryptionRequiredException catch (e) {
      debugPrint('[GoogleDriveService] Encryption required: $e');
      _updateStatus(_status.copyWith(
        isSyncing: false,
        error: e.message,
        needsPassphrase: true,
      ));
      return SyncResult(
        success: false,
        action: 'encryption_required',
        message: e.message,
        encryptionRequired: true,
      );
    } catch (e) {
      debugPrint('[GoogleDriveService] Sync failed: $e');
      _updateStatus(_status.copyWith(
        isSyncing: false,
        error: 'Sync failed: ${e.toString()}',
      ));
      return SyncResult(
        success: false,
        action: 'error',
        message: 'Sync failed: ${e.toString()}',
      );
    }
  }

  int _countNotes(Map<String, dynamic> data) {
    final notes = data['notes'] as Map<String, dynamic>?;
    return notes?.length ?? 0;
  }

  bool _isLocalEmpty(Map<String, dynamic> data) {
    final notes = data['notes'] as Map<String, dynamic>?;
    return notes == null || notes.isEmpty;
  }

  /// Merge local and remote data
  _MergeResult _mergeData(Map<String, dynamic> localData, Map<String, dynamic> remoteData) {
    final mergedData = Map<String, dynamic>.from(localData);
    int localAdded = 0;
    int remoteAdded = 0;
    int conflicts = 0;

    // Timestamp when remote backup was created/exported. We use this to infer
    // deletions: if a note is missing remotely and the remote export is newer
    // than the note's last update, treat it as deleted and drop it locally.
    DateTime? remoteExportedAt;
    final remoteMetadata = remoteData['metadata'];
    if (remoteMetadata is Map<String, dynamic>) {
      final exportedAt = remoteMetadata['exportedAt']?.toString();
      final lastBackup = remoteMetadata['lastBackup']?.toString();
      final created = remoteMetadata['created']?.toString();
      final lastMerge = remoteMetadata['lastMerge']?.toString();
      remoteExportedAt = DateTime.tryParse(exportedAt ?? '') ??
          DateTime.tryParse(lastBackup ?? '') ??
          DateTime.tryParse(lastMerge ?? '') ??
          DateTime.tryParse(created ?? '');
    }

    // Merge notes
    final localNotes = Map<String, dynamic>.from(localData['notes'] as Map<String, dynamic>? ?? {});
    final remoteNotes = remoteData['notes'] as Map<String, dynamic>? ?? {};

    for (final entry in remoteNotes.entries) {
      final noteId = entry.key;
      final remoteNote = entry.value as Map<String, dynamic>;

      if (!localNotes.containsKey(noteId)) {
        // Note only exists in remote - add to local
        localNotes[noteId] = remoteNote;
        remoteAdded++;
      } else {
        // Note exists in both - use newer version
        final localNote = localNotes[noteId] as Map<String, dynamic>;
        final localUpdated = DateTime.tryParse(localNote['updated_at']?.toString() ?? '') ?? DateTime(1970);
        final remoteUpdated = DateTime.tryParse(remoteNote['updated_at']?.toString() ?? '') ?? DateTime(1970);

        if (remoteUpdated.isAfter(localUpdated)) {
          // Remote is newer
          localNotes[noteId] = remoteNote;
          conflicts++;
        } else if (localUpdated.isAfter(remoteUpdated)) {
          // Local is newer - keep local
          localAdded++;
        }
        // If same timestamp, keep local
      }
    }

    // Merge tags
    final localTags = Map<String, dynamic>.from(localData['tags'] as Map<String, dynamic>? ?? {});
    final remoteTags = remoteData['tags'] as Map<String, dynamic>? ?? {};

    for (final entry in remoteTags.entries) {
      if (!localTags.containsKey(entry.key)) {
        localTags[entry.key] = entry.value;
      }
    }

    // Merge note_tags
    final localNoteTags = Map<String, dynamic>.from(localData['note_tags'] as Map<String, dynamic>? ?? {});
    final remoteNoteTags = remoteData['note_tags'] as Map<String, dynamic>? ?? {};

    for (final entry in remoteNoteTags.entries) {
      if (!localNoteTags.containsKey(entry.key)) {
        localNoteTags[entry.key] = entry.value;
      }
    }

    // Handle remote deletions: if a note exists locally but is absent in
    // remote data, and the remote export is newer than the note's last update,
    // treat it as deleted and drop it from the merged dataset so it does not
    // get re-uploaded.
    if (remoteNotes.isNotEmpty && remoteExportedAt != null) {
      final notesToRemove = <String>{};
      for (final entry in localNotes.entries) {
        final noteId = entry.key;
        if (remoteNotes.containsKey(noteId)) continue;

        final localNote = entry.value as Map<String, dynamic>;
        final localUpdated = DateTime.tryParse(localNote['updated_at']?.toString() ?? '') ?? DateTime(1970);

        if (remoteExportedAt.isAfter(localUpdated)) {
          notesToRemove.add(noteId);
        }
      }

      for (final noteId in notesToRemove) {
        localNotes.remove(noteId);
        localNoteTags.remove(noteId);
      }
    }

    mergedData['notes'] = localNotes;
    mergedData['tags'] = localTags;
    mergedData['note_tags'] = localNoteTags;
    mergedData['metadata'] = {
      ...(localData['metadata'] as Map<String, dynamic>? ?? {}),
      'lastMerge': DateTime.now().toIso8601String(),
    };

    return _MergeResult(
      data: mergedData,
      localAdded: localAdded,
      remoteAdded: remoteAdded,
      conflicts: conflicts,
    );
  }

  /// Delete remote backup
  Future<bool> deleteRemoteBackup() async {
    if (_driveApi == null || _remoteFileId == null) {
      return false;
    }

    try {
      await _driveApi!.files.delete(_remoteFileId!);
      _remoteFileId = null;
      _updateStatus(_status.copyWith(hasRemoteBackup: false));
      debugPrint('[GoogleDriveService] Remote backup deleted');
      return true;
    } catch (e) {
      debugPrint('[GoogleDriveService] Failed to delete remote backup: $e');
      return false;
    }
  }

  /// Get remote backup info
  Future<Map<String, dynamic>?> getRemoteBackupInfo() async {
    if (_driveApi == null || _remoteFileId == null) {
      return null;
    }

    try {
      final file = await _driveApi!.files.get(
        _remoteFileId!,
        $fields: 'id,name,size,modifiedTime,createdTime',
      ) as drive.File;

      return {
        'id': file.id,
        'name': file.name,
        'size': file.size,
        'modifiedTime': file.modifiedTime?.toIso8601String(),
        'createdTime': file.createdTime?.toIso8601String(),
      };
    } catch (e) {
      debugPrint('[GoogleDriveService] Failed to get backup info: $e');
      return null;
    }
  }

  void _updateStatus(SyncStatus newStatus) {
    _status = newStatus;
    notifyListeners();
  }

  /// Check if connected to Google Drive
  bool get isConnected => _status.isConnected;

  /// Get last sync time
  DateTime? get lastSync => _lastSync;

  // ============= MEDIA SYNC METHODS =============

  /// Extract media file IDs from notes content
  Set<String> _extractMediaFileIds(Map<String, dynamic> data) {
    final mediaIds = <String>{};
    final notes = data['notes'] as Map<String, dynamic>? ?? {};
    
    for (final noteData in notes.values) {
      final note = noteData as Map<String, dynamic>;
      final content = note['content'] as String? ?? '';
      mediaIds.addAll(_mediaStorageService.extractMediaIdsFromContent(content));
    }
    
    return mediaIds;
  }

  /// List all media files in the remote media folder
  Future<Map<String, RemoteMediaFile>> listRemoteMediaFiles() async {
    if (_driveApi == null || _mediaFolderId == null) return {};

    final files = <String, RemoteMediaFile>{};
    
    try {
      String? pageToken;
      do {
        final result = await _driveApi!.files.list(
          q: "'$_mediaFolderId' in parents and trashed=false",
          spaces: 'drive',
          $fields: 'nextPageToken,files(id,name,size,modifiedTime,mimeType)',
          pageToken: pageToken,
          pageSize: 100,
        );

        if (result.files != null) {
          for (final file in result.files!) {
            if (file.name != null && file.id != null) {
              // Extract media ID from filename (remove extension if present)
              final mediaId = file.name!.contains('.')
                  ? file.name!.substring(0, file.name!.lastIndexOf('.'))
                  : file.name!;
              
              files[mediaId] = RemoteMediaFile(
                id: file.id!,
                name: file.name!,
                mediaId: mediaId,
                size: int.tryParse(file.size ?? '0') ?? 0,
                modifiedTime: file.modifiedTime ?? DateTime.now(),
                mimeType: file.mimeType ?? 'application/octet-stream',
              );
            }
          }
        }
        
        pageToken = result.nextPageToken;
      } while (pageToken != null);

      debugPrint('[GoogleDriveService] Found ${files.length} remote media files');
    } catch (e) {
      debugPrint('[GoogleDriveService] Failed to list remote media files: $e');
    }

    return files;
  }

  /// Upload a media file to Google Drive
  Future<bool> uploadMediaFile(String mediaId, Uint8List data, {String? extension, String? mimeType}) async {
    if (_driveApi == null || _mediaFolderId == null) {
      debugPrint('[GoogleDriveService] Cannot upload media: not connected or no media folder');
      return false;
    }

    try {
      final fileName = extension != null ? '$mediaId$extension' : mediaId;
      final contentType = mimeType ?? 'application/octet-stream';
      
      // Check if file already exists
      final query = "name='$fileName' and '$_mediaFolderId' in parents and trashed=false";
      final existing = await _driveApi!.files.list(
        q: query,
        spaces: 'drive',
        $fields: 'files(id)',
      );

      final media = drive.Media(
        Stream.value(data),
        data.length,
        contentType: contentType,
      );

      if (existing.files != null && existing.files!.isNotEmpty) {
        // Update existing file
        final fileId = existing.files!.first.id!;
        await _driveApi!.files.update(
          drive.File()..name = fileName,
          fileId,
          uploadMedia: media,
        );
        debugPrint('[GoogleDriveService] Updated media file: $fileName');
      } else {
        // Create new file
        final file = drive.File()
          ..name = fileName
          ..parents = [_mediaFolderId!];

        await _driveApi!.files.create(
          file,
          uploadMedia: media,
        );
        debugPrint('[GoogleDriveService] Uploaded new media file: $fileName');
      }

      return true;
    } catch (e) {
      debugPrint('[GoogleDriveService] Failed to upload media file $mediaId: $e');
      return false;
    }
  }

  /// Download a media file from Google Drive
  Future<Uint8List?> downloadMediaFile(String driveFileId) async {
    if (_driveApi == null) return null;

    try {
      final response = await _driveApi!.files.get(
        driveFileId,
        downloadOptions: drive.DownloadOptions.fullMedia,
      ) as drive.Media;

      final List<int> bytes = [];
      await for (final chunk in response.stream) {
        bytes.addAll(chunk);
      }

      debugPrint('[GoogleDriveService] Downloaded media file: ${bytes.length} bytes');
      return Uint8List.fromList(bytes);
    } catch (e) {
      debugPrint('[GoogleDriveService] Failed to download media file $driveFileId: $e');
      return null;
    }
  }

  /// Sync media files between local and remote
  /// Returns a tuple of (uploaded count, downloaded count)
  Future<({int uploaded, int downloaded})> syncMediaFiles(Map<String, dynamic> data, {
    void Function(String status)? onProgress,
  }) async {
    if (!_status.isConnected || _mediaFolderId == null) {
      debugPrint('[GoogleDriveService] Cannot sync media: not connected');
      return (uploaded: 0, downloaded: 0);
    }

    int uploaded = 0;
    int downloaded = 0;

    try {
      onProgress?.call('Scanning media files...');
      
      // Extract all media IDs referenced in notes
      final referencedMediaIds = _extractMediaFileIds(data);
      debugPrint('[GoogleDriveService] Found ${referencedMediaIds.length} media references in notes');

      // Get list of remote media files
      final remoteFiles = await listRemoteMediaFiles();
      debugPrint('[GoogleDriveService] Found ${remoteFiles.length} remote media files');

      // Get list of local media files
      final localFiles = await _mediaStorageService.listLocalMediaFiles();
      final localMediaIds = localFiles.map((f) => f.id).toSet();
      debugPrint('[GoogleDriveService] Found ${localFiles.length} local media files');

      // Upload local files that aren't in remote (and are referenced in notes)
      for (final localFile in localFiles) {
        // Only sync files that are referenced in notes
        if (!referencedMediaIds.contains(localFile.id)) {
          continue;
        }
        
        if (!remoteFiles.containsKey(localFile.id)) {
          onProgress?.call('Uploading media: ${localFile.name}');
          
          final file = await _mediaStorageService.getMediaFile(localFile.id);
          if (file != null) {
            final data = await file.readAsBytes();
            final extension = localFile.name.contains('.')
                ? localFile.name.substring(localFile.name.lastIndexOf('.'))
                : null;
            final mimeType = extension != null
                ? _mediaStorageService.getMimeTypeFromExtension(extension)
                : 'application/octet-stream';
            
            final success = await uploadMediaFile(
              localFile.id,
              data,
              extension: extension,
              mimeType: mimeType,
            );
            if (success) uploaded++;
          }
        }
      }

      // Download remote files that aren't local (and are referenced in notes)
      for (final entry in remoteFiles.entries) {
        final mediaId = entry.key;
        final remoteFile = entry.value;
        
        // Only sync files that are referenced in notes
        if (!referencedMediaIds.contains(mediaId)) {
          continue;
        }
        
        if (!localMediaIds.contains(mediaId)) {
          onProgress?.call('Downloading media: ${remoteFile.name}');
          
          final data = await downloadMediaFile(remoteFile.id);
          if (data != null) {
            final extension = remoteFile.name.contains('.')
                ? remoteFile.name.substring(remoteFile.name.lastIndexOf('.'))
                : null;
            await _mediaStorageService.saveMediaFile(mediaId, data, extension: extension);
            downloaded++;
          }
        }
      }

      debugPrint('[GoogleDriveService] Media sync complete: $uploaded uploaded, $downloaded downloaded');
      onProgress?.call('Media sync complete');
    } catch (e) {
      debugPrint('[GoogleDriveService] Media sync failed: $e');
    }

    return (uploaded: uploaded, downloaded: downloaded);
  }

  /// Sync with media files included
  Future<SyncResult> syncWithMedia({
    required Map<String, dynamic> localData,
    required Future<void> Function(Map<String, dynamic>) applyData,
    void Function(String status)? onProgress,
  }) async {
    // First, perform the regular sync
    onProgress?.call('Syncing notes...');
    final result = await sync(localData: localData, applyData: applyData);
    
    if (!result.success) {
      return result;
    }

    // Then sync media files
    onProgress?.call('Syncing media files...');
    final mergedData = result.mergedData ?? localData;
    final mediaResult = await syncMediaFiles(mergedData, onProgress: onProgress);

    // Return updated result with media counts
    return SyncResult(
      success: result.success,
      action: result.action,
      message: result.message,
      notesUploaded: result.notesUploaded,
      notesDownloaded: result.notesDownloaded,
      conflicts: result.conflicts,
      mergedData: result.mergedData,
      encryptionRequired: result.encryptionRequired,
      mediaUploaded: mediaResult.uploaded,
      mediaDownloaded: mediaResult.downloaded,
    );
  }
}

class _MergeResult {
  final Map<String, dynamic> data;
  final int localAdded;
  final int remoteAdded;
  final int conflicts;

  _MergeResult({
    required this.data,
    required this.localAdded,
    required this.remoteAdded,
    required this.conflicts,
  });
}

/// Exception thrown when encrypted data requires a passphrase
class EncryptionRequiredException implements Exception {
  final String message;
  EncryptionRequiredException(this.message);
  
  @override
  String toString() => message;
}

/// Information about a remote media file
class RemoteMediaFile {
  final String id; // Google Drive file ID
  final String name; // File name with extension
  final String mediaId; // CogNotez media ID (without extension)
  final int size;
  final DateTime modifiedTime;
  final String mimeType;

  RemoteMediaFile({
    required this.id,
    required this.name,
    required this.mediaId,
    required this.size,
    required this.modifiedTime,
    required this.mimeType,
  });
}
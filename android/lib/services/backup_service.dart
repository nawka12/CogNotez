import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:file_picker/file_picker.dart';
import '../models/note.dart';
import '../models/tag.dart';
import 'database_service.dart';

class BackupData {
  final String version;
  final DateTime createdAt;
  final List<Note> notes;
  final List<Tag> tags;

  BackupData({
    required this.version,
    required this.createdAt,
    required this.notes,
    required this.tags,
  });

  Map<String, dynamic> toJson() {
    return {
      'version': version,
      'created_at': createdAt.toIso8601String(),
      'notes': notes.map((n) => n.toJson()).toList(),
      'tags': tags.map((t) => t.toJson()).toList(),
    };
  }

  /// Serialize to a JSON structure that matches the desktop (Electron) schema.
  ///
  /// This is **not** used by the current Android backup/export flow, but is
  /// provided so that future Google Drive sync and cross‑platform backup
  /// features can share a common, desktop‑compatible payload.
  Map<String, dynamic> toDesktopCompatibleJson() {
    final notesMap = <String, dynamic>{};
    for (final note in notes) {
      final wordCount = note.wordCount;
      final charCount = note.content.length;

      // Generate preview from content (first 200 chars, cleaned up)
      String preview = '';
      if (!note.isPasswordProtected && note.content.isNotEmpty) {
        // Remove markdown headers and excessive whitespace
        final cleanContent = note.content
            .replaceAll(RegExp(r'^#+\s*', multiLine: true),
                '') // Remove markdown headers
            .replaceAll(RegExp(r'\n+'), ' ') // Replace newlines with spaces
            .replaceAll(RegExp(r'\s+'), ' ') // Collapse multiple spaces
            .trim();
        preview = cleanContent.length > 200
            ? '${cleanContent.substring(0, 200)}...'
            : cleanContent;
      }

      // Restore desktop-specific fields from metadata if they were preserved
      final metadata = note.metadata;
      final category = metadata?['desktop_category'];
      final isArchived = metadata?['desktop_is_archived'] as bool? ?? false;
      final collaboration =
          metadata?['desktop_collaboration'] as Map<String, dynamic>? ??
              {
                'is_shared': false,
                'shared_with': <dynamic>[],
                'last_edited_by': null,
                'edit_history': <dynamic>[],
                'google_drive_file_id': null,
                'google_drive_share_link': null,
              };
      final passwordHash = metadata?['desktop_password_hash'] as String?;

      notesMap[note.id] = {
        'id': note.id,
        'title': note.title,
        'content': note.content,
        'preview': preview,
        'tags': note.tags,
        'category': category,
        'is_favorite': false,  // Deprecated: favorites feature removed
        'is_archived': isArchived,
        'pinned': note.isPinned,
        'password_protected': note.isPasswordProtected,
        // When password protection is removed, ensure all encryption fields are cleared
        'password_hash': note.isPasswordProtected ? passwordHash : null,
        'encrypted_content':
            note.isPasswordProtected ? note.encryptedContent : null,
        'word_count': wordCount,
        'char_count': charCount,
        'created_at': note.createdAt.toIso8601String(),
        'updated_at': note.updatedAt.toIso8601String(),
        // Desktop stores both ISO strings and Date objects; the ISO strings
        // are enough for its logic and match what it persists.
        'created': note.createdAt.toIso8601String(),
        'modified': note.updatedAt.toIso8601String(),
        'collaboration': collaboration,
      };
    }

    final tagsMap = <String, dynamic>{};
    for (final tag in tags) {
      tagsMap[tag.id] = {
        'id': tag.id,
        'name': tag.name,
        'color': tag.color ?? '#BDABE3',
        'created_at': tag.createdAt.toIso8601String(),
      };
    }

    final nowIso = DateTime.now().toIso8601String();

    return {
      'notes': notesMap,
      'ai_conversations': <String, dynamic>{},
      'settings': <String, dynamic>{},
      'tags': tagsMap,
      // Android stores tags directly on notes; desktop also has a note_tags
      // table for some operations. For compatibility it is safe to keep this
      // empty as desktop code still reads note.tags.
      'note_tags': <String, dynamic>{},
      'encryption': {
        'enabled': notes.any((n) => n.isPasswordProtected),
        'passphrase': null,
        'saltBase64': null,
        'iterations': 210000,
      },
      'sync': {
        'enabled': false,
        'provider': null,
        'lastSync': null,
        'lastSyncVersion': null,
        'remoteFileId': null,
        'localChecksum': null,
        'remoteChecksum': null,
        'syncConflicts': <dynamic>[],
        'autoSync': false,
        'syncInterval': 300000,
      },
      'metadata': {
        'version': '1.0',
        'lastBackup': createdAt.toIso8601String(),
        'created': createdAt.toIso8601String(),
        'exportedAt': nowIso,
        'exportVersion': '1.0',
      },
    };
  }

  factory BackupData.fromJson(Map<String, dynamic> json) {
    // Detect desktop backup format (Electron/localStorage-based JSON)
    // Desktop export uses an object map for notes and tags:
    // {
    //   "notes": { "noteId": { ...noteFields } },
    //   "tags": { "tagId": { ...tagFields } },
    //   "metadata": { "exportedAt": "...", "exportVersion": "1.0" }
    // }
    final notesField = json['notes'];
    final tagsField = json['tags'];

    final bool looksLikeDesktopBackup =
        notesField is Map<String, dynamic> || tagsField is Map<String, dynamic>;

    if (looksLikeDesktopBackup) {
      // Desktop backup path: map object -> Android models.
      final exportedAt = (json['metadata'] is Map<String, dynamic>)
          ? (json['metadata']['exportedAt'] as String?)
          : null;

      final createdAt = exportedAt != null
          ? DateTime.tryParse(exportedAt) ?? DateTime.now()
          : DateTime.now();

      final desktopNotesMap = (notesField is Map<String, dynamic>)
          ? notesField
          : <String, dynamic>{};
      final desktopTagsMap =
          (tagsField is Map<String, dynamic>) ? tagsField : <String, dynamic>{};

      final tags = desktopTagsMap.values
          .whereType<Map<String, dynamic>>()
          .map((t) {
            final id = (t['id'] as String?) ?? '';
            final name = (t['name'] as String?) ?? '';
            if (id.isEmpty || name.isEmpty) {
              // Skip malformed tags
              return null;
            }
            return Tag(
              id: id,
              name: name,
              color: t['color'] as String?,
              createdAt: DateTime.tryParse(t['created_at'] as String? ?? '') ??
                  createdAt,
            );
          })
          .whereType<Tag>()
          .toList();

      final notes = desktopNotesMap.values
          .whereType<Map<String, dynamic>>()
          .map((n) {
            final id = (n['id'] as String?) ?? '';
            if (id.isEmpty) {
              return null;
            }

            final createdAtStr =
                n['created_at'] as String? ?? n['created']?.toString();
            final updatedAtStr =
                n['updated_at'] as String? ?? n['modified']?.toString();

            final createdAtNote =
                DateTime.tryParse(createdAtStr ?? '') ?? createdAt;
            final updatedAtNote =
                DateTime.tryParse(updatedAtStr ?? '') ?? createdAtNote;

            final encryptedContent = n['encrypted_content'] as String?;

            // Desktop marks password-protected notes with password_protected flag
            // and stores encrypted_content; Android uses isPasswordProtected + encryptedContent.
            final isPasswordProtected = (n['password_protected'] as bool?) ??
                (encryptedContent != null);

            // Desktop uses 'pinned' field for pinned notes
            final isPinned = (n['pinned'] as bool?) ?? false;

            // Preserve desktop-specific fields in metadata so they survive
            // round-trips between Android and desktop
            final desktopMetadata = <String, dynamic>{};

            // Preserve category
            if (n['category'] != null) {
              desktopMetadata['desktop_category'] = n['category'];
            }

            // Preserve is_archived
            final isArchived = n['is_archived'] as bool? ?? false;
            if (isArchived) {
              desktopMetadata['desktop_is_archived'] = true;
            }

            // Preserve password_hash (desktop uses different encryption)
            if (n['password_hash'] != null) {
              desktopMetadata['desktop_password_hash'] = n['password_hash'];
            }

            // Preserve collaboration data
            if (n['collaboration'] != null &&
                n['collaboration'] is Map<String, dynamic>) {
              final collab = n['collaboration'] as Map<String, dynamic>;
              // Only preserve if there's meaningful collaboration data
              if (collab['is_shared'] == true ||
                  collab['google_drive_file_id'] != null ||
                  (collab['shared_with'] is List &&
                      (collab['shared_with'] as List).isNotEmpty)) {
                desktopMetadata['desktop_collaboration'] = collab;
              }
            }

            return Note(
              id: id,
              title: (n['title'] as String?) ?? '',
              content: (n['content'] as String?) ?? '',
              createdAt: createdAtNote,
              updatedAt: updatedAtNote,
              tags: (n['tags'] is List)
                  ? List<String>.from(n['tags'] as List)
                  : const [],
              isPasswordProtected: isPasswordProtected,
              encryptedContent: encryptedContent,
              // Desktop stores all encryption parameters inside the
              // encrypted_content envelope (JSON string). Android uses
              // per-note salt/IV fields, so we leave these null and handle
              // desktop envelopes specially during decryption.
              encryptionSalt: null,
              encryptionIv: null,
              metadata: desktopMetadata.isNotEmpty ? desktopMetadata : null,
              isPinned: isPinned,
            );
          })
          .whereType<Note>()
          .toList();

      return BackupData(
        version: (json['metadata'] is Map<String, dynamic>)
            ? ((json['metadata']['exportVersion'] as String?) ?? 'desktop-1.0')
            : 'desktop-1.0',
        createdAt: createdAt,
        notes: notes,
        tags: tags,
      );
    }

    // Native Android JSON backup path
    // Validate and normalize input to provide clearer error messages instead of
    // low‑level type cast failures like "type 'Null' is not a subtype of type 'String'".
    final rawCreatedAt = json['created_at'];
    if (rawCreatedAt == null || rawCreatedAt is! String) {
      throw const FormatException(
        'Invalid backup file: missing or invalid "created_at" field.',
      );
    }

    final rawNotes = json['notes'];
    if (rawNotes == null || rawNotes is! List) {
      throw const FormatException(
        'Invalid backup file: "notes" must be a list of notes.',
      );
    }

    final rawTags = json['tags'];
    if (rawTags == null || rawTags is! List) {
      throw const FormatException(
        'Invalid backup file: "tags" must be a list of tags.',
      );
    }

    return BackupData(
      version:
          (json['version'] is String) ? json['version'] as String : '1.0.0',
      createdAt: DateTime.parse(rawCreatedAt),
      notes: rawNotes
          .whereType<Map<String, dynamic>>()
          .map((n) => Note.fromJson(n))
          .toList(),
      tags: rawTags
          .whereType<Map<String, dynamic>>()
          .map((t) => Tag.fromJson(t))
          .toList(),
    );
  }
}

class BackupService {
  final DatabaseService _databaseService;
  static const String backupVersion = '1.0.0';

  BackupService(this._databaseService);

  /// Create a backup of all notes and tags
  Future<BackupData> createBackup() async {
    final notes = await _databaseService.getAllNotes();
    final tags = await _databaseService.getAllTags();

    return BackupData(
      version: backupVersion,
      createdAt: DateTime.now(),
      notes: notes,
      tags: tags,
    );
  }

  /// Export backup to JSON file and share it
  Future<void> exportBackup({bool share = true}) async {
    final backup = await createBackup();
    // Use desktop‑compatible JSON so that backups are interchangeable between
    // Android and the Electron desktop app.
    final json = jsonEncode(backup.toDesktopCompatibleJson());

    final directory = await getApplicationDocumentsDirectory();
    final timestamp =
        DateTime.now().toIso8601String().replaceAll(':', '-').split('.').first;
    final fileName = 'cognotez_backup_$timestamp.json';
    final file = File('${directory.path}/$fileName');

    await file.writeAsString(json);

    if (share) {
      await Share.shareXFiles(
        [XFile(file.path)],
        subject: 'CogNotez Backup',
        text: 'CogNotez backup created on ${backup.createdAt}',
      );
    }
  }

  /// Import backup from JSON file
  Future<BackupResult> importBackup() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['json'],
    );

    if (result == null || result.files.isEmpty) {
      return BackupResult(
        success: false,
        message: 'No file selected',
        notesImported: 0,
        tagsImported: 0,
      );
    }

    final file = File(result.files.first.path!);
    final jsonString = await file.readAsString();

    return await restoreFromJson(jsonString);
  }

  /// Restore from JSON string
  Future<BackupResult> restoreFromJson(String jsonString,
      {bool merge = true}) async {
    try {
      final json = jsonDecode(jsonString) as Map<String, dynamic>;
      final backup = BackupData.fromJson(json);

      int notesImported = 0;
      int tagsImported = 0;
      int notesSkipped = 0;
      int tagsSkipped = 0;

      // Import tags first
      final existingTags = await _databaseService.getAllTags();
      final existingTagIds = existingTags.map((t) => t.id).toSet();
      final existingTagNames =
          existingTags.map((t) => t.name.toLowerCase()).toSet();

      for (final tag in backup.tags) {
        if (merge && existingTagIds.contains(tag.id)) {
          tagsSkipped++;
          continue;
        }

        // Check if tag with same name exists
        if (merge && existingTagNames.contains(tag.name.toLowerCase())) {
          tagsSkipped++;
          continue;
        }

        await _databaseService.createTag(tag);
        tagsImported++;
      }

      // Import notes
      final existingNotes = await _databaseService.getAllNotes();
      final existingNoteIds = existingNotes.map((n) => n.id).toSet();

      for (final note in backup.notes) {
        if (merge && existingNoteIds.contains(note.id)) {
          notesSkipped++;
          continue;
        }

        await _databaseService.createNote(note);
        notesImported++;
      }

      return BackupResult(
        success: true,
        message: 'Backup restored successfully',
        notesImported: notesImported,
        tagsImported: tagsImported,
        notesSkipped: notesSkipped,
        tagsSkipped: tagsSkipped,
      );
    } catch (e) {
      return BackupResult(
        success: false,
        message: 'Failed to restore backup: $e',
        notesImported: 0,
        tagsImported: 0,
      );
    }
  }

  /// Export data in desktop-compatible format for Google Drive sync
  /// Returns a Map<String, dynamic> that can be serialized to JSON
  Future<Map<String, dynamic>> exportToDesktopFormat() async {
    final backup = await createBackup();
    return backup.toDesktopCompatibleJson();
  }

  /// Import data from desktop-compatible format (used by Google Drive sync)
  /// This performs a merge operation, keeping existing notes and adding new ones
  Future<BackupResult> importFromDesktopFormat(
      Map<String, dynamic> data) async {
    try {
      final backup = BackupData.fromJson(data);

      int notesImported = 0;
      int tagsImported = 0;
      int notesSkipped = 0;
      int tagsSkipped = 0;
      int notesUpdated = 0;

      // Import tags first
      final existingTags = await _databaseService.getAllTags();
      final existingTagIds = existingTags.map((t) => t.id).toSet();
      final existingTagNames =
          existingTags.map((t) => t.name.toLowerCase()).toSet();

      for (final tag in backup.tags) {
        if (existingTagIds.contains(tag.id)) {
          tagsSkipped++;
          continue;
        }

        // Check if tag with same name exists
        if (existingTagNames.contains(tag.name.toLowerCase())) {
          tagsSkipped++;
          continue;
        }

        await _databaseService.createTag(tag);
        tagsImported++;
      }

      // Import notes with update support for sync
      final existingNotes = await _databaseService.getAllNotes();
      final existingNotesMap = {for (var n in existingNotes) n.id: n};

      for (final note in backup.notes) {
        if (existingNotesMap.containsKey(note.id)) {
          // Note exists - check if incoming is newer
          final existingNote = existingNotesMap[note.id]!;
          if (note.updatedAt.isAfter(existingNote.updatedAt)) {
            // Update existing note with newer data
            await _databaseService.updateNote(note);
            notesUpdated++;
          } else {
            notesSkipped++;
          }
          continue;
        }

        // New note - create it
        await _databaseService.createNote(note);
        notesImported++;
      }

      return BackupResult(
        success: true,
        message: 'Sync data imported successfully',
        notesImported: notesImported,
        tagsImported: tagsImported,
        notesSkipped: notesSkipped + notesUpdated,
        tagsSkipped: tagsSkipped,
      );
    } catch (e) {
      return BackupResult(
        success: false,
        message: 'Failed to import sync data: $e',
        notesImported: 0,
        tagsImported: 0,
      );
    }
  }

  /// Get backup statistics
  Future<BackupStats> getBackupStats() async {
    final notes = await _databaseService.getAllNotes();
    final tags = await _databaseService.getAllTags();

    int totalWords = 0;
    int protectedNotes = 0;

    for (final note in notes) {
      totalWords += note.wordCount;
      if (note.isPasswordProtected) protectedNotes++;
    }

    return BackupStats(
      totalNotes: notes.length,
      totalTags: tags.length,
      totalWords: totalWords,
      protectedNotes: protectedNotes,
    );
  }
}

class BackupResult {
  final bool success;
  final String message;
  final int notesImported;
  final int tagsImported;
  final int notesSkipped;
  final int tagsSkipped;

  BackupResult({
    required this.success,
    required this.message,
    required this.notesImported,
    required this.tagsImported,
    this.notesSkipped = 0,
    this.tagsSkipped = 0,
  });
}

class BackupStats {
  final int totalNotes;
  final int totalTags;
  final int totalWords;
  final int protectedNotes;

  BackupStats({
    required this.totalNotes,
    required this.totalTags,
    required this.totalWords,
    required this.protectedNotes,
  });
}

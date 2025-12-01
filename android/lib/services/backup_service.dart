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

  factory BackupData.fromJson(Map<String, dynamic> json) {
    return BackupData(
      version: json['version'] as String? ?? '1.0.0',
      createdAt: DateTime.parse(json['created_at'] as String),
      notes: (json['notes'] as List).map((n) => Note.fromJson(n as Map<String, dynamic>)).toList(),
      tags: (json['tags'] as List).map((t) => Tag.fromJson(t as Map<String, dynamic>)).toList(),
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
    final json = jsonEncode(backup.toJson());
    
    final directory = await getApplicationDocumentsDirectory();
    final timestamp = DateTime.now().toIso8601String().replaceAll(':', '-').split('.').first;
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
  Future<BackupResult> restoreFromJson(String jsonString, {bool merge = true}) async {
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
      final existingTagNames = existingTags.map((t) => t.name.toLowerCase()).toSet();

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

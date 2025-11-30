import 'dart:convert';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import '../models/note.dart';
import '../models/tag.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('cognotez.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(
      path,
      version: 1,
      onCreate: _createDB,
    );
  }

  Future<void> _createDB(Database db, int version) async {
    // Notes table
    await db.execute('''
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_password_protected INTEGER NOT NULL DEFAULT 0,
        encrypted_content TEXT,
        metadata TEXT
      )
    ''');

    // Tags table
    await db.execute('''
      CREATE TABLE tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        created_at TEXT NOT NULL
      )
    ''');

    // Note-Tag junction table
    await db.execute('''
      CREATE TABLE note_tags (
        note_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (note_id, tag_id),
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    ''');

    // Settings table
    await db.execute('''
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    ''');

    // AI conversations table
    await db.execute('''
      CREATE TABLE ai_conversations (
        id TEXT PRIMARY KEY,
        note_id TEXT,
        messages TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    ''');
  }

  // Helper method to convert database row to Note
  Note _noteFromDbRow(Map<String, dynamic> row, List<String> tags) {
    Map<String, dynamic>? metadata;
    if (row['metadata'] != null) {
      try {
        metadata = jsonDecode(row['metadata'] as String) as Map<String, dynamic>;
      } catch (e) {
        // If metadata can't be parsed, set to null
        metadata = null;
      }
    }
    
    return Note(
      id: row['id'] as String,
      title: row['title'] as String,
      content: row['content'] as String? ?? '',
      createdAt: DateTime.parse(row['created_at'] as String),
      updatedAt: DateTime.parse(row['updated_at'] as String),
      tags: tags,
      isPasswordProtected: (row['is_password_protected'] as int? ?? 0) == 1,
      encryptedContent: row['encrypted_content'] as String?,
      metadata: metadata,
    );
  }

  // Helper method to convert Note to database row map
  Map<String, dynamic> _noteToDbRow(Note note) {
    return {
      'id': note.id,
      'title': note.title,
      'content': note.content,
      'created_at': note.createdAt.toIso8601String(),
      'updated_at': note.updatedAt.toIso8601String(),
      'is_password_protected': note.isPasswordProtected ? 1 : 0,
      'encrypted_content': note.encryptedContent,
      'metadata': note.metadata != null ? jsonEncode(note.metadata) : null,
    };
  }

  // Notes CRUD
  Future<String> insertNote(Note note) async {
    final db = await database;
    
    // Create note map without tags (tags are stored in junction table)
    final noteMap = _noteToDbRow(note);
    
    await db.insert('notes', noteMap, conflictAlgorithm: ConflictAlgorithm.replace);
    
    // Insert tags in junction table
    await db.delete('note_tags', where: 'note_id = ?', whereArgs: [note.id]);
    if (note.tags.isNotEmpty) {
      for (final tagId in note.tags) {
        await db.insert(
          'note_tags',
          {'note_id': note.id, 'tag_id': tagId},
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
    }
    
    return note.id;
  }

  Future<List<Note>> getAllNotes() async {
    final db = await database;
    final notes = await db.query('notes', orderBy: 'updated_at DESC');
    
    final List<Note> noteList = [];
    for (final noteMap in notes) {
      // Load tags for this note
      final tagMaps = await db.query(
        'note_tags',
        where: 'note_id = ?',
        whereArgs: [noteMap['id'] as String],
      );
      final tags = tagMaps.map((map) => map['tag_id'] as String).toList();
      noteList.add(_noteFromDbRow(noteMap, tags));
    }
    
    return noteList;
  }

  Future<Note?> getNoteById(String id) async {
    final db = await database;
    final notes = await db.query('notes', where: 'id = ?', whereArgs: [id]);
    
    if (notes.isEmpty) return null;
    
    // Load tags
    final tagMaps = await db.query(
      'note_tags',
      where: 'note_id = ?',
      whereArgs: [id],
    );
    final tags = tagMaps.map((map) => map['tag_id'] as String).toList();
    
    return _noteFromDbRow(notes.first, tags);
  }

  Future<int> updateNote(Note note) async {
    final db = await database;
    
    // Create note map without tags (tags are stored in junction table)
    final noteMap = _noteToDbRow(note);
    
    // Update note
    final result = await db.update('notes', noteMap, where: 'id = ?', whereArgs: [note.id]);
    
    // Update tags
    await db.delete('note_tags', where: 'note_id = ?', whereArgs: [note.id]);
    for (final tagId in note.tags) {
      await db.insert(
        'note_tags',
        {'note_id': note.id, 'tag_id': tagId},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    
    return result;
  }

  Future<int> deleteNote(String id) async {
    final db = await database;
    // Tags will be deleted automatically due to CASCADE
    return await db.delete('notes', where: 'id = ?', whereArgs: [id]);
  }

  // Tags CRUD
  Future<String> insertTag(Tag tag) async {
    final db = await database;
    await db.insert('tags', tag.toJson(), conflictAlgorithm: ConflictAlgorithm.replace);
    return tag.id;
  }

  Future<List<Tag>> getAllTags() async {
    final db = await database;
    final tags = await db.query('tags', orderBy: 'name ASC');
    return tags.map((map) => Tag.fromJson(map)).toList();
  }

  Future<Tag?> getTagById(String id) async {
    final db = await database;
    final tags = await db.query('tags', where: 'id = ?', whereArgs: [id]);
    if (tags.isEmpty) return null;
    return Tag.fromJson(tags.first);
  }

  Future<int> updateTag(Tag tag) async {
    final db = await database;
    return await db.update('tags', tag.toJson(), where: 'id = ?', whereArgs: [tag.id]);
  }

  Future<int> deleteTag(String id) async {
    final db = await database;
    return await db.delete('tags', where: 'id = ?', whereArgs: [id]);
  }

  // Search notes
  Future<List<Note>> searchNotes(String query) async {
    final db = await database;
    final notes = await db.rawQuery('''
      SELECT * FROM notes
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY updated_at DESC
    ''', ['%$query%', '%$query%']);
    
    final List<Note> noteList = [];
    for (final noteMap in notes) {
      final tagMaps = await db.query(
        'note_tags',
        where: 'note_id = ?',
        whereArgs: [noteMap['id'] as String],
      );
      final tags = tagMaps.map((map) => map['tag_id'] as String).toList();
      noteList.add(_noteFromDbRow(noteMap, tags));
    }
    
    return noteList;
  }

  // Settings
  Future<void> saveSetting(String key, String value) async {
    final db = await database;
    await db.insert(
      'settings',
      {'key': key, 'value': value},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<String?> getSetting(String key) async {
    final db = await database;
    final settings = await db.query('settings', where: 'key = ?', whereArgs: [key]);
    if (settings.isEmpty) return null;
    return settings.first['value'] as String?;
  }

  Future<void> close() async {
    final db = await database;
    await db.close();
  }
}


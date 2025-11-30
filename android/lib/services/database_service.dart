import '../database/database_helper.dart';
import '../models/note.dart';
import '../models/tag.dart';

class DatabaseService {
  final DatabaseHelper _db = DatabaseHelper.instance;

  Future<void> initialize() async {
    await _db.database;
  }

  // Notes
  Future<String> createNote(Note note) async {
    return await _db.insertNote(note);
  }

  Future<List<Note>> getAllNotes() async {
    return await _db.getAllNotes();
  }

  Future<Note?> getNoteById(String id) async {
    return await _db.getNoteById(id);
  }

  Future<int> updateNote(Note note) async {
    return await _db.updateNote(note);
  }

  Future<int> deleteNote(String id) async {
    return await _db.deleteNote(id);
  }

  Future<List<Note>> searchNotes(String query) async {
    return await _db.searchNotes(query);
  }

  // Tags
  Future<String> createTag(Tag tag) async {
    return await _db.insertTag(tag);
  }

  Future<List<Tag>> getAllTags() async {
    return await _db.getAllTags();
  }

  Future<Tag?> getTagById(String id) async {
    return await _db.getTagById(id);
  }

  Future<int> updateTag(Tag tag) async {
    return await _db.updateTag(tag);
  }

  Future<int> deleteTag(String id) async {
    return await _db.deleteTag(id);
  }

  // Settings
  Future<void> saveSetting(String key, String value) async {
    await _db.saveSetting(key, value);
  }

  Future<String?> getSetting(String key) async {
    return await _db.getSetting(key);
  }
}


import 'package:flutter/foundation.dart';
import '../models/note.dart';
import '../models/tag.dart';
import 'database_service.dart';

class NotesService extends ChangeNotifier {
  final DatabaseService _databaseService;
  List<Note> _allNotes = [];
  List<Note> _filteredNotes = [];
  List<Tag> _tags = [];
  String? _selectedFolder;
  String _searchQuery = '';

  NotesService(this._databaseService) {
    // Initialize with "all" folder selected
    _selectedFolder = 'all';
  }

  List<Note> get notes => _filteredNotes;
  List<Note> get allNotes => _allNotes;
  List<Tag> get tags => _tags;
  String? get selectedFolder => _selectedFolder;
  String get searchQuery => _searchQuery;

  Future<void> loadNotes() async {
    _allNotes = await _databaseService.getAllNotes();
    _applyFilters();
    notifyListeners();
  }

  Future<void> loadTags() async {
    _tags = await _databaseService.getAllTags();
    notifyListeners();
  }

  Future<void> createNote(Note note) async {
    await _databaseService.createNote(note);
    await loadNotes();
  }

  Future<void> updateNote(Note note) async {
    await _databaseService.updateNote(note);
    await loadNotes();
  }

  Future<void> deleteNote(String id) async {
    await _databaseService.deleteNote(id);
    await loadNotes();
  }

  Future<void> searchNotes(String query) async {
    _searchQuery = query;
    if (query.isEmpty) {
      await loadNotes();
    } else {
      _allNotes = await _databaseService.searchNotes(query);
      _applyFilters();
      notifyListeners();
    }
  }

  void setSelectedFolder(String? folder) {
    _selectedFolder = folder;
    _applyFilters();
    notifyListeners();
  }

  void _applyFilters() {
    List<Note> filtered = List.from(_allNotes);

    // Apply folder filter
    if (_selectedFolder != null && _selectedFolder != 'all') {
      if (_selectedFolder == 'untagged') {
        filtered = filtered.where((note) => note.tags.isEmpty).toList();
      } else {
        filtered = filtered.where((note) => note.tags.contains(_selectedFolder)).toList();
      }
    }

    _filteredNotes = filtered;
  }

  // Helper methods for sidebar counts
  int getTotalNotesCount() => _allNotes.length;
  
  int getUntaggedNotesCount() => _allNotes.where((n) => n.tags.isEmpty).length;
  
  int getTagNotesCount(String tagId) => 
      _allNotes.where((n) => n.tags.contains(tagId)).length;

  Future<void> createTag(Tag tag) async {
    await _databaseService.createTag(tag);
    await loadTags();
  }

  Future<void> updateTag(Tag tag) async {
    await _databaseService.updateTag(tag);
    await loadTags();
  }

  Future<void> deleteTag(String id) async {
    await _databaseService.deleteTag(id);
    await loadTags();
    await loadNotes();
  }
}


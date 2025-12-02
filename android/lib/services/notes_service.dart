import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
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
  
  static const int maxPinnedNotes = 3;

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
    _sortNotes();
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
      _sortNotes();
      _applyFilters();
      notifyListeners();
    }
  }

  void setSelectedFolder(String? folder) {
    _selectedFolder = folder;
    _applyFilters();
    notifyListeners();
  }

  // Sort notes with pinned first, then by updated time
  void _sortNotes() {
    _allNotes.sort((a, b) {
      // Pinned notes come first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // Then sort by updated time (most recent first)
      return b.updatedAt.compareTo(a.updatedAt);
    });
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
  
  // Pin/unpin note functionality
  int getPinnedNotesCount() => _allNotes.where((n) => n.isPinned).length;
  
  bool canPinNote() => getPinnedNotesCount() < maxPinnedNotes;
  
  Future<bool> togglePinNote(String noteId) async {
    final noteIndex = _allNotes.indexWhere((n) => n.id == noteId);
    if (noteIndex == -1) return false;
    
    final note = _allNotes[noteIndex];
    
    // If trying to pin and already at max, return false
    if (!note.isPinned && !canPinNote()) {
      return false;
    }
    
    // Toggle pin status
    final updatedNote = note.copyWith(
      isPinned: !note.isPinned,
      updatedAt: DateTime.now(),
    );
    
    await _databaseService.updateNote(updatedNote);
    await loadNotes();
    return true;
  }
  
  // Duplicate note functionality
  Future<Note?> duplicateNote(String noteId) async {
    final originalNote = _allNotes.firstWhere(
      (n) => n.id == noteId,
      orElse: () => throw Exception('Note not found'),
    );
    
    final duplicatedNote = Note(
      id: const Uuid().v4(),
      title: '${originalNote.title} (Copy)',
      content: originalNote.isPasswordProtected ? '' : originalNote.content,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
      tags: List.from(originalNote.tags),
      isPasswordProtected: originalNote.isPasswordProtected,
      // Copy encryption data if password protected
      encryptedContent: originalNote.encryptedContent,
      encryptionSalt: originalNote.encryptionSalt,
      encryptionIv: originalNote.encryptionIv,
      metadata: originalNote.metadata != null
          ? Map<String, dynamic>.from(originalNote.metadata!)
          : null,
      isPinned: false, // New copy starts unpinned
    );
    
    await _databaseService.createNote(duplicatedNote);
    await loadNotes();
    return duplicatedNote;
  }

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


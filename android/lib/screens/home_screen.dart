import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/note.dart';
import '../services/notes_service.dart';
import '../services/theme_service.dart';
import 'note_editor_screen.dart';
import '../widgets/notes_list.dart';
import '../widgets/sidebar.dart';
import '../widgets/advanced_search_panel.dart';
import '../widgets/password_dialog.dart';
import '../widgets/template_chooser.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _searchController = TextEditingController();
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  bool _isSearching = false;
  bool _showAdvancedSearch = false;
  SearchFilters _searchFilters = SearchFilters();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshData();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshData() async {
    final notesService = Provider.of<NotesService>(context, listen: false);
    await notesService.loadNotes();
    await notesService.loadTags();
  }

  Future<void> _createNewNote() async {
    // Show template chooser
    await TemplateChooser.show(
      context,
      onNoteCreated: (note) async {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => NoteEditorScreen(note: note, isNew: true),
          ),
        );
        await _refreshData();
      },
    );
  }

  Future<void> _openNote(Note note) async {
    // Check if note is password protected and locked
    if (note.isPasswordProtected && note.encryptedContent != null) {
      // Show unlock dialog - use a variable to capture the result since
      // PasswordDialog.onComplete is called before the dialog pops itself.
      // We should NOT call Navigator.pop in the callback as the dialog
      // already handles that, which would cause a double-pop issue.
      Note? unlockedNoteResult;
      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => PasswordDialog(
          note: note,
          isUnlocking: true,
          onComplete: (updatedNote, password) {
            unlockedNoteResult = updatedNote;
          },
        ),
      );

      if (unlockedNoteResult == null) return;
      note = unlockedNoteResult!;
    }

    if (!mounted) return;
    
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => NoteEditorScreen(note: note, isNew: false),
      ),
    );
    
    await _refreshData();
  }

  void _toggleSearch() {
    setState(() {
      _isSearching = !_isSearching;
      if (!_isSearching) {
        _searchController.clear();
        _showAdvancedSearch = false;
        _searchFilters = SearchFilters();
        final notesService = Provider.of<NotesService>(context, listen: false);
        notesService.searchNotes('');
      }
    });
  }

  void _onSearchChanged(String query) {
    setState(() {
      _searchFilters = _searchFilters.copyWith(query: query);
    });
    final notesService = Provider.of<NotesService>(context, listen: false);
    notesService.searchNotes(query);
  }

  void _toggleAdvancedSearch() {
    setState(() {
      _showAdvancedSearch = !_showAdvancedSearch;
    });
  }

  List<Note> _getFilteredNotes(NotesService notesService) {
    return _searchFilters.apply(notesService.notes, notesService.tags);
  }

  @override
  Widget build(BuildContext context) {
    final themeService = Provider.of<ThemeService>(context);
    final isWideScreen = MediaQuery.of(context).size.width >= 600;

    return Scaffold(
      key: _scaffoldKey,
      appBar: AppBar(
        leading: isWideScreen ? null : IconButton(
          icon: const Icon(Icons.menu),
          onPressed: () {
            _scaffoldKey.currentState?.openDrawer();
          },
          tooltip: 'Menu',
        ),
        title: _isSearching
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'Search notes...',
                  border: InputBorder.none,
                  suffixIcon: IconButton(
                    icon: Icon(
                      _showAdvancedSearch ? Icons.expand_less : Icons.tune,
                      size: 20,
                    ),
                    onPressed: _toggleAdvancedSearch,
                    tooltip: 'Advanced search',
                  ),
                ),
                onChanged: _onSearchChanged,
              )
            : const Text('CogNotez'),
        actions: [
          IconButton(
            icon: Icon(_isSearching ? Icons.close : Icons.search),
            onPressed: _toggleSearch,
            tooltip: 'Search',
          ),
          IconButton(
            icon: Icon(
              themeService.themeMode == ThemeMode.dark
                  ? Icons.light_mode
                  : Icons.dark_mode,
            ),
            onPressed: () {
              final newMode = themeService.themeMode == ThemeMode.dark
                  ? ThemeMode.light
                  : ThemeMode.dark;
              themeService.setThemeMode(newMode);
            },
            tooltip: 'Toggle theme',
          ),
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: _createNewNote,
            tooltip: 'New note',
          ),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const SettingsScreen()),
              );
            },
            tooltip: 'Settings',
          ),
        ],
      ),
      drawer: isWideScreen ? null : Drawer(
        child: SafeArea(
          child: Sidebar(
            onFolderSelected: () {
              Navigator.pop(context);
            },
          ),
        ),
      ),
      body: Column(
        children: [
          // Advanced search panel
          if (_showAdvancedSearch)
            AdvancedSearchPanel(
              filters: _searchFilters,
              onFiltersChanged: (filters) {
                setState(() {
                  _searchFilters = filters;
                  _searchController.text = filters.query;
                });
              },
              onClose: () {
                setState(() {
                  _showAdvancedSearch = false;
                });
              },
            ),
          // Main content
          Expanded(
            child: Row(
              children: [
                if (isWideScreen) ...[
                  const Sidebar(),
                  const VerticalDivider(width: 1),
                ],
                Expanded(
                  child: Consumer<NotesService>(
                    builder: (context, notesService, _) {
                      final filteredNotes = _searchFilters.hasActiveFilters
                          ? _getFilteredNotes(notesService)
                          : notesService.notes;
                      
                      return NotesList(
                        notes: filteredNotes,
                        onNoteSelected: _openNote,
                        onCreateNote: _createNewNote,
                        onNoteDuplicated: (duplicatedNote) {
                          // Open the duplicated note
                          _openNote(duplicatedNote);
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createNewNote,
        tooltip: 'New note',
        child: const Icon(Icons.add),
      ),
    );
  }
}

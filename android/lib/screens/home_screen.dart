import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../models/note.dart';
import '../services/notes_service.dart';
import '../services/theme_service.dart';
import 'note_editor_screen.dart';
import '../widgets/notes_list.dart';
import '../widgets/sidebar.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _searchController = TextEditingController();
  bool _isSearching = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final notesService = Provider.of<NotesService>(context, listen: false);
      notesService.loadNotes();
      notesService.loadTags();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _createNewNote() {
    final notesService = Provider.of<NotesService>(context, listen: false);
    final note = Note(
      id: const Uuid().v4(),
      title: '',
      content: '',
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => NoteEditorScreen(note: note, isNew: true),
      ),
    );
  }

  void _toggleSearch() {
    setState(() {
      _isSearching = !_isSearching;
      if (!_isSearching) {
        _searchController.clear();
        final notesService = Provider.of<NotesService>(context, listen: false);
        notesService.searchNotes('');
      }
    });
  }

  void _onSearchChanged(String query) {
    final notesService = Provider.of<NotesService>(context, listen: false);
    notesService.searchNotes(query);
  }

  @override
  Widget build(BuildContext context) {
    final themeService = Provider.of<ThemeService>(context);

    return Scaffold(
      appBar: AppBar(
        title: _isSearching
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search notes...',
                  border: InputBorder.none,
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
      body: Row(
        children: [
          const Sidebar(),
          const VerticalDivider(width: 1),
          const Expanded(
            child: NotesList(),
          ),
        ],
      ),
    );
  }
}


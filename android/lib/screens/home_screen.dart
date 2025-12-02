import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../models/note.dart';
import '../services/notes_service.dart';
import '../services/theme_service.dart';
import '../utils/app_theme.dart';
import '../l10n/app_localizations.dart';
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
    final isMobile = !isWideScreen;

    return Scaffold(
      key: _scaffoldKey,
      appBar: AppBar(
        leading: isWideScreen ? null : IconButton(
          icon: const Icon(Icons.menu),
          onPressed: () {
            _scaffoldKey.currentState?.openDrawer();
          },
          tooltip: AppLocalizations.of(context)?.menu ?? 'Menu',
          style: IconButton.styleFrom(
            padding: EdgeInsets.zero,
            minimumSize: const Size(40, 40),
          ),
        ),
        title: _isSearching
            ? Container(
                height: isMobile ? 44 : 48,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(isMobile ? AppTheme.radiusMd : AppTheme.radiusLg),
                  border: Border.all(color: Theme.of(context).colorScheme.outline),
                ),
                child: TextField(
                  controller: _searchController,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: AppLocalizations.of(context)?.searchNotes ?? 'Search notes...',
                    border: InputBorder.none,
                    prefixIcon: Icon(Icons.search, size: isMobile ? 18 : 20),
                    suffixIcon: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (!isMobile) ...[
                          IconButton(
                            icon: Icon(
                              _showAdvancedSearch ? Icons.expand_less : Icons.tune,
                              size: 20,
                            ),
                            onPressed: _toggleAdvancedSearch,
                            tooltip: AppLocalizations.of(context)?.searchNotes ?? 'Advanced search',
                          ),
                        ],
                        if (_searchController.text.isNotEmpty)
                          IconButton(
                            icon: Icon(Icons.clear, size: isMobile ? 18 : 20),
                            onPressed: () {
                              _searchController.clear();
                              _onSearchChanged('');
                            },
                            tooltip: AppLocalizations.of(context)?.cancel ?? 'Clear search',
                          ),
                      ],
                    ),
                    contentPadding: EdgeInsets.symmetric(horizontal: isMobile ? AppTheme.spacingSm : AppTheme.spacingMd),
                  ),
                  onChanged: _onSearchChanged,
                ),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SvgPicture.asset(
                    'assets/icon.svg',
                    width: 32,
                    height: 32,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'CogNotez',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      foreground: Paint()
                        ..shader = LinearGradient(
                          colors: [AppTheme.accentColor, AppTheme.primaryDark],
                        ).createShader(const Rect.fromLTWH(0.0, 0.0, 200.0, 70.0)),
                    ),
                  ),
                ],
              ),
        actions: [
          // Unified header toolbar - mobile adapted
          Container(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceVariant,
              borderRadius: BorderRadius.circular(isMobile ? AppTheme.radiusLg : AppTheme.radiusXl),
              border: Border.all(color: Theme.of(context).colorScheme.outline),
            ),
            padding: EdgeInsets.all(isMobile ? 2 : 4),
            child: Row(
              children: [
                // Theme toggle - mobile adapted
                IconButton(
                  icon: Icon(
                    themeService.themeMode == ThemeMode.dark
                        ? Icons.light_mode
                        : Icons.dark_mode,
                    size: isMobile ? 16 : 18,
                  ),
                  onPressed: () {
                    final newMode = themeService.themeMode == ThemeMode.dark
                        ? ThemeMode.light
                        : ThemeMode.dark;
                    themeService.setThemeMode(newMode);
                  },
                  tooltip: AppLocalizations.of(context)?.edit ?? 'Toggle theme',
                  style: IconButton.styleFrom(
                    padding: EdgeInsets.all(isMobile ? 6 : 8),
                    minimumSize: Size(isMobile ? 32 : 36, isMobile ? 32 : 36),
                  ),
                ),
                // New note button with accent color - mobile adapted
                ElevatedButton(
                  onPressed: _createNewNote,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.accentColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(isMobile ? AppTheme.radiusMd : AppTheme.radiusLg),
                    ),
                    padding: EdgeInsets.symmetric(
                      horizontal: isMobile ? AppTheme.spacingSm : AppTheme.spacingMd,
                      vertical: isMobile ? AppTheme.spacingXs : AppTheme.spacingSm,
                    ),
                    minimumSize: Size(isMobile ? 60 : 80, isMobile ? 32 : 36),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add, size: isMobile ? 14 : 16),
                      if (!isMobile) ...[
                        const SizedBox(width: 6),
                        Text(AppLocalizations.of(context)?.newNote ?? 'New'),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Settings button
          IconButton(
            icon: const Icon(Icons.settings, size: 20),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const SettingsScreen()),
              );
            },
            tooltip: AppLocalizations.of(context)?.settings ?? 'Settings',
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
        tooltip: AppLocalizations.of(context)?.newNote ?? 'New note',
        child: const Icon(Icons.add),
      ),
    );
  }
}

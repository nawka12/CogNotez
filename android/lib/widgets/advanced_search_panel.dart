import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/note.dart';
import '../models/tag.dart';
import '../services/notes_service.dart';

enum SortOption {
  dateDesc,
  dateAsc,
  titleAsc,
  titleDesc,
  wordCountDesc,
  wordCountAsc
}

class SearchFilters {
  final String query;
  final List<String> selectedTagIds;
  final DateTime? dateFrom;
  final DateTime? dateTo;
  final SortOption sortBy;
  final bool showPasswordProtected;
  final bool showUntaggedOnly;
  final bool pinnedOnly;

  SearchFilters({
    this.query = '',
    this.selectedTagIds = const [],
    this.dateFrom,
    this.dateTo,
    this.sortBy = SortOption.dateDesc,
    this.showPasswordProtected = true,
    this.showUntaggedOnly = false,
    this.pinnedOnly = false,
  });

  SearchFilters copyWith({
    String? query,
    List<String>? selectedTagIds,
    DateTime? dateFrom,
    DateTime? dateTo,
    SortOption? sortBy,
    bool? showPasswordProtected,
    bool? showUntaggedOnly,
    bool? pinnedOnly,
    bool clearDateFrom = false,
    bool clearDateTo = false,
  }) {
    return SearchFilters(
      query: query ?? this.query,
      selectedTagIds: selectedTagIds ?? this.selectedTagIds,
      dateFrom: clearDateFrom ? null : (dateFrom ?? this.dateFrom),
      dateTo: clearDateTo ? null : (dateTo ?? this.dateTo),
      sortBy: sortBy ?? this.sortBy,
      showPasswordProtected:
          showPasswordProtected ?? this.showPasswordProtected,
      showUntaggedOnly: showUntaggedOnly ?? this.showUntaggedOnly,
      pinnedOnly: pinnedOnly ?? this.pinnedOnly,
    );
  }

  List<Note> apply(List<Note> notes, List<Tag> tags) {
    var filtered = List<Note>.from(notes);

    // Text search
    if (query.isNotEmpty) {
      final searchLower = query.toLowerCase();
      filtered = filtered.where((note) {
        return note.title.toLowerCase().contains(searchLower) ||
            note.content.toLowerCase().contains(searchLower);
      }).toList();
    }

    // Tag filter
    if (selectedTagIds.isNotEmpty) {
      filtered = filtered.where((note) {
        return selectedTagIds.any((tagId) => note.tags.contains(tagId));
      }).toList();
    }

    // Untagged only filter
    if (showUntaggedOnly) {
      filtered = filtered.where((note) => note.tags.isEmpty).toList();
    }

    // Date range filter
    if (dateFrom != null) {
      filtered = filtered.where((note) {
        return note.updatedAt.isAfter(dateFrom!) ||
            note.updatedAt.isAtSameMomentAs(dateFrom!);
      }).toList();
    }
    if (dateTo != null) {
      final endOfDay =
          DateTime(dateTo!.year, dateTo!.month, dateTo!.day, 23, 59, 59);
      filtered = filtered.where((note) {
        return note.updatedAt.isBefore(endOfDay) ||
            note.updatedAt.isAtSameMomentAs(endOfDay);
      }).toList();
    }

    // Password protected filter
    if (!showPasswordProtected) {
      filtered = filtered.where((note) => !note.isPasswordProtected).toList();
    }

    // Pinned only filter
    if (pinnedOnly) {
      filtered = filtered.where((note) => note.isPinned).toList();
    }

    // Sort
    switch (sortBy) {
      case SortOption.dateDesc:
        filtered.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
        break;
      case SortOption.dateAsc:
        filtered.sort((a, b) => a.updatedAt.compareTo(b.updatedAt));
        break;
      case SortOption.titleAsc:
        filtered.sort(
            (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
        break;
      case SortOption.titleDesc:
        filtered.sort(
            (a, b) => b.title.toLowerCase().compareTo(a.title.toLowerCase()));
        break;
      case SortOption.wordCountDesc:
        filtered.sort((a, b) => b.wordCount.compareTo(a.wordCount));
        break;
      case SortOption.wordCountAsc:
        filtered.sort((a, b) => a.wordCount.compareTo(b.wordCount));
        break;
    }

    return filtered;
  }

  bool get hasActiveFilters {
    return query.isNotEmpty ||
        selectedTagIds.isNotEmpty ||
        dateFrom != null ||
        dateTo != null ||
        !showPasswordProtected ||
        showUntaggedOnly ||
        pinnedOnly ||
        sortBy != SortOption.dateDesc;
  }
}

class AdvancedSearchPanel extends StatefulWidget {
  final SearchFilters filters;
  final Function(SearchFilters) onFiltersChanged;
  final VoidCallback onClose;

  const AdvancedSearchPanel({
    super.key,
    required this.filters,
    required this.onFiltersChanged,
    required this.onClose,
  });

  @override
  State<AdvancedSearchPanel> createState() => _AdvancedSearchPanelState();
}

class _AdvancedSearchPanelState extends State<AdvancedSearchPanel> {
  late TextEditingController _searchController;
  late SearchFilters _filters;

  @override
  void initState() {
    super.initState();
    _filters = widget.filters;
    _searchController = TextEditingController(text: _filters.query);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _updateFilters(SearchFilters newFilters) {
    setState(() {
      _filters = newFilters;
    });
    widget.onFiltersChanged(newFilters);
  }

  Future<void> _selectDate(bool isFrom) async {
    final initialDate = isFrom ? _filters.dateFrom : _filters.dateTo;
    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );

    if (picked != null) {
      if (isFrom) {
        _updateFilters(_filters.copyWith(dateFrom: picked));
      } else {
        _updateFilters(_filters.copyWith(dateTo: picked));
      }
    }
  }

  void _clearFilters() {
    _searchController.clear();
    _updateFilters(SearchFilters());
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  String _getSortLabel(SortOption option) {
    switch (option) {
      case SortOption.dateDesc:
        return 'Newest first';
      case SortOption.dateAsc:
        return 'Oldest first';
      case SortOption.titleAsc:
        return 'Title A-Z';
      case SortOption.titleDesc:
        return 'Title Z-A';
      case SortOption.wordCountDesc:
        return 'Longest first';
      case SortOption.wordCountAsc:
        return 'Shortest first';
    }
  }

  @override
  Widget build(BuildContext context) {
    final notesService = Provider.of<NotesService>(context);
    final tags = notesService.tags;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Advanced Search',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              Row(
                children: [
                  if (_filters.hasActiveFilters)
                    TextButton(
                      onPressed: _clearFilters,
                      child: const Text('Clear All'),
                    ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: widget.onClose,
                  ),
                ],
              ),
            ],
          ),
          const Divider(),

          // Search field
          TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: 'Search notes...',
              prefixIcon: const Icon(Icons.search),
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              isDense: true,
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        _updateFilters(_filters.copyWith(query: ''));
                      },
                    )
                  : null,
            ),
            onChanged: (value) {
              _updateFilters(_filters.copyWith(query: value));
            },
          ),
          const SizedBox(height: 16),

          // Tags filter
          const Text('Filter by tags:',
              style: TextStyle(fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: tags.map((tag) {
              final isSelected = _filters.selectedTagIds.contains(tag.id);
              return FilterChip(
                label: Text(tag.name),
                selected: isSelected,
                onSelected: (selected) {
                  final newTags = List<String>.from(_filters.selectedTagIds);
                  if (selected) {
                    newTags.add(tag.id);
                  } else {
                    newTags.remove(tag.id);
                  }
                  _updateFilters(_filters.copyWith(selectedTagIds: newTags));
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          // Date range
          const Text('Date range:',
              style: TextStyle(fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _selectDate(true),
                  icon: const Icon(Icons.calendar_today, size: 16),
                  label: Text(_filters.dateFrom != null
                      ? _formatDate(_filters.dateFrom!)
                      : 'From'),
                ),
              ),
              if (_filters.dateFrom != null)
                IconButton(
                  icon: const Icon(Icons.clear, size: 16),
                  onPressed: () =>
                      _updateFilters(_filters.copyWith(clearDateFrom: true)),
                ),
              const SizedBox(width: 8),
              const Text('to'),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _selectDate(false),
                  icon: const Icon(Icons.calendar_today, size: 16),
                  label: Text(_filters.dateTo != null
                      ? _formatDate(_filters.dateTo!)
                      : 'To'),
                ),
              ),
              if (_filters.dateTo != null)
                IconButton(
                  icon: const Icon(Icons.clear, size: 16),
                  onPressed: () =>
                      _updateFilters(_filters.copyWith(clearDateTo: true)),
                ),
            ],
          ),
          const SizedBox(height: 16),

          // Sort options
          const Text('Sort by:', style: TextStyle(fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          DropdownButton<SortOption>(
            value: _filters.sortBy,
            isExpanded: true,
            items: SortOption.values.map((option) {
              return DropdownMenuItem(
                value: option,
                child: Text(_getSortLabel(option)),
              );
            }).toList(),
            onChanged: (value) {
              if (value != null) {
                _updateFilters(_filters.copyWith(sortBy: value));
              }
            },
          ),
          const SizedBox(height: 16),

          // Additional filters
          const Text('Additional filters:',
              style: TextStyle(fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilterChip(
                label: const Text('Pinned only'),
                selected: _filters.pinnedOnly,
                onSelected: (selected) {
                  _updateFilters(_filters.copyWith(pinnedOnly: selected));
                },
              ),
              FilterChip(
                label: const Text('Show locked notes'),
                selected: _filters.showPasswordProtected,
                onSelected: (selected) {
                  _updateFilters(
                      _filters.copyWith(showPasswordProtected: selected));
                },
              ),
              FilterChip(
                label: const Text('Untagged only'),
                selected: _filters.showUntaggedOnly,
                onSelected: (selected) {
                  _updateFilters(_filters.copyWith(showUntaggedOnly: selected));
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

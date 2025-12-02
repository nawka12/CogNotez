import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import 'package:intl/intl.dart';
import '../models/template.dart';

class TemplateService extends ChangeNotifier {
  static const String _customTemplatesKey = 'custom_templates';
  
  List<NoteTemplate> _defaultTemplates = [];
  List<NoteTemplate> _customTemplates = [];
  
  List<NoteTemplate> get templates => [..._defaultTemplates, ..._customTemplates];
  List<NoteTemplate> get defaultTemplates => _defaultTemplates;
  List<NoteTemplate> get customTemplates => _customTemplates;

  TemplateService() {
    _loadDefaultTemplates();
  }

  Future<void> initialize() async {
    await _loadCustomTemplates();
  }

  String _formatDate() {
    return DateFormat('MMMM d, yyyy').format(DateTime.now());
  }

  void _loadDefaultTemplates() {
    final date = _formatDate();
    
    _defaultTemplates = [
      const NoteTemplate(
        id: 'blank',
        name: 'Blank Note',
        description: 'Start with a clean slate',
        icon: '📝',
        content: '',
        isDefault: true,
      ),
      NoteTemplate(
        id: 'meeting-notes',
        name: 'Meeting Notes',
        description: 'Capture meeting discussions and action items',
        icon: '📋',
        content: '''# Meeting Notes

**Date:** $date
**Attendees:** 

## Agenda
- 

## Discussion Points
- 

## Action Items
- [ ] 

## Next Meeting
''',
        isDefault: true,
      ),
      NoteTemplate(
        id: 'daily-journal',
        name: 'Daily Journal',
        description: 'Record your daily thoughts and reflections',
        icon: '📓',
        content: '''# Daily Journal - $date

## Mood
😊 / 😐 / 😔

## Today's Goals
- [ ] 
- [ ] 
- [ ] 

## What Happened


## Grateful For
1. 
2. 
3. 

## Tomorrow's Focus
''',
        isDefault: true,
      ),
      NoteTemplate(
        id: 'project-plan',
        name: 'Project Plan',
        description: 'Plan and track your project progress',
        icon: '🎯',
        content: '''# Project Plan

## Overview
**Project Name:** 
**Start Date:** $date
**Status:** Planning

## Objectives
- 

## Milestones
1. [ ] 
2. [ ] 
3. [ ] 

## Resources Needed
- 

## Timeline
- Week 1: 
- Week 2: 
- Week 3: 

## Risks and Mitigation
- 

## Success Criteria
- 
''',
        isDefault: true,
      ),
      NoteTemplate(
        id: 'book-notes',
        name: 'Book Notes',
        description: 'Capture insights from your reading',
        icon: '📚',
        content: '''# Book Notes

**Title:** 
**Author:** 
**Date Read:** $date
**Rating:** ⭐⭐⭐⭐⭐

## Summary
Brief overview of the book...

## Key Takeaways
1. 
2. 
3. 

## Favorite Quotes
> 

## My Thoughts
''',
        isDefault: true,
      ),
      NoteTemplate(
        id: 'todo-list',
        name: 'Todo List',
        description: 'Organize your tasks by priority',
        icon: '✅',
        content: '''# Todo List - $date

## High Priority
- [ ] 
- [ ] 

## Medium Priority
- [ ] 
- [ ] 

## Low Priority
- [ ] 
- [ ] 

## Completed Today
- [x] 
''',
        isDefault: true,
      ),
      NoteTemplate(
        id: 'brainstorm',
        name: 'Brainstorm',
        description: 'Generate and organize ideas',
        icon: '💡',
        content: '''# Brainstorming Session

**Topic:** 
**Date:** $date

## Ideas
1. 
2. 
3. 
4. 
5. 

## Best Ideas
⭐ 

## Next Steps
- [ ] 
''',
        isDefault: true,
      ),
      const NoteTemplate(
        id: 'recipe',
        name: 'Recipe',
        description: 'Document your favorite recipes',
        icon: '🍳',
        content: '''# Recipe: 

**Prep Time:** 
**Cook Time:** 
**Servings:** 
**Difficulty:** Easy / Medium / Hard

## Ingredients
- 
- 
- 

## Instructions
1. 
2. 
3. 

## Notes
''',
        isDefault: true,
      ),
      NoteTemplate(
        id: 'code-snippet',
        name: 'Code Snippet',
        description: 'Save code with documentation',
        icon: '💻',
        content: '''# Code Snippet

**Language:** 
**Purpose:** 
**Date:** $date

## Code
```
// Your code here
```

## Description


## Usage
```
// Example usage
```

## Notes
''',
        isDefault: true,
      ),
      NoteTemplate(
        id: 'research-notes',
        name: 'Research Notes',
        description: 'Document your research findings',
        icon: '🔬',
        content: '''# Research Notes

**Topic:** 
**Date:** $date
**Source:** 

## Research Question


## Key Findings
- 

## Data/Evidence


## Analysis


## References
1. 
''',
        isDefault: true,
      ),
    ];
  }

  Future<void> _loadCustomTemplates() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final customTemplatesJson = prefs.getString(_customTemplatesKey);
      
      if (customTemplatesJson != null) {
        final List<dynamic> decoded = jsonDecode(customTemplatesJson);
        _customTemplates = decoded
            .map((json) => NoteTemplate.fromJson(json as Map<String, dynamic>))
            .toList();
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Error loading custom templates: $e');
    }
  }

  Future<void> _saveCustomTemplates() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final encoded = jsonEncode(_customTemplates.map((t) => t.toJson()).toList());
      await prefs.setString(_customTemplatesKey, encoded);
    } catch (e) {
      debugPrint('Error saving custom templates: $e');
    }
  }

  Future<void> addCustomTemplate({
    required String name,
    required String description,
    required String icon,
    required String content,
  }) async {
    final template = NoteTemplate(
      id: const Uuid().v4(),
      name: name,
      description: description,
      icon: icon,
      content: content,
      isDefault: false,
      createdAt: DateTime.now(),
    );
    
    _customTemplates.add(template);
    await _saveCustomTemplates();
    notifyListeners();
  }

  Future<void> updateCustomTemplate(NoteTemplate template) async {
    final index = _customTemplates.indexWhere((t) => t.id == template.id);
    if (index >= 0) {
      _customTemplates[index] = template;
      await _saveCustomTemplates();
      notifyListeners();
    }
  }

  Future<void> deleteCustomTemplate(String id) async {
    _customTemplates.removeWhere((t) => t.id == id);
    await _saveCustomTemplates();
    notifyListeners();
  }

  NoteTemplate? getTemplateById(String id) {
    try {
      return templates.firstWhere((t) => t.id == id);
    } catch (e) {
      return null;
    }
  }

  /// Process template content by replacing date placeholders
  String processTemplateContent(String content) {
    final date = _formatDate();
    return content.replaceAll(RegExp(r'\$date'), date);
  }
}
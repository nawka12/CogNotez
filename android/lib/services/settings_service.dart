import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../models/settings.dart';

class SettingsService extends ChangeNotifier {
  static const String _settingsKey = 'app_settings';
  AppSettings? _settings;
  
  AppSettings get settings => _settings ?? AppSettings();
  
  Future<void> loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final settingsJson = prefs.getString(_settingsKey);
    
    if (settingsJson != null) {
      try {
        _settings = AppSettings.fromJson(jsonDecode(settingsJson));
      } catch (e) {
        _settings = AppSettings();
      }
    } else {
      _settings = AppSettings();
    }
  }
  
  Future<void> saveSettings(AppSettings newSettings) async {
    _settings = newSettings;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_settingsKey, jsonEncode(newSettings.toJson()));
    notifyListeners();
  }
  
  Future<void> updateSettings(AppSettings Function(AppSettings) update) async {
    final currentSettings = settings;
    final updatedSettings = update(currentSettings);
    await saveSettings(updatedSettings);
  }
}

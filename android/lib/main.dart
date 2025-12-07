import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'l10n/app_localizations.dart';
import 'screens/home_screen.dart';
import 'screens/splash_screen.dart';
import 'services/theme_service.dart';
import 'services/database_service.dart';
import 'services/notes_service.dart';
import 'services/google_drive_service.dart';
import 'services/template_service.dart';
import 'services/settings_service.dart';
import 'utils/app_theme.dart';

// Global services initialized before app start
late DatabaseService _databaseService;
late TemplateService _templateService;
late SettingsService _settingsService;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize minimal services for splash screen
  _databaseService = DatabaseService();
  _templateService = TemplateService();
  _settingsService = SettingsService();

  // Pre-load settings for theme/language (quick operation)
  await _settingsService.loadSettings();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeService()),
        ChangeNotifierProvider(
            create: (_) => NotesService(_databaseService)),
        ChangeNotifierProvider(create: (_) => GoogleDriveService()),
        ChangeNotifierProvider.value(value: _templateService),
        Provider.value(value: _databaseService),
        ChangeNotifierProvider.value(value: _settingsService),
      ],
      child: const CogNotezApp(),
    ),
  );
}

class CogNotezApp extends StatefulWidget {
  const CogNotezApp({super.key});

  @override
  State<CogNotezApp> createState() => _CogNotezAppState();
}

class _CogNotezAppState extends State<CogNotezApp> {
  bool _isInitialized = false;

  Future<void> _initialize() async {
    // Initialize database
    await _databaseService.initialize();

    // Initialize template service
    await _templateService.initialize();

    // Load notes
    final notesService = Provider.of<NotesService>(context, listen: false);
    await notesService.loadNotes();
    await notesService.loadTags();
  }

  void _onSplashComplete() {
    setState(() {
      _isInitialized = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer2<ThemeService, SettingsService>(
      builder: (context, themeService, settingsService, _) {
        final locale = Locale(settingsService.settings.language);
        return MaterialApp(
          title: 'CogNotez',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: themeService.themeMode,
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [
            Locale('en', ''),
            Locale('es', ''),
            Locale('id', ''),
            Locale('ja', ''),
            Locale('jv', ''),
          ],
          locale: locale,
          home: _isInitialized
              ? const HomeScreen()
              : SplashScreen(
                  onInitialize: _initialize,
                  onComplete: _onSplashComplete,
                ),
          // Add responsive scaling for mobile devices
          builder: (context, child) {
            final mediaQueryData = MediaQuery.of(context);
            final scale = mediaQueryData.size.width < 600 ? 0.9 : 1.0;

            return MediaQuery(
              data: mediaQueryData.copyWith(textScaleFactor: scale),
              child: child!,
            );
          },
        );
      },
    );
  }
}


import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'l10n/app_localizations.dart';
import 'screens/home_screen.dart';
import 'services/theme_service.dart';
import 'services/database_service.dart';
import 'services/notes_service.dart';
import 'services/google_drive_service.dart';
import 'services/template_service.dart';
import 'services/settings_service.dart';
import 'utils/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize database
  final databaseService = DatabaseService();
  await databaseService.initialize();

  // Initialize template service
  final templateService = TemplateService();
  await templateService.initialize();

  // Initialize settings service to get language preference
  final settingsService = SettingsService();
  await settingsService.loadSettings();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeService()),
        ChangeNotifierProvider(create: (_) => NotesService(databaseService)),
        ChangeNotifierProvider(create: (_) => GoogleDriveService()),
        ChangeNotifierProvider.value(value: templateService),
        Provider.value(value: databaseService),
        ChangeNotifierProvider.value(value: settingsService),
      ],
      child: const CogNotezApp(),
    ),
  );
}

class CogNotezApp extends StatelessWidget {
  const CogNotezApp({super.key});

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
          home: const HomeScreen(),
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


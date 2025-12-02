import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'screens/home_screen.dart';
import 'services/theme_service.dart';
import 'services/database_service.dart';
import 'services/notes_service.dart';
import 'services/google_drive_service.dart';
import 'services/template_service.dart';
import 'utils/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize database
  final databaseService = DatabaseService();
  await databaseService.initialize();
  
  // Initialize template service
  final templateService = TemplateService();
  await templateService.initialize();
  
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeService()),
        ChangeNotifierProvider(create: (_) => NotesService(databaseService)),
        ChangeNotifierProvider(create: (_) => GoogleDriveService()),
        ChangeNotifierProvider.value(value: templateService),
        Provider.value(value: databaseService),
      ],
      child: const CogNotezApp(),
    ),
  );
}

class CogNotezApp extends StatelessWidget {
  const CogNotezApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<ThemeService>(
      builder: (context, themeService, _) {
        return MaterialApp(
          title: 'CogNotez',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: themeService.themeMode,
          localizationsDelegates: const [
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
          home: const HomeScreen(),
        );
      },
    );
  }
}


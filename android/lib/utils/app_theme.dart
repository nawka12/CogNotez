import 'package:flutter/material.dart';

class AppTheme {
  // Primary color - subtle purple to match desktop
  static const Color primaryColor = Color(0xFFBDABE3);
  static const Color primaryDark = Color(0xFFA890D1);
  static const Color accentColor = Color(0xFFBDABE3);
  static const Color accentLight = Color(0x66BDABE3);
  static const Color accentLighter = Color(0x14BDABE3);
  static const Color accentLightest = Color(0x0ABDABE3);

  // Modern color palette matching desktop
  static const Color bgPrimary = Color(0xFFFFFFFF);
  static const Color bgSecondary = Color(0xFFF8FAFC);
  static const Color bgTertiary = Color(0xFFF1F5F9);
  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF64748B);
  static const Color textTertiary = Color(0xFF94A3B8);
  static const Color borderColor = Color(0xFFE2E8F0);
  static const Color borderLight = Color(0xFFF1F5F9);
  static const Color borderSubtle = Color(0xFFF8FAFC);

  // Success, warning, error colors
  static const Color successColor = Color(0xFF10B981);
  static const Color warningColor = Color(0xFFF59E0B);
  static const Color errorColor = Color(0xFFEF4444);

  // Modern border radius system
  static const double radiusXs = 4.0;
  static const double radiusSm = 6.0;
  static const double radiusMd = 8.0;
  static const double radiusLg = 12.0;
  static const double radiusXl = 16.0;
  static const double radiusFull = 9999.0;

  // Modern spacing system
  static const double spacingXs = 4.0;
  static const double spacingSm = 8.0;
  static const double spacingMd = 16.0;
  static const double spacingLg = 24.0;
  static const double spacingXl = 32.0;
  static const double spacing2Xl = 48.0;
  static const double spacing3Xl = 64.0;

  // Modern shadow system
  static const BoxShadow shadowXs = BoxShadow(
    color: Color(0x0A000000),
    blurRadius: 2,
    offset: Offset(0, 1),
  );

  static const BoxShadow shadowSm = BoxShadow(
    color: Color(0x14000000),
    blurRadius: 3,
    offset: Offset(0, 1),
  );

  static const BoxShadow shadowMd = BoxShadow(
    color: Color(0x1A000000),
    blurRadius: 6,
    offset: Offset(0, 4),
  );

  static const BoxShadow shadowLg = BoxShadow(
    color: Color(0x1A000000),
    blurRadius: 15,
    offset: Offset(0, 10),
  );

  static const BoxShadow shadowXl = BoxShadow(
    color: Color(0x1A000000),
    blurRadius: 25,
    offset: Offset(0, 20),
  );

  static const BoxShadow shadowAccent = BoxShadow(
    color: Color(0x40BDABE3),
    blurRadius: 14,
    offset: Offset(0, 4),
  );

  static const BoxShadow shadowAccentLg = BoxShadow(
    color: Color(0x4DBDABE3),
    blurRadius: 20,
    offset: Offset(0, 8),
  );

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        brightness: Brightness.light,
        primary: primaryColor,
        secondary: primaryDark,
      ),
      scaffoldBackgroundColor: bgPrimary,
      appBarTheme: AppBarTheme(
        elevation: 0,
        backgroundColor: bgPrimary,
        foregroundColor: textPrimary,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: textPrimary,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: BorderSide(color: borderColor, width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: BorderSide(color: borderColor, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: BorderSide(color: accentColor, width: 1),
        ),
        filled: true,
        fillColor: bgSecondary,
        contentPadding: EdgeInsets.symmetric(horizontal: spacingMd, vertical: spacingSm),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
        ),
        tileColor: bgSecondary,
        selectedTileColor: accentLight,
        selectedColor: accentColor,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: accentColor,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusFull),
        ),
        elevation: 2,
        highlightElevation: 4,
      ),
      buttonTheme: ButtonThemeData(
        buttonColor: accentColor,
        textTheme: ButtonTextTheme.primary,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accentColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMd),
          ),
          padding: EdgeInsets.symmetric(horizontal: spacingLg, vertical: spacingSm),
          elevation: 1,
          shadowColor: accentLight,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: accentColor,
          padding: EdgeInsets.symmetric(horizontal: spacingMd, vertical: spacingSm),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: textSecondary,
          padding: EdgeInsets.all(spacingSm),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
      textTheme: TextTheme(
        displayLarge: TextStyle(fontSize: 30, fontWeight: FontWeight.bold, color: textPrimary),
        displayMedium: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: textPrimary),
        displaySmall: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: textPrimary),
        headlineMedium: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: textPrimary),
        headlineSmall: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: textPrimary),
        titleLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: textPrimary),
        titleMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: textPrimary),
        titleSmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: textSecondary),
        bodyLarge: TextStyle(fontSize: 16, color: textPrimary),
        bodyMedium: TextStyle(fontSize: 14, color: textPrimary),
        bodySmall: TextStyle(fontSize: 12, color: textSecondary),
        labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: textPrimary),
        labelMedium: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: textSecondary),
        labelSmall: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: textTertiary),
      ),
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        brightness: Brightness.dark,
        primary: primaryColor,
        secondary: primaryDark,
      ),
      scaffoldBackgroundColor: Color(0xFF0F172A),
      appBarTheme: AppBarTheme(
        elevation: 0,
        backgroundColor: Color(0xFF0F172A),
        foregroundColor: Color(0xFFF1F5F9),
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: Color(0xFFF1F5F9),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: BorderSide(color: Color(0xFF334155), width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: BorderSide(color: Color(0xFF334155), width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: BorderSide(color: accentColor, width: 1),
        ),
        filled: true,
        fillColor: Color(0xFF1E293B),
        contentPadding: EdgeInsets.symmetric(horizontal: spacingMd, vertical: spacingSm),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
        ),
        tileColor: Color(0xFF1E293B),
        selectedTileColor: Color(0x4DBDABE3),
        selectedColor: accentColor,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: accentColor,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusFull),
        ),
        elevation: 2,
        highlightElevation: 4,
      ),
      buttonTheme: ButtonThemeData(
        buttonColor: accentColor,
        textTheme: ButtonTextTheme.primary,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accentColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMd),
          ),
          padding: EdgeInsets.symmetric(horizontal: spacingLg, vertical: spacingSm),
          elevation: 1,
          shadowColor: accentLight,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: accentColor,
          padding: EdgeInsets.symmetric(horizontal: spacingMd, vertical: spacingSm),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: Color(0xFFCBD5E1),
          padding: EdgeInsets.all(spacingSm),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
      textTheme: TextTheme(
        displayLarge: TextStyle(fontSize: 30, fontWeight: FontWeight.bold, color: Color(0xFFF1F5F9)),
        displayMedium: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFFF1F5F9)),
        displaySmall: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFFF1F5F9)),
        headlineMedium: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Color(0xFFF1F5F9)),
        headlineSmall: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFFF1F5F9)),
        titleLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: Color(0xFFF1F5F9)),
        titleMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Color(0xFFF1F5F9)),
        titleSmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Color(0xFFCBD5E1)),
        bodyLarge: TextStyle(fontSize: 16, color: Color(0xFFF1F5F9)),
        bodyMedium: TextStyle(fontSize: 14, color: Color(0xFFF1F5F9)),
        bodySmall: TextStyle(fontSize: 12, color: Color(0xFFCBD5E1)),
        labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Color(0xFFF1F5F9)),
        labelMedium: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Color(0xFFCBD5E1)),
        labelSmall: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: Color(0xFF94A3B8)),
      ),
    );
  }
}


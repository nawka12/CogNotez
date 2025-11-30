import 'dart:io';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import '../models/note.dart';

class ExportService {
  Future<String> exportAsMarkdown(Note note, {bool share = false}) async {
    final content = '''# ${note.title}

${note.content}
''';

    if (share) {
      await Share.share(content, subject: note.title);
      return '';
    }

    final directory = await getApplicationDocumentsDirectory();
    final file = File('${directory.path}/${_sanitizeFileName(note.title)}.md');
    await file.writeAsString(content);
    return file.path;
  }

  Future<String> exportAsPlainText(Note note, {bool share = false}) async {
    final content = '${note.title}\n\n${note.content}';

    if (share) {
      await Share.share(content, subject: note.title);
      return '';
    }

    final directory = await getApplicationDocumentsDirectory();
    final file = File('${directory.path}/${_sanitizeFileName(note.title)}.txt');
    await file.writeAsString(content);
    return file.path;
  }

  Future<void> exportAsPDF(Note note, {bool share = false}) async {
    final pdf = pw.Document();

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        build: (pw.Context context) {
          return pw.Padding(
            padding: const pw.EdgeInsets.all(40),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  note.title.isEmpty ? 'Untitled Note' : note.title,
                  style: pw.TextStyle(
                    fontSize: 24,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 20),
                pw.Divider(),
                pw.SizedBox(height: 20),
                pw.Text(
                  note.content,
                  style: const pw.TextStyle(fontSize: 12),
                ),
                pw.Spacer(),
                pw.Divider(),
                pw.SizedBox(height: 10),
                pw.Text(
                  'Created: ${_formatDate(note.createdAt)}',
                  style: pw.TextStyle(
                    fontSize: 10,
                    color: PdfColors.grey700,
                  ),
                ),
                pw.Text(
                  'Updated: ${_formatDate(note.updatedAt)}',
                  style: pw.TextStyle(
                    fontSize: 10,
                    color: PdfColors.grey700,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );

    if (share) {
      await Printing.sharePdf(
        bytes: await pdf.save(),
        filename: '${_sanitizeFileName(note.title)}.pdf',
      );
    } else {
      final directory = await getApplicationDocumentsDirectory();
      final file = File('${directory.path}/${_sanitizeFileName(note.title)}.pdf');
      await file.writeAsBytes(await pdf.save());
      await Printing.layoutPdf(
        onLayout: (format) async => await pdf.save(),
      );
    }
  }

  Future<void> copyToClipboard(Note note, {bool asMarkdown = false}) async {
    final content = asMarkdown
        ? '''# ${note.title}

${note.content}'''
        : '${note.title}\n\n${note.content}';

    await Clipboard.setData(ClipboardData(text: content));
  }

  Future<void> shareNote(Note note) async {
    final content = '''# ${note.title}

${note.content}''';
    await Share.share(content, subject: note.title);
  }

  String _sanitizeFileName(String fileName) {
    return fileName
        .replaceAll(RegExp(r'[<>:"/\\|?*]'), '_')
        .replaceAll(RegExp(r'\s+'), '_')
        .replaceAll(RegExp(r'_+'), '_')
        .trim();
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
}

import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/settings.dart';

class AIService {
  final AppSettings settings;

  AIService(this.settings);

  Future<String> generateResponse(String prompt, {String? context}) async {
    if (settings.aiBackend == 'ollama') {
      return await _queryOllama(prompt, context: context);
    } else if (settings.aiBackend == 'openrouter') {
      return await _queryOpenRouter(prompt, context: context);
    }
    throw Exception('Unknown AI backend: ${settings.aiBackend}');
  }

  Future<String> _queryOllama(String prompt, {String? context}) async {
    try {
      final fullPrompt = context != null ? 'Context: $context\n\nQuestion: $prompt' : prompt;
      
      final response = await http.post(
        Uri.parse('${settings.ollamaEndpoint}/api/generate'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'model': settings.ollamaModel,
          'prompt': fullPrompt,
          'stream': false,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['response'] as String? ?? 'No response from AI';
      } else {
        throw Exception('Ollama API error: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Failed to query Ollama: $e');
    }
  }

  Future<String> _queryOpenRouter(String prompt, {String? context}) async {
    if (settings.openRouterApiKey == null || settings.openRouterApiKey!.isEmpty) {
      throw Exception('OpenRouter API key not configured');
    }

    try {
      final fullPrompt = context != null ? 'Context: $context\n\nQuestion: $prompt' : prompt;
      
      final response = await http.post(
        Uri.parse('https://openrouter.ai/api/v1/chat/completions'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${settings.openRouterApiKey}',
        },
        body: jsonEncode({
          'model': settings.openRouterModel,
          'messages': [
            {'role': 'user', 'content': fullPrompt}
          ],
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['choices'][0]['message']['content'] as String? ?? 'No response from AI';
      } else {
        throw Exception('OpenRouter API error: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Failed to query OpenRouter: $e');
    }
  }

  Future<String> summarize(String text) async {
    final prompt = 'Please provide a concise summary of the following text:\n\n$text';
    return await generateResponse(prompt);
  }

  Future<String> askQuestion(String text, String question) async {
    final prompt = 'Based on the following text, answer this question: $question\n\nText: $text';
    return await generateResponse(prompt);
  }

  Future<String> editText(String text, String instruction) async {
    final prompt = 'Please edit the following text according to this instruction: $instruction\n\nText: $text';
    return await generateResponse(prompt);
  }

  Future<String> generateContent(String prompt) async {
    return await generateResponse(prompt);
  }

  Future<List<String>> extractKeyPoints(String text) async {
    final prompt = 'Extract the key points from the following text as a bulleted list:\n\n$text';
    final response = await generateResponse(prompt);
    // Parse bullet points from response
    final lines = response.split('\n').where((line) => line.trim().startsWith('-') || line.trim().startsWith('•')).toList();
    return lines.map((line) => line.replaceAll(RegExp(r'^[-•]\s*'), '').trim()).where((line) => line.isNotEmpty).toList();
  }

  Future<List<String>> generateTags(String text) async {
    final prompt = 'Generate relevant tags for the following text. Return only the tags, separated by commas:\n\n$text';
    final response = await generateResponse(prompt);
    return response.split(',').map((tag) => tag.trim()).where((tag) => tag.isNotEmpty).toList();
  }
}


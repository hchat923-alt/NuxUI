/**
 * Response Sanitizer Utility
 * Strips raw model leaks, internal tool_calls JSON blobs, SSE data chunks, and reasoning dumps
 * so the user always sees clean, natural language output.
 */

export function sanitizeAiResponse(rawText: string, userLanguage: 'ar' | 'en' = 'ar'): string {
  if (!rawText || typeof rawText !== 'string') return '';

  let clean = rawText.trim();

  // If the text contains Server-Sent Events (SSE) data: chunks
  if (clean.includes('data: {') || clean.startsWith('data:')) {
    let extracted = '';
    const lines = clean.split('\n');
    let hasSseLines = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      if (trimmedLine.startsWith('data:')) {
        hasSseLines = true;
        const dataStr = trimmedLine.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataStr);
          const chunk =
            parsed.choices?.[0]?.delta?.content ||
            parsed.choices?.[0]?.message?.content ||
            parsed.choices?.[0]?.text ||
            parsed.content ||
            '';
          if (chunk) extracted += chunk;
        } catch (_) {
          if (dataStr && !dataStr.startsWith('{')) {
            extracted += dataStr;
          }
        }
      } else if (!hasSseLines) {
        extracted += line + '\n';
      }
    }

    if (hasSseLines && extracted.trim()) {
      clean = extracted.trim();
    }
  }

  // Try parsing if string starts with JSON object delimiter
  if ((clean.startsWith('{') && clean.endsWith('}')) || (clean.startsWith('[') && clean.endsWith(']'))) {
    try {
      const parsed = JSON.parse(clean);

      // Extract content string if present
      if (parsed.content && typeof parsed.content === 'string' && parsed.content.trim()) {
        return parsed.content.trim();
      }

      if (parsed.choices?.[0]?.message?.content && typeof parsed.choices[0].message.content === 'string') {
        return parsed.choices[0].message.content.trim();
      }

      if (parsed.choices?.[0]?.delta?.content && typeof parsed.choices[0].delta.content === 'string') {
        return parsed.choices[0].delta.content.trim();
      }

      // If reasoning exists, extract human-readable reasoning
      if (parsed.reasoning && typeof parsed.reasoning === 'string' && parsed.reasoning.trim()) {
        return parsed.reasoning.trim();
      }

      // If raw tool_calls without answer, return empty to avoid freezing UI with placeholder
      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        return '';
      }
    } catch (_) {}
  }

  // Regex replacement for inline raw JSON dumps and SSE artifacts
  clean = clean.replace(/data:\s*\{[\s\S]*?"choices"[\s\S]*?\}\n?/g, '');
  clean = clean.replace(/data:\s*\[DONE\]\n?/g, '');
  clean = clean.replace(/\{"role"\s*:\s*"assistant"\s*,\s*"reasoning"[\s\S]*?"tool_calls"[\s\S]*?\}\}\]\}/g, '');
  clean = clean.replace(/\{"tool_calls"\s*:\s*\[[\s\S]*?\]\}/g, '');
  clean = clean.replace(/\{"function_call"\s*:\s*\{[\s\S]*?\}\}/g, '');

  // Strip raw chat template tokens and artifacts (e.g. <assistant/>, assistant/>, <|im_end|>, etc.)
  clean = clean.replace(/<\/?assistant\/?>/gi, '');
  clean = clean.replace(/assistant\/>/gi, '');
  clean = clean.replace(/<\/?system\/?>/gi, '');
  clean = clean.replace(/system\/>/gi, '');
  clean = clean.replace(/<\/?user\/?>/gi, '');
  clean = clean.replace(/<\|im_start\|>/gi, '');
  clean = clean.replace(/<\|im_end\|>/gi, '');
  clean = clean.replace(/<\|endoftext\|>/gi, '');
  clean = clean.replace(/<\|start_header_id\|>[\s\S]*?<\|end_header_id\|>/gi, '');

  return clean.trim();
}

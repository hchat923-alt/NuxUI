import JSZip from 'jszip';
import { compressAndEncodeImage, formatFileSize } from './imageUtils';
import { FileAttachment } from '../types';

export { formatFileSize };

// Dangerous executable binary formats that cannot be read
const DANGEROUS_EXECUTABLE_EXTENSIONS = new Set([
  'exe',
  'dll',
  'bin',
  'dmg',
  'apk',
  'msi',
  'sys',
  'dylib',
  'so',
  'scr',
  'vbs',
]);

const CODE_EXTENSIONS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'cs', 'go', 'rs',
  'php', 'rb', 'swift', 'kt', 'kts', 'scala', 'sh', 'bash', 'zsh', 'fish', 'sql', 'html',
  'htm', 'css', 'scss', 'sass', 'less', 'json', 'json5', 'yaml', 'yml', 'xml', 'csv', 'tsv',
  'env', 'toml', 'ini', 'cfg', 'conf', 'log', 'md', 'markdown', 'mdown', 'mkd', 'txt', 'text', 'rtf',
  'rst', 'tex', 'latex', 'vue', 'svelte', 'astro', 'graphql', 'gql', 'prisma', 'dockerfile', 'makefile',
  'dart', 'r', 'lua', 'pl', 'pm', 'zig', 'asm', 's', 'cmake', 'gradle', 'properties', 'lock',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm']);

export interface ProcessFileResult {
  attachment?: FileAttachment;
  attachments?: FileAttachment[];
  error?: string;
}

/**
 * Checks if a file is supported, processes ZIP archives, and converts files into standardized FileAttachment objects
 */
export async function processFile(file: File): Promise<ProcessFileResult> {
  const extension = (file.name.split('.').pop() || '').toLowerCase();

  // 1. Dangerous binary check
  if (DANGEROUS_EXECUTABLE_EXTENSIONS.has(extension)) {
    return {
      error: `الملف (${file.name}) تنفيذي ثنائي ولا يمكن قراءته أو تشغيله مباشرة. يرجى إرفاق ملفات نصية، أكواد برمجية، مستندات، أرشيف ZIP، أو وسائط.`,
    };
  }

  // Max size limit: 50MB
  if (file.size > 50 * 1024 * 1024) {
    return {
      error: `حجم الملف (${file.name}) كبير جداً (${formatFileSize(file.size)}). الحد الأقصى المسموح به هو 50 ميغابايت.`,
    };
  }

  // 2. Handle ZIP archives by unpacking files
  if (extension === 'zip') {
    try {
      const zip = await JSZip.loadAsync(file);
      const unpackedAttachments: FileAttachment[] = [];
      const entries = Object.keys(zip.files);

      for (const relativePath of entries) {
        const zipEntry = zip.files[relativePath];
        if (zipEntry.dir) continue;

        // Skip system and hidden artifacts
        if (
          relativePath.includes('__MACOSX') ||
          relativePath.startsWith('.') ||
          relativePath.includes('/.') ||
          relativePath.includes('node_modules/')
        ) {
          continue;
        }

        const entryExt = (relativePath.split('.').pop() || '').toLowerCase();
        if (DANGEROUS_EXECUTABLE_EXTENSIONS.has(entryExt)) continue;

        const isImg = IMAGE_EXTENSIONS.has(entryExt);
        const isEntryAudio = AUDIO_EXTENSIONS.has(entryExt);

        if (isImg) {
          const b64 = await zipEntry.async('base64');
          const mime = `image/${entryExt === 'jpg' ? 'jpeg' : entryExt}`;
          unpackedAttachments.push({
            id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: relativePath,
            size: (zipEntry as any)._data?.uncompressedSize || 1024,
            type: mime,
            data: `data:${mime};base64,${b64}`,
            fileCategory: 'image',
          });
        } else if (!isEntryAudio) {
          // Read as text
          const text = await zipEntry.async('text');
          if (text && text.length < 500000) {
            unpackedAttachments.push({
              id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              name: relativePath,
              size: text.length,
              type: 'text/plain',
              data: `data:text/plain;charset=utf-8;base64,${btoa(unescape(encodeURIComponent(text)))}`,
              fileCategory: 'code',
              textContent: text,
            });
          }
        }
      }

      if (unpackedAttachments.length > 0) {
        return { attachments: unpackedAttachments };
      } else {
        return { error: `أرشيف الـ ZIP (${file.name}) فارغ أو لا يحتوي على ملفات نصية قابلة للقراءة.` };
      }
    } catch (err: any) {
      return {
        error: `تعذر استخراج ملف الـ ZIP (${file.name}): ${err?.message || 'خطأ غير معروف'}`,
      };
    }
  }

  const mime = file.type || '';
  const isImage = mime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension);
  const isPdf = mime === 'application/pdf' || extension === 'pdf';
  const isAudio = mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension);
  const isCodeOrText =
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('javascript') ||
    mime.includes('typescript') ||
    mime.includes('plain') ||
    CODE_EXTENSIONS.has(extension) ||
    ['docx', 'doc', 'csv', 'tsv', 'yaml', 'yml', 'markdown', 'md', 'env'].includes(extension);

  let fileCategory: FileAttachment['fileCategory'] = 'document';
  if (isImage) fileCategory = 'image';
  else if (isPdf) fileCategory = 'pdf';
  else if (isAudio) fileCategory = 'audio';
  else if (isCodeOrText) fileCategory = 'code';

  try {
    let dataUrl = '';
    let textContent: string | undefined;

    if (isImage) {
      // Compress and optimize image
      dataUrl = await compressAndEncodeImage(file, 1600, 0.85);
    } else if (isCodeOrText) {
      // Read directly as text
      textContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file, 'utf-8');
      });

      // Also create base64
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });
    } else {
      // Read as Data URL (PDF, Audio, or general Documents)
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });

      // If file is not PDF/Audio and under 10MB, attempt UTF-8 text read as fallback
      if (!isPdf && !isAudio && file.size < 10 * 1024 * 1024) {
        try {
          const rawText = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, 'utf-8');
          });
          // Check if looks like valid text
          if (rawText && !/[\x00-\x08\x0E-\x1F]/.test(rawText.slice(0, 1000))) {
            textContent = rawText;
            fileCategory = 'code';
          }
        } catch {
          // Ignore fallback text read failure
        }
      }
    }

    const attachment: FileAttachment = {
      id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: file.name,
      size: file.size,
      type: file.type || `application/${extension || 'octet-stream'}`,
      data: dataUrl,
      fileCategory,
      textContent,
    };

    return { attachment };
  } catch (err: any) {
    return {
      error: `حدث خطأ أثناء قراءة الملف (${file.name}): ${err?.message || 'خطأ غير معروف'}`,
    };
  }
}

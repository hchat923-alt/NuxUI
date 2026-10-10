import JSZip from 'jszip';
import { WorkspaceFile, FileAction, FileAttachment } from '../types';

/**
 * Extracts all file actions (create, update, delete) from model generated output.
 * Supports both XML tags (<file_action ...>) and markdown code fences (```file:create:...```).
 */
export function extractFileActions(rawContent: string): FileAction[] {
  if (!rawContent || typeof rawContent !== 'string') return [];

  const actions: FileAction[] = [];

  // 1. Match XML-like <file_action action="..." path="...">...</file_action>
  const xmlTagRegex =
    /<file_action\s+(?:(?:action=["'](create|update|delete|edit|remove|modify)["']\s+path=["']([^"']+)["'])|(?:path=["']([^"']+)["']\s+action=["'](create|update|delete|edit|remove|modify)["']))\s*(?:\/>|>([\s\S]*?)<\/file_action>)/gi;

  let match: RegExpExecArray | null;
  while ((match = xmlTagRegex.exec(rawContent)) !== null) {
    const rawAction = (match[1] || match[4] || 'create').toLowerCase();
    const rawPath = (match[2] || match[3] || '').trim();
    const rawContentInner = match[5] ? match[5].trim() : '';

    if (rawPath) {
      let normAction: 'create' | 'update' | 'delete' = 'create';
      if (rawAction === 'delete' || rawAction === 'remove') {
        normAction = 'delete';
      } else if (rawAction === 'update' || rawAction === 'edit' || rawAction === 'modify') {
        normAction = 'update';
      }

      actions.push({
        type: normAction,
        path: rawPath,
        content: rawContentInner,
        language: getFileLanguage(rawPath),
      });
    }
  }

  // 2. Match code fence syntax: ```file:(create|update|delete):path/to/file.ext
  const fenceRegex =
    /```file:(create|update|delete|edit|modify):([^\s\n]+)\s*\n([\s\S]*?)```/gi;

  while ((match = fenceRegex.exec(rawContent)) !== null) {
    const rawAction = (match[1] || 'create').toLowerCase();
    const rawPath = (match[2] || '').trim();
    const rawContentInner = match[3] ? match[3].trim() : '';

    if (rawPath) {
      let normAction: 'create' | 'update' | 'delete' = 'create';
      if (rawAction === 'delete') {
        normAction = 'delete';
      } else if (rawAction === 'update' || rawAction === 'edit' || rawAction === 'modify') {
        normAction = 'update';
      }

      // Avoid duplicates if already parsed via XML
      if (!actions.some((a) => a.path === rawPath && a.type === normAction)) {
        actions.push({
          type: normAction,
          path: rawPath,
          content: rawContentInner,
          language: getFileLanguage(rawPath),
        });
      }
    }
  }

  return actions;
}

/**
 * Strips raw <file_action> tags or cleans them for text display if needed
 */
export function removeRawFileActionTags(rawContent: string): string {
  if (!rawContent) return '';
  return rawContent
    .replace(
      /<file_action\s+(?:(?:action=["'][^"']+["']\s+path=["'][^"']+["'])|(?:path=["'][^"']+["']\s+action=["'][^"']+["']))\s*(?:\/>|>([\s\S]*?)<\/file_action>)/gi,
      ''
    )
    .replace(/```file:(create|update|delete|edit|modify):[^\s\n]+\s*\n[\s\S]*?```/gi, '')
    .trim();
}

/**
 * Determines file programming language or category from its extension
 */
export function getFileLanguage(filename: string): string {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    java: 'java',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    svg: 'svg',
    txt: 'text',
  };
  return map[ext] || 'text';
}

/**
 * Applies extracted file actions to the current workspace files list
 */
export function applyFileActionsToWorkspace(
  currentFiles: WorkspaceFile[] = [],
  actions: FileAction[]
): WorkspaceFile[] {
  let updated = [...currentFiles];

  for (const act of actions) {
    const normPath = act.path.trim();
    if (!normPath) continue;

    if (act.type === 'delete') {
      updated = updated.filter(
        (f) => f.path.toLowerCase() !== normPath.toLowerCase() && f.name.toLowerCase() !== normPath.toLowerCase()
      );
    } else if (act.type === 'create' || act.type === 'update') {
      const existingIdx = updated.findIndex(
        (f) => f.path.toLowerCase() === normPath.toLowerCase() || f.name.toLowerCase() === normPath.toLowerCase()
      );

      const fileName = normPath.split('/').pop() || normPath;
      const content = act.content || '';

      if (existingIdx >= 0) {
        // Update existing file
        updated[existingIdx] = {
          ...updated[existingIdx],
          path: normPath,
          name: fileName,
          content,
          language: act.language || getFileLanguage(fileName),
          updatedAt: Date.now(),
          lastAction: 'update',
          source: 'ai',
          size: new Blob([content]).size,
        };
      } else {
        // Create new file
        updated.push({
          id: `wfile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          path: normPath,
          name: fileName,
          content,
          language: act.language || getFileLanguage(fileName),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAction: 'create',
          source: 'ai',
          size: new Blob([content]).size,
        });
      }
    }
  }

  return updated;
}

/**
 * Converts FileAttachment into WorkspaceFile
 */
export function attachmentToWorkspaceFile(att: FileAttachment): WorkspaceFile | null {
  if (!att) return null;
  const content = att.textContent || (att.fileCategory === 'code' || att.fileCategory === 'text' ? att.data : '');
  if (!content && att.fileCategory !== 'image') return null;

  const fileName = att.name || 'file.txt';
  return {
    id: `wfile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: fileName,
    path: fileName,
    content: content || '',
    language: getFileLanguage(fileName),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastAction: 'create',
    source: 'user',
    size: att.size || (content ? new Blob([content]).size : 0),
  };
}

/**
 * Builds standard context representation of workspace files to inject into model prompts
 */
export function buildWorkspaceContextForPrompt(files: WorkspaceFile[]): string {
  if (!files || files.length === 0) return '';

  let context = `\n\n[Active Project Workspace Files (${files.length})]:\n`;
  for (const f of files) {
    const preview = f.content.length > 3000 ? `${f.content.substring(0, 3000)}\n... [truncated for context length]` : f.content;
    context += `\n--- File: ${f.path || f.name} (${f.language || 'text'}) ---\n\`\`\`${f.language || ''}\n${preview}\n\`\`\`\n`;
  }
  return context;
}

/**
 * Bundles all workspace files into a downloadable ZIP archive
 */
export async function exportWorkspaceAsZip(
  files: WorkspaceFile[],
  zipName = 'workspace-project.zip'
): Promise<void> {
  if (!files || files.length === 0) return;

  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.path || file.name, file.content);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

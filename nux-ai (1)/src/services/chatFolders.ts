import { ChatFolder } from '../types';

const CHAT_FOLDERS_STORAGE_KEY = 'nux_chat_folders_v1';

export function getStoredChatFolders(): ChatFolder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CHAT_FOLDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((f: any) => ({
          id: String(f.id || ''),
          name: String(f.name || '').trim(),
          createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now(),
          collapsed: typeof f.collapsed === 'boolean' ? f.collapsed : false,
        }))
        .filter((f) => f.id && f.name);
    }
  } catch (_) {}
  return [];
}

export function saveStoredChatFolders(folders: ChatFolder[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHAT_FOLDERS_STORAGE_KEY, JSON.stringify(folders));
    window.dispatchEvent(new CustomEvent('chat-folders-updated', { detail: folders }));
  } catch (_) {}
}

export function createChatFolder(name: string): ChatFolder {
  const folders = getStoredChatFolders();
  const trimmed = name.trim();
  const newFolder: ChatFolder = {
    id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: trimmed,
    createdAt: Date.now(),
    collapsed: false,
  };
  folders.push(newFolder);
  saveStoredChatFolders(folders);
  return newFolder;
}

export function renameChatFolder(id: string, newName: string): void {
  const folders = getStoredChatFolders();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx === -1) return;
  folders[idx].name = newName.trim();
  saveStoredChatFolders(folders);
}

export function deleteChatFolder(id: string): void {
  const folders = getStoredChatFolders().filter((f) => f.id !== id);
  saveStoredChatFolders(folders);
}

export function toggleFolderCollapsed(id: string): void {
  const folders = getStoredChatFolders();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx === -1) return;
  folders[idx].collapsed = !folders[idx].collapsed;
  saveStoredChatFolders(folders);
}

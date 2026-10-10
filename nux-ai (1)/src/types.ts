export type Role = 'user' | 'assistant' | 'system';

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  data: string;
  fileCategory: 'image' | 'pdf' | 'audio' | 'code' | 'text' | 'document' | 'other';
  textContent?: string;
}

export interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
  domain?: string;
}

export interface SearchMetadata {
  isSearching?: boolean;
  query?: string;
  sources?: SearchSource[];
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  text?: string;
  timestamp: number;
  modelUsed?: string;
  isStreaming?: boolean;
  error?: boolean;
  isError?: boolean;
  sender?: 'user' | 'ai' | Role;
  modelId?: string;
  images?: string[];
  attachments?: FileAttachment[];
  searchMetadata?: SearchMetadata;
  isDeepThinking?: boolean;
  rawError?: string;
  versions?: string[];
  activeVersionIndex?: number;
}

export type ChatMessage = Message;

export interface ChatFolder {
  id: string;
  name: string;
  createdAt: number;
  collapsed?: boolean;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language?: string;
  createdAt: number;
  updatedAt: number;
  lastAction?: 'create' | 'update' | 'delete';
  source?: 'user' | 'ai';
  size?: number;
}

export interface FileAction {
  type: 'create' | 'update' | 'delete';
  path: string;
  content?: string;
  language?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  modelId: string;
  isIncognito?: boolean;
  folderId?: string | null;
  workspaceFiles?: WorkspaceFile[];
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  groupName?: string;
  description: string;
  descriptionEn?: string;
  badge?: string;
  badgeEn?: string;
  highlight?: boolean;
  contextWindow?: string;
  iconType: string;
  size?: string;
  isLocal?: boolean;
  plan?: string;
  rateLimit?: string;
  rateLimitEn?: string;
}

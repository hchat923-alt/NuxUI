export interface UserModelGroup {
  id: string;
  name: string;
  modelIds: string[];
  createdAt: number;
}

const STORAGE_KEY = 'user_created_model_groups_v1';

export function getUserModelGroups(): UserModelGroup[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed
        .map((g) => ({
          id: String(g.id || ''),
          name: String(g.name || '').trim(),
          modelIds: Array.isArray(g.modelIds) ? g.modelIds.map(String) : [],
          createdAt: typeof g.createdAt === 'number' ? g.createdAt : Date.now(),
        }))
        .filter((g) => g.id && g.name && g.modelIds.length > 0);

      // If any empty groups were pruned, update localStorage silently
      if (valid.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      }
      return valid;
    }
  } catch (_) {}
  return [];
}

export function saveUserModelGroups(groups: UserModelGroup[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
    window.dispatchEvent(new CustomEvent('user-model-groups-updated', { detail: groups }));
  } catch (_) {}
}

export function createUserModelGroup(name: string, modelIds: string[] = []): UserModelGroup {
  const groups = getUserModelGroups();
  const newGroup: UserModelGroup = {
    id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim(),
    modelIds: [...modelIds],
    createdAt: Date.now(),
  };
  groups.push(newGroup);
  saveUserModelGroups(groups);
  return newGroup;
}

export function updateUserModelGroup(
  id: string,
  updates: Partial<Pick<UserModelGroup, 'name' | 'modelIds'>>
): void {
  const groups = getUserModelGroups();
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) return;

  if (updates.name !== undefined) {
    groups[idx].name = updates.name.trim();
  }
  if (updates.modelIds !== undefined) {
    groups[idx].modelIds = Array.from(new Set(updates.modelIds));
  }

  saveUserModelGroups(groups);
}

export function deleteUserModelGroup(id: string): void {
  const groups = getUserModelGroups().filter((g) => g.id !== id);
  saveUserModelGroups(groups);
}

export function syncServerGroup(groupName: string, modelIds: string[]): UserModelGroup {
  const groups = getUserModelGroups();
  const trimmedName = groupName.trim();
  const existingIdx = groups.findIndex((g) => g.name.toLowerCase() === trimmedName.toLowerCase());

  if (existingIdx >= 0) {
    // Merge new modelIds into existing group
    const combined = Array.from(new Set([...groups[existingIdx].modelIds, ...modelIds]));
    groups[existingIdx].modelIds = combined;
    saveUserModelGroups(groups);
    return groups[existingIdx];
  } else {
    // Create new group for this server
    const newGroup: UserModelGroup = {
      id: `group_server_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: trimmedName,
      modelIds: Array.from(new Set(modelIds)),
      createdAt: Date.now(),
    };
    groups.push(newGroup);
    saveUserModelGroups(groups);
    return newGroup;
  }
}

export function toggleModelInGroup(groupId: string, modelId: string): void {
  const groups = getUserModelGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return;

  if (group.modelIds.includes(modelId)) {
    group.modelIds = group.modelIds.filter((id) => id !== modelId);
  } else {
    group.modelIds.push(modelId);
  }

  saveUserModelGroups(groups);
}



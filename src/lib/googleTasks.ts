import { getAccessToken, isAuthorized } from './auth';

export interface JhatpatItem {
  id: string;
  title: string;
  notes: string; // contains the nested checklist
  due: string | null; // YYYY-MM-DD
  status: 'needsAction' | 'completed';
  isNote: boolean; // if true, lives in Notes view
  listType: 'tasks' | 'notes' | 'archive';
  updated: string; // ISO string
  localOnly?: boolean;
}

interface PendingOperation {
  id: string;
  action: 'create' | 'update' | 'delete' | 'move';
  item: JhatpatItem;
  targetListType?: 'tasks' | 'notes' | 'archive';
  timestamp: number;
}

// Local storage keys
const LOCAL_ITEMS_KEY = 'jhatpat_local_items';
const PENDING_QUEUE_KEY = 'jhatpat_pending_queue';
const NOTES_LIST_ID_KEY = 'jhatpat_notes_list_id';
const ARCHIVE_LIST_ID_KEY = 'jhatpat_archive_list_id';

// Local-only ID generator
function generateLocalId(): string {
  return 'local_' + Math.random().toString(36).substring(2, 15);
}

// Helper to make API calls with auth
async function callTasksAPI(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any
): Promise<any> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Not authorized');
  }

  const headers: HeadersInit = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const config: RequestInit = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`https://tasks.googleapis.com/v1${endpoint}`, config);
  
  if (response.status === 401) {
    // Auth token expired
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  if (method === 'DELETE' || response.status === 204) {
    return null;
  }

  return response.json();
}

// Ensure the custom list exists on Google Tasks, create it if not
async function getOrCreateCustomList(title: string, storageKey: string): Promise<string> {
  const cachedId = localStorage.getItem(storageKey);
  if (cachedId) return cachedId;

  // Fetch all lists to see if it already exists
  const data = await callTasksAPI('/users/@me/lists');
  const lists = data.items || [];
  const existingList = lists.find((l: any) => l.title === title);

  if (existingList) {
    localStorage.setItem(storageKey, existingList.id);
    return existingList.id;
  }

  // Create list
  const newList = await callTasksAPI('/users/@me/lists', 'POST', { title });
  localStorage.setItem(storageKey, newList.id);
  return newList.id;
}

export async function getNotesListId(): Promise<string> {
  return getOrCreateCustomList('Jhatpat Notes', NOTES_LIST_ID_KEY);
}

export async function getArchiveListId(): Promise<string> {
  return getOrCreateCustomList('Jhatpat Archive', ARCHIVE_LIST_ID_KEY);
}

// Queue offline operations
function queueOperation(op: Omit<PendingOperation, 'timestamp'>): void {
  const queueJson = localStorage.getItem(PENDING_QUEUE_KEY);
  const queue: PendingOperation[] = queueJson ? JSON.parse(queueJson) : [];
  queue.push({ ...op, timestamp: Date.now() });
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
}

// Get cached items
export function getCachedItems(): JhatpatItem[] {
  const itemsJson = localStorage.getItem(LOCAL_ITEMS_KEY);
  return itemsJson ? JSON.parse(itemsJson) : [];
}

// Save items locally (cache)
export function saveCachedItems(items: JhatpatItem[]): void {
  localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items));
}

// Fetch all items from Google Tasks or return local items if offline/local-only
export async function fetchItems(_forceSync = false): Promise<JhatpatItem[]> {
  if (!isAuthorized()) {
    // Local-only mode
    return getCachedItems();
  }

  try {
    // If online, process queue first
    if (navigator.onLine) {
      await processPendingQueue();
    }

    const notesListId = await getNotesListId();
    const archiveListId = await getArchiveListId();

    // 1. Fetch from @default (tasks list) - active and completed
    const defaultData = await callTasksAPI('/lists/@default/tasks?showCompleted=true&showHidden=true&maxResults=100');
    const defaultTasks = (defaultData.items || []).map((t: any) => ({
      id: t.id,
      title: t.title || '',
      notes: t.notes || '',
      due: t.due ? t.due.substring(0, 10) : null,
      status: t.status as 'needsAction' | 'completed',
      isNote: false,
      listType: 'tasks' as const,
      updated: t.updated || new Date().toISOString(),
    }));

    // 2. Fetch from Quick-Capture Notes
    const notesData = await callTasksAPI(`/lists/${notesListId}/tasks?showCompleted=true&showHidden=true&maxResults=100`);
    const notesTasks = (notesData.items || []).map((t: any) => ({
      id: t.id,
      title: t.title || '',
      notes: t.notes || '',
      due: t.due ? t.due.substring(0, 10) : null,
      status: t.status as 'needsAction' | 'completed',
      isNote: true,
      listType: 'notes' as const,
      updated: t.updated || new Date().toISOString(),
    }));

    // 3. Fetch from Quick-Capture Archive
    const archiveData = await callTasksAPI(`/lists/${archiveListId}/tasks?showCompleted=true&showHidden=true&maxResults=100`);
    const archiveTasks = (archiveData.items || []).map((t: any) => ({
      id: t.id,
      title: t.title || '',
      notes: t.notes || '',
      due: t.due ? t.due.substring(0, 10) : null,
      status: t.status as 'needsAction' | 'completed',
      isNote: false,
      listType: 'archive' as const,
      updated: t.updated || new Date().toISOString(),
    }));

    // Filter out deleted/hidden tasks if needed
    const allItems: JhatpatItem[] = [...defaultTasks, ...notesTasks, ...archiveTasks];
    saveCachedItems(allItems);
    return allItems;
  } catch (error) {
    console.error('Failed to sync with Google Tasks, using cached local items:', error);
    return getCachedItems();
  }
}

// Create an item
export async function createItem(itemData: Omit<JhatpatItem, 'id' | 'updated'>): Promise<JhatpatItem> {
  const newItem: JhatpatItem = {
    ...itemData,
    id: generateLocalId(),
    updated: new Date().toISOString(),
    localOnly: !isAuthorized(),
  };

  // Optimistic save
  const currentItems = getCachedItems();
  saveCachedItems([newItem, ...currentItems]);

  if (!isAuthorized()) {
    return newItem;
  }

  // If connected, sync to Google Tasks
  if (navigator.onLine) {
    try {
      let listId = '@default';
      if (newItem.listType === 'notes') {
        listId = await getNotesListId();
      } else if (newItem.listType === 'archive') {
        listId = await getArchiveListId();
      }

      const body: any = {
        title: newItem.title,
        notes: newItem.notes,
        status: newItem.status,
      };
      if (newItem.due) {
        body.due = `${newItem.due}T00:00:00.000Z`;
      }

      const created = await callTasksAPI(`/lists/${listId}/tasks`, 'POST', body);
      
      // Update the local cache with the real Google ID
      const updatedItems = getCachedItems().map(it => 
        it.id === newItem.id ? { ...it, id: created.id, updated: created.updated } : it
      );
      saveCachedItems(updatedItems);
      newItem.id = created.id;
      newItem.updated = created.updated;
    } catch (error) {
      console.warn('Network request failed, queuing create operation:', error);
      queueOperation({ id: newItem.id, action: 'create', item: newItem });
    }
  } else {
    queueOperation({ id: newItem.id, action: 'create', item: newItem });
  }

  return newItem;
}

// Update an item
export async function updateItem(item: JhatpatItem): Promise<JhatpatItem> {
  const updatedItem = {
    ...item,
    updated: new Date().toISOString(),
  };

  // Optimistic save
  const currentItems = getCachedItems();
  saveCachedItems(currentItems.map(it => it.id === item.id ? updatedItem : it));

  if (!isAuthorized() || updatedItem.localOnly) {
    return updatedItem;
  }

  if (navigator.onLine) {
    try {
      let listId = '@default';
      if (updatedItem.listType === 'notes') {
        listId = await getNotesListId();
      } else if (updatedItem.listType === 'archive') {
        listId = await getArchiveListId();
      }

      const body: any = {
        id: updatedItem.id,
        title: updatedItem.title,
        notes: updatedItem.notes,
        status: updatedItem.status,
      };
      if (updatedItem.due) {
        body.due = `${updatedItem.due}T00:00:00.000Z`;
      } else {
        body.due = null; // Clear date
      }

      await callTasksAPI(`/lists/${listId}/tasks/${updatedItem.id}`, 'PUT', body);
    } catch (error) {
      console.warn('Network request failed, queuing update operation:', error);
      queueOperation({ id: updatedItem.id, action: 'update', item: updatedItem });
    }
  } else {
    queueOperation({ id: updatedItem.id, action: 'update', item: updatedItem });
  }

  return updatedItem;
}

// Move an item across lists (e.g. archive, task, or note)
// Google API doesn't support moving tasks between lists, so we DELETE from original list and CREATE in new list
export async function moveItemToList(item: JhatpatItem, targetListType: 'tasks' | 'notes' | 'archive'): Promise<JhatpatItem> {
  const originalListType = item.listType;
  if (originalListType === targetListType) return item;

  const movedItem: JhatpatItem = {
    ...item,
    listType: targetListType,
    updated: new Date().toISOString(),
  };

  // Optimistic save
  const currentItems = getCachedItems();
  saveCachedItems(currentItems.map(it => it.id === item.id ? movedItem : it));

  if (!isAuthorized() || movedItem.localOnly) {
    return movedItem;
  }

  if (navigator.onLine) {
    try {
      let sourceListId = '@default';
      if (originalListType === 'notes') {
        sourceListId = await getNotesListId();
      } else if (originalListType === 'archive') {
        sourceListId = await getArchiveListId();
      }

      let targetListId = '@default';
      if (targetListType === 'notes') {
        targetListId = await getNotesListId();
      } else if (targetListType === 'archive') {
        targetListId = await getArchiveListId();
      }

      // 1. Delete from source list
      await callTasksAPI(`/lists/${sourceListId}/tasks/${item.id}`, 'DELETE');

      // 2. Create in target list
      const body: any = {
        title: movedItem.title,
        notes: movedItem.notes,
        status: movedItem.status,
      };
      if (movedItem.due) {
        body.due = `${movedItem.due}T00:00:00.000Z`;
      }
      const created = await callTasksAPI(`/lists/${targetListId}/tasks`, 'POST', body);

      // 3. Update ID and cache
      const updatedItems = getCachedItems().map(it => 
        it.id === item.id ? { ...it, id: created.id, updated: created.updated } : it
      );
      saveCachedItems(updatedItems);
      movedItem.id = created.id;
    } catch (error) {
      console.warn('Network request failed, queuing move operation:', error);
      queueOperation({ id: item.id, action: 'move', item: movedItem, targetListType });
    }
  } else {
    queueOperation({ id: item.id, action: 'move', item: movedItem, targetListType });
  }

  return movedItem;
}

// Delete an item permanently
export async function deleteItemPermanently(itemId: string, listType: 'tasks' | 'notes' | 'archive'): Promise<void> {
  const currentItems = getCachedItems();
  saveCachedItems(currentItems.filter(it => it.id !== itemId));

  const isLocal = itemId.startsWith('local_');

  if (!isAuthorized() || isLocal) {
    return;
  }

  if (navigator.onLine) {
    try {
      let listId = '@default';
      if (listType === 'notes') {
        listId = await getNotesListId();
      } else if (listType === 'archive') {
        listId = await getArchiveListId();
      }

      await callTasksAPI(`/lists/${listId}/tasks/${itemId}`, 'DELETE');
    } catch (error) {
      console.warn('Network request failed, queuing delete operation:', error);
      queueOperation({ id: itemId, action: 'delete', item: { id: itemId, listType } as any });
    }
  } else {
    queueOperation({ id: itemId, action: 'delete', item: { id: itemId, listType } as any });
  }
}

// Merge local-only items with Google Tasks on login
export async function mergeLocalItemsToCloud(): Promise<void> {
  if (!isAuthorized()) return;

  const localItems = getCachedItems();
  const localOnlyItems = localItems.filter(it => it.localOnly || it.id.startsWith('local_'));
  
  if (localOnlyItems.length === 0) return;

  const notesListId = await getNotesListId();
  const archiveListId = await getArchiveListId();

  // Upload each local-only task to Google
  for (const item of localOnlyItems) {
    try {
      let listId = '@default';
      if (item.listType === 'notes') {
        listId = notesListId;
      } else if (item.listType === 'archive') {
        listId = archiveListId;
      }

      const body: any = {
        title: item.title,
        notes: item.notes,
        status: item.status,
      };
      if (item.due) {
        body.due = `${item.due}T00:00:00.000Z`;
      }

      const created = await callTasksAPI(`/lists/${listId}/tasks`, 'POST', body);
      
      // Update item in local list
      const current = getCachedItems();
      saveCachedItems(current.map(it => 
        it.id === item.id ? { ...it, id: created.id, localOnly: false, updated: created.updated } : it
      ));
    } catch (e) {
      console.error('Failed to upload local item to cloud during merge:', item, e);
    }
  }
}

// Process pending operations queue
export async function processPendingQueue(): Promise<void> {
  const queueJson = localStorage.getItem(PENDING_QUEUE_KEY);
  if (!queueJson) return;

  const queue: PendingOperation[] = JSON.parse(queueJson);
  if (queue.length === 0) return;

  const failedOps: PendingOperation[] = [];

  const notesListId = await getNotesListId().catch(() => '');
  const archiveListId = await getArchiveListId().catch(() => '');

  for (const op of queue) {
    try {
      const item = op.item;
      let listId = '@default';
      if (item.listType === 'notes') listId = notesListId;
      else if (item.listType === 'archive') listId = archiveListId;

      if (!listId) {
        failedOps.push(op);
        continue;
      }

      if (op.action === 'create') {
        const body: any = { title: item.title, notes: item.notes, status: item.status };
        if (item.due) body.due = `${item.due}T00:00:00.000Z`;
        
        const created = await callTasksAPI(`/lists/${listId}/tasks`, 'POST', body);
        
        // Update IDs in cache
        const current = getCachedItems();
        saveCachedItems(current.map(it => 
          it.id === op.id ? { ...it, id: created.id, updated: created.updated } : it
        ));
      } 
      else if (op.action === 'update') {
        const body: any = { id: item.id, title: item.title, notes: item.notes, status: item.status };
        if (item.due) body.due = `${item.due}T00:00:00.000Z`;
        else body.due = null;

        await callTasksAPI(`/lists/${listId}/tasks/${item.id}`, 'PUT', body);
      } 
      else if (op.action === 'delete') {
        await callTasksAPI(`/lists/${listId}/tasks/${item.id}`, 'DELETE');
      } 
      else if (op.action === 'move') {
        const targetType = op.targetListType || 'tasks';
        let targetListId = '@default';
        if (targetType === 'notes') targetListId = notesListId;
        else if (targetType === 'archive') targetListId = archiveListId;

        // Delete from original list
        await callTasksAPI(`/lists/${listId}/tasks/${item.id}`, 'DELETE').catch(() => {});

        // Recreate in target list
        const body: any = { title: item.title, notes: item.notes, status: item.status };
        if (item.due) body.due = `${item.due}T00:00:00.000Z`;
        
        const created = await callTasksAPI(`/lists/${targetListId}/tasks`, 'POST', body);

        // Update ID in cache
        const current = getCachedItems();
        saveCachedItems(current.map(it => 
          it.id === op.id ? { ...it, id: created.id, listType: targetType, updated: created.updated } : it
        ));
      }
    } catch (err) {
      console.error('Failed to sync queue operation:', op, err);
      failedOps.push(op);
    }
  }

  // Save remaining failed operations back to queue
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(failedOps));
}

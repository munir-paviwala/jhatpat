import { useState, useEffect } from 'react';
import { Settings, LogOut, X } from 'lucide-react';
import { CaptureBar } from './components/CaptureBar';
import { TaskRow } from './components/TaskRow';
import { ViewTabs } from './components/ViewTabs';
import type { TabType } from './components/ViewTabs';
import { ChecklistEditor } from './components/ChecklistEditor';
import { parseNoteToChecklist } from './lib/parseChecklist';
import type { JhatpatItem } from './lib/googleTasks';
import { 
  fetchItems, 
  createItem, 
  updateItem, 
  moveItemToList, 
  deleteItemPermanently,
  getCachedItems,
  mergeLocalItemsToCloud,
  processPendingQueue
} from './lib/googleTasks';
import { 
  isAuthorized, 
  initiateAuth, 
  logout, 
  getGoogleClientId, 
  setGoogleClientId 
} from './lib/auth';

function App() {
  const [items, setItems] = useState<JhatpatItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [editingItem, setEditingItem] = useState<JhatpatItem | null>(null);
  const [isCloudLinked, setIsCloudLinked] = useState(isAuthorized());
  const [clientId, setClientId] = useState(getGoogleClientId());
  const [showSettings, setShowSettings] = useState(false);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState('');

  // 1. Initial Load and Online/Offline Listeners
  useEffect(() => {
    // Load local items first (cache)
    setItems(getCachedItems());

    const handleOnline = () => {
      if (isCloudLinked) {
        setSyncStatusMsg('Back online! Syncing queue...');
        processPendingQueue()
          .then(() => fetchItems())
          .then((res) => {
            setItems(res);
            setSyncStatusMsg('');
          })
          .catch(err => {
            console.error(err);
            setSyncStatusMsg('');
          });
      }
    };

    window.addEventListener('online', handleOnline);

    // Initial Sync
    syncAll();

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [isCloudLinked]);

  const syncAll = async () => {
    setIsLoading(true);
    try {
      const allItems = await fetchItems();
      setItems(allItems);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Add New Captured Item
  const handleCapture = async (parsed: { title: string; dueDate: string | null; isNote: boolean }) => {
    const listType: 'tasks' | 'notes' = parsed.isNote ? 'notes' : 'tasks';
    
    const newItem = await createItem({
      title: parsed.title,
      notes: '',
      due: parsed.dueDate,
      status: 'needsAction',
      isNote: parsed.isNote,
      listType
    });

    setItems(prev => [newItem, ...prev]);
  };

  // 3. Toggle Complete
  const handleToggleComplete = async (item: JhatpatItem) => {
    const nextStatus = item.status === 'completed' ? 'needsAction' : 'completed';
    const updated = await updateItem({
      ...item,
      status: nextStatus
    });

    setItems(prev => prev.map(it => it.id === item.id ? updated : it));
  };

  // 4. Move to another list (e.g. from Someday to Notes or Archive)
  const handleMoveList = async (item: JhatpatItem, targetListType: 'tasks' | 'notes' | 'archive') => {
    const isNote = targetListType === 'notes';
    const updated = await moveItemToList({ ...item, isNote }, targetListType);
    setItems(prev => prev.map(it => it.id === item.id ? updated : it));
  };

  // 5. Save edited item
  const handleSaveEdit = async (updated: JhatpatItem) => {
    const saved = await updateItem(updated);
    setItems(prev => prev.map(it => it.id === saved.id ? saved : it));
    setEditingItem(null);
  };

  // 6. Delete item permanently
  const handleDelete = async (item: JhatpatItem) => {
    await deleteItemPermanently(item.id, item.listType);
    setItems(prev => prev.filter(it => it.id !== item.id));
  };

  // 7. Google OAuth actions
  const handleGoogleLogin = () => {
    if (!clientId.trim()) {
      setShowSettings(true);
      setShowAdvancedConfig(true);
      alert('A Google OAuth Client ID is required to link your account. Please configure it in the "Advanced Developer Settings" below.');
      return;
    }
    
    setIsLoading(true);
    setGoogleClientId(clientId);

    initiateAuth(
      async () => {
        setIsCloudLinked(true);
        setSyncStatusMsg('Authentication successful! Merging items...');
        try {
          await mergeLocalItemsToCloud();
          const synced = await fetchItems(true);
          setItems(synced);
          setShowSettings(false);
        } catch (e) {
          console.error(e);
        } finally {
          setIsLoading(false);
          setSyncStatusMsg('');
        }
      },
      (err) => {
        setIsLoading(false);
        alert('Authentication failed: ' + (err.message || JSON.stringify(err)));
      }
    );
  };

  const handleGoogleLogout = () => {
    logout();
    setIsCloudLinked(false);
    // Convert all items back to localOnly representation in UI
    setItems(prev => prev.map(it => ({ ...it, localOnly: true })));
  };

  const handleSaveClientIdOnly = () => {
    setGoogleClientId(clientId);
    alert('Google Client ID saved. Click "Link Google Tasks" to authorize.');
  };

  const handleClearCache = () => {
    if (window.confirm('This will delete all local tasks and notes permanently. Are you sure you want to proceed?')) {
      localStorage.clear();
      setItems([]);
      alert('Local storage has been successfully reset.');
      window.location.reload();
    }
  };

  // 8. Filters for tabs
  const getTodayStr = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = getTodayStr();

  const filteredItems = items.filter((item) => {
    if (activeTab === 'today') {
      return (
        item.listType === 'tasks' &&
        item.status === 'needsAction' &&
        item.due !== null &&
        item.due <= todayStr
      );
    }
    if (activeTab === 'upcoming') {
      return (
        item.listType === 'tasks' &&
        item.status === 'needsAction' &&
        item.due !== null &&
        item.due > todayStr
      );
    }
    if (activeTab === 'someday') {
      return (
        item.listType === 'tasks' &&
        item.status === 'needsAction' &&
        item.due === null
      );
    }
    if (activeTab === 'notes') {
      return item.listType === 'notes';
    }
    if (activeTab === 'archive') {
      return item.listType === 'archive' || (item.listType === 'tasks' && item.status === 'completed');
    }
    return false;
  });

  // Calculate counts for side tabs
  const tabCounts = {
    today: items.filter(
      (item) => item.listType === 'tasks' && item.status === 'needsAction' && item.due !== null && item.due <= todayStr
    ).length,
    upcoming: items.filter(
      (item) => item.listType === 'tasks' && item.status === 'needsAction' && item.due !== null && item.due > todayStr
    ).length,
    someday: items.filter(
      (item) => item.listType === 'tasks' && item.status === 'needsAction' && item.due === null
    ).length,
    notes: items.filter((item) => item.listType === 'notes').length,
    archive: items.filter(
      (item) => item.listType === 'archive' || (item.listType === 'tasks' && item.status === 'completed')
    ).length,
  };

  // Parse nested checklist items of standard tasks in view list
  const toggleNestedChecklistItem = async (task: JhatpatItem, lineId: string) => {
    const lines = parseNoteToChecklist(task.notes);
    const updatedLines = lines.map(line => 
      line.id === lineId ? { ...line, completed: !line.completed } : line
    );
    
    // Convert back to string
    const indent = '  ';
    const serialized = updatedLines.map(line => {
      const indentation = indent.repeat(line.indent);
      if (line.isCheckbox) {
        return `${indentation}${line.completed ? '[x]' : '[ ]'} ${line.text}`;
      }
      return line.text ? `${indentation}${line.text}` : '';
    }).join('\n');

    const updatedTask = { ...task, notes: serialized };
    setItems(prev => prev.map(it => it.id === task.id ? updatedTask : it));
    await updateItem(updatedTask);
  };

  return (
    <div className="folder-container">
      {/* Folder Header */}
      <header className="folder-header">
        <div className="header-flourish">
          <span className="flourish-symbol">❦</span>
          <span className="flourish-symbol">❧</span>
          <span className="flourish-symbol">❦</span>
        </div>
        <h1>Jhatpat</h1>
        <span className="header-subtitle">a simple to-do ledger of thoughts & actions</span>

        {/* Sync/Status indicators */}
        {(isLoading || syncStatusMsg) && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--saffron-sepia)' }}>
            {isLoading && <span className="handwritten">syncing...</span>}
            {syncStatusMsg && <span>{syncStatusMsg}</span>}
          </div>
        )}
      </header>

      {/* Settings / Google Integration Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button 
          className="one-tap-btn"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings size={12} />
          {showSettings ? 'Hide Configuration' : 'Link Google Account / Settings'}
        </button>
      </div>

      {/* Settings Collapsible Box */}
      {showSettings && (
        <section className="settings-box">
          <div className="settings-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <div>
              <div className="settings-title">Google Account Integration</div>
              <div className="settings-description">
                Link Jhatpat to your Google Tasks account. It will synchronize all items in the background.
              </div>
            </div>
            {isCloudLinked ? (
              <button className="btn btn-secondary" onClick={handleGoogleLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <LogOut size={14} /> Unlink Account
              </button>
            ) : (
              <button className="google-signin-btn" onClick={handleGoogleLogin} style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                <svg className="google-icon" viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </button>
            )}
          </div>

          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
            <button 
              className="one-tap-btn"
              onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {showAdvancedConfig ? '▼ Hide Advanced Configuration' : '▶ Advanced Setup (Google Client ID)'}
            </button>
            
            {showAdvancedConfig && (
              <div className="field-group" style={{ marginTop: '12px' }}>
                <label className="field-label">Google OAuth Client ID</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Enter your Google OAuth Client ID"
                    className="text-input"
                    disabled={isCloudLinked}
                    style={{ flex: 1 }}
                  />
                  {!isCloudLinked && (
                    <button className="btn btn-secondary" onClick={handleSaveClientIdOnly}>
                      Save ID
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '6px', lineHeight: '1.4' }}>
                  To link Jhatpat to Google Tasks, generate an OAuth Client ID in your Google Cloud Console. Enable the <code>auth/tasks</code> scope and add this domain to the Authorized JavaScript Origins.
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-light)', fontFamily: 'IBM Plex Mono, monospace' }}>
              Want to clean up local test data?
            </span>
            <button 
              className="one-tap-btn"
              onClick={handleClearCache}
              style={{ fontSize: '11px', padding: '4px 8px', color: '#b91c1c', borderColor: '#fca5a5' }}
            >
              Reset App Data
            </button>
          </div>
        </section>
      )}

      {/* ❦ Ornamental Separator ❦ */}
      <div className="view-section-divider">
        <span>❧ ❦ ❧</span>
      </div>

      {/* Capture Input Bar */}
      <CaptureBar onCapture={handleCapture} />

      {/* ❧ Side Tabs Navigation (Bottom bar on mobile) ❧ */}
      <ViewTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        counts={tabCounts}
      />

      {/* Active View List of Items */}
      <main className="items-list" style={{ marginTop: '24px' }}>
        {filteredItems.length === 0 ? (
          <div className="empty-state">
            {activeTab === 'today' && 'No tasks due today. Sab khairiyat hai!'}
            {activeTab === 'upcoming' && 'No upcoming actions scheduled.'}
            {activeTab === 'someday' && 'No dateless tasks. Capture some ideas above!'}
            {activeTab === 'notes' && 'No notes or brain dumps captured.'}
            {activeTab === 'archive' && 'Archive is empty.'}
          </div>
        ) : (
          filteredItems.map((item) => (
            <div key={item.id}>
              <TaskRow
                item={item}
                onToggleComplete={handleToggleComplete}
                onMoveList={handleMoveList}
                onEdit={(item) => setEditingItem(item)}
                onDelete={handleDelete}
              />

              {/* Render Nested Checklist inline on Task Details if it has one */}
              {activeTab !== 'archive' && parseNoteToChecklist(item.notes).filter(l => l.isCheckbox).length > 0 && (
                <div className="nested-checklist-container" style={{ margin: '4px 0 12px 48px' }}>
                  {parseNoteToChecklist(item.notes).map((line) => {
                    if (line.isCheckbox) {
                      return (
                        <div 
                          key={line.id} 
                          className="nested-checklist-row"
                          style={{ paddingLeft: `${line.indent * 16}px` }}
                        >
                          <span 
                            className={`nested-checklist-checkbox ${line.completed ? 'checked' : ''}`}
                            onClick={() => toggleNestedChecklistItem(item, line.id)}
                          >
                            {line.completed ? '❦' : '☐'}
                          </span>
                          <span className={`nested-checklist-text ${line.completed ? 'checked' : ''}`}>
                            {line.text}
                          </span>
                        </div>
                      );
                    }
                    // Non-checkbox note lines can be rendered inline as well
                    return line.text.trim() ? (
                      <div 
                        key={line.id} 
                        className="nested-checklist-row"
                        style={{ paddingLeft: `${line.indent * 16}px`, fontStyle: 'italic', fontSize: '12px', color: 'var(--text-light)' }}
                      >
                        {line.text}
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </main>

      {/* ❧ Edit Details Modal ❧ */}
      {editingItem && (
        <div className="details-backdrop" onClick={() => setEditingItem(null)}>
          <div className="details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="details-header">
              <h3>Edit Ledger Entry</h3>
              <button className="details-close-btn" onClick={() => setEditingItem(null)}>
                <X size={16} />
              </button>
            </div>
            
            <div className="details-body">
              {/* Title input */}
              <div className="field-group">
                <label className="field-label">Entry Description</label>
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="text-input"
                />
              </div>

              {/* List switch (Tasks vs Notes) */}
              <div className="field-group">
                <label className="field-label">Category</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    className={`btn ${editingItem.listType === 'tasks' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setEditingItem({ 
                      ...editingItem, 
                      listType: 'tasks',
                      isNote: false 
                    })}
                  >
                    Actionable Task
                  </button>
                  <button
                    className={`btn ${editingItem.listType === 'notes' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setEditingItem({ 
                      ...editingItem, 
                      listType: 'notes', 
                      due: null,
                      isNote: true 
                    })}
                  >
                    Thought / Note
                  </button>
                </div>
              </div>

              {/* Due Date picker (only for tasks) */}
              {editingItem.listType === 'tasks' && (
                <div className="field-group">
                  <label className="field-label">Due Date</label>
                  <input
                    type="date"
                    value={editingItem.due || ''}
                    onChange={(e) => setEditingItem({ 
                      ...editingItem, 
                      due: e.target.value || null 
                    })}
                    className="text-input"
                  />
                  {editingItem.due && (
                    <button 
                      className="one-tap-btn"
                      style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                      onClick={() => setEditingItem({ ...editingItem, due: null })}
                    >
                      Clear Date
                    </button>
                  )}
                </div>
              )}

              {/* Checklist Editor */}
              <div className="field-group">
                <label className="field-label">Checklist &amp; Notes</label>
                <ChecklistEditor
                  value={editingItem.notes}
                  onChange={(val) => setEditingItem({ ...editingItem, notes: val })}
                />
              </div>
            </div>

            <div className="details-footer">
              <button className="btn btn-secondary" onClick={() => setEditingItem(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => handleSaveEdit(editingItem)}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

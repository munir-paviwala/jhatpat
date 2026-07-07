import { useState, useRef } from 'react';
import { Calendar, Trash2, Edit3, BookOpen, CheckSquare } from 'lucide-react';
import type { JhatpatItem } from '../lib/googleTasks';
import { parseNoteToChecklist } from '../lib/parseChecklist';

interface TaskRowProps {
  item: JhatpatItem;
  onToggleComplete: (item: JhatpatItem) => void;
  onMoveList: (item: JhatpatItem, targetList: 'tasks' | 'notes' | 'archive') => void;
  onEdit: (item: JhatpatItem) => void;
  onDelete: (item: JhatpatItem) => void;
}

export const TaskRow: React.FC<TaskRowProps> = ({
  item,
  onToggleComplete,
  onMoveList,
  onEdit,
  onDelete,
}) => {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse notes to check if checklist exists
  const checklistLines = parseNoteToChecklist(item.notes);
  const checklistCheckboxes = checklistLines.filter((l) => l.isCheckbox);
  const completedCheckboxes = checklistCheckboxes.filter((l) => l.completed).length;
  const hasChecklist = checklistCheckboxes.length > 0;

  // Formatting date for displaying
  const getFormattedDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const dateObj = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const checkTime = dateObj.getTime();
    if (checkTime === today.getTime()) return 'Today';
    if (checkTime === tomorrow.getTime()) return 'Tomorrow';

    // Format like "Fri, Jul 14"
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const isOverdue = (dateStr: string | null) => {
    if (!dateStr || item.status === 'completed') return false;
    const dateObj = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dateObj.getTime() < today.getTime();
  };

  // Touch Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.targetTouches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const currentX = e.targetTouches[0].clientX;
    const diff = currentX - touchStartRef.current;

    // Apply some resistance
    if (diff > 120) {
      setTranslateX(120 + (diff - 120) * 0.2);
    } else if (diff < -120) {
      setTranslateX(-120 + (diff + 120) * 0.2);
    } else {
      setTranslateX(diff);
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    if (translateX > 90) {
      // Swiped Right -> Toggle Complete
      onToggleComplete(item);
    } else if (translateX < -90) {
      // Swiped Left -> Move to Archive
      if (item.listType !== 'archive') {
        onMoveList(item, 'archive');
      } else {
        // If already in archive, delete it
        onDelete(item);
      }
    }
    setTranslateX(0);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleComplete(item);
  };

  // Check if this item is eligible for the one-tap Note vs Task choice
  // (Has no due date, no checklist, in either tasks (Someday) or notes list, and is not completed)
  const showOneTapToggle =
    !item.due &&
    !hasChecklist &&
    item.status === 'needsAction' &&
    (item.listType === 'tasks' || item.listType === 'notes');

  return (
    <div className="task-row-wrapper" ref={containerRef}>
      {/* Background Actions Revealed on Swipe */}
      <div className="task-row-actions-bg">
        <div className="action-bg-left" style={{ opacity: translateX > 30 ? 1 : 0 }}>
          <CheckSquare size={16} /> Complete
        </div>
        <div className="action-bg-right" style={{ opacity: translateX < -30 ? 1 : 0 }}>
          <Trash2 size={16} /> {item.listType === 'archive' ? 'Delete' : 'Archive'}
        </div>
      </div>

      {/* Main Task Item */}
      <div
        className="task-row-content"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {/* Custom Checkbox (only show for non-notes or if user wants it) */}
        {!item.isNote && (
          <div className="checkbox-container" onClick={handleCheckboxClick}>
            <div className={`custom-checkbox ${item.status === 'completed' ? 'checked' : ''}`}>
              {item.status === 'completed' && <span className="flourish-symbol" style={{ color: '#fff', fontSize: '12px' }}>❦</span>}
            </div>
          </div>
        )}

        {item.isNote && (
          <div className="checkbox-container" style={{ cursor: 'default' }}>
            <span className="flourish-symbol" style={{ color: 'var(--plum)', fontSize: '14px' }}>❧</span>
          </div>
        )}

        {/* Task Text Details */}
        <div className="task-row-text-container" onClick={() => onEdit(item)}>
          <div className={`task-title ${item.status === 'completed' ? 'completed' : ''}`}>
            {item.title}
          </div>

          <div className="task-meta">
            {/* Due Date badge */}
            {item.due && (
              <span className={`task-date-badge ${isOverdue(item.due) ? 'overdue' : ''}`}>
                <Calendar size={10} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                {getFormattedDate(item.due)}
              </span>
            )}

            {/* Checklist progress */}
            {hasChecklist && (
              <span className="task-notes-indicator">
                <CheckSquare size={10} />
                {completedCheckboxes}/{checklistCheckboxes.length}
              </span>
            )}

            {/* General notes description indicator (if notes has text but no checkboxes) */}
            {!hasChecklist && item.notes.trim() && (
              <span className="task-notes-indicator" title="Has notes">
                <BookOpen size={10} /> note
              </span>
            )}

            {/* One-tap toggles if eligible */}
            {showOneTapToggle && (
              <div className="one-tap-toggle-box" onClick={(e) => e.stopPropagation()}>
                {item.listType === 'tasks' ? (
                  <button
                    className="one-tap-btn"
                    onClick={() => onMoveList(item, 'notes')}
                  >
                    Keep as Note
                  </button>
                ) : (
                  <button
                    className="one-tap-btn"
                    onClick={() => onMoveList(item, 'tasks')}
                  >
                    Keep as Task
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons (visible on hover) */}
        <div className="task-row-buttons">
          <button
            className="row-action-btn"
            onClick={() => onEdit(item)}
            aria-label="Edit item"
          >
            <Edit3 size={14} />
          </button>
          
          {item.listType !== 'archive' ? (
            <button
              className="row-action-btn delete-btn"
              onClick={() => onMoveList(item, 'archive')}
              aria-label="Archive item"
            >
              <Trash2 size={14} />
            </button>
          ) : (
            <button
              className="row-action-btn delete-btn"
              onClick={() => onDelete(item)}
              aria-label="Delete permanently"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { parseNoteToChecklist, checklistToNote } from '../lib/parseChecklist';
import type { ChecklistLine } from '../lib/parseChecklist';

interface ChecklistEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const ChecklistEditor: React.FC<ChecklistEditorProps> = ({ value, onChange }) => {
  const [lines, setLines] = useState<ChecklistLine[]>([]);
  const lastActionRef = useRef<{ type: 'add' | 'delete' | 'merge'; targetId: string; selectionStart?: number } | null>(null);

  // Sync with value from parent (only if different from local serialized value)
  useEffect(() => {
    const parentVal = value || '';
    const localVal = checklistToNote(lines);
    if (parentVal !== localVal) {
      const parsed = parseNoteToChecklist(parentVal);
      if (parsed.length === 0) {
        setLines([{ id: 'init-' + Math.random().toString(36).substring(2, 7), text: '', isCheckbox: false, completed: false, indent: 0 }]);
      } else {
        setLines(parsed);
      }
    }
  }, [value]);

  // Focus effect for post-actions
  useEffect(() => {
    if (lastActionRef.current) {
      const { targetId, selectionStart } = lastActionRef.current;
      const el = document.getElementById(`editor-line-${targetId}`) as HTMLInputElement | null;
      if (el) {
        el.focus();
        if (selectionStart !== undefined) {
          el.setSelectionRange(selectionStart, selectionStart);
        }
      }
      lastActionRef.current = null;
    }
  }, [lines]);

  const updateLinesState = (newLines: ChecklistLine[], action?: typeof lastActionRef.current) => {
    if (action) {
      lastActionRef.current = action;
    }
    setLines(newLines);
    onChange(checklistToNote(newLines));
  };

  const handleTextChange = (index: number, textVal: string) => {
    const updated = [...lines];
    let text = textVal;
    let isCheckbox = updated[index].isCheckbox;
    let completed = updated[index].completed;

    // Detect Notion-style "[]" auto-convert anywhere
    if (text.includes('[]')) {
      text = text.replace('[]', '').trim();
      isCheckbox = true;
      completed = false;
    }

    updated[index] = {
      ...updated[index],
      text,
      isCheckbox,
      completed
    };
    updateLinesState(updated);
  };

  const handleToggleCheckbox = (index: number) => {
    const updated = [...lines];
    updated[index] = {
      ...updated[index],
      completed: !updated[index].completed
    };
    updateLinesState(updated);
  };

  const handleToggleLineType = (index: number) => {
    const updated = [...lines];
    updated[index] = {
      ...updated[index],
      isCheckbox: !updated[index].isCheckbox
    };
    updateLinesState(updated);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    const selectionStart = target.selectionStart ?? 0;

    // 1. Enter Key - Add a new item inheriting properties
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentLine = lines[index];
      const newLine: ChecklistLine = {
        id: Math.random().toString(36).substring(2, 9),
        text: '',
        isCheckbox: currentLine.isCheckbox,
        completed: false,
        indent: currentLine.indent,
      };

      const updated = [...lines];
      updated.splice(index + 1, 0, newLine);
      updateLinesState(updated, { type: 'add', targetId: newLine.id });
    }

    // 2. Backspace Key
    if (e.key === 'Backspace') {
      const currentLine = lines[index];
      
      // If at cursor position 0:
      if (selectionStart === 0) {
        e.preventDefault();
        
        // If it is a checkbox, convert it to a regular note first
        if (currentLine.isCheckbox) {
          const updated = [...lines];
          updated[index] = { ...currentLine, isCheckbox: false };
          updateLinesState(updated, { type: 'merge', targetId: currentLine.id, selectionStart: 0 });
          return;
        }

        // If it's a regular note and not the first line, merge with previous line
        if (index > 0) {
          const prevLine = lines[index - 1];
          const prevTextLen = prevLine.text.length;
          
          const updated = [...lines];
          updated[index - 1] = {
            ...prevLine,
            text: prevLine.text + currentLine.text,
          };
          updated.splice(index, 1);
          updateLinesState(updated, { type: 'merge', targetId: prevLine.id, selectionStart: prevTextLen });
        }
      }
    }

    // 3. Tab Key - Indent/Outdent
    if (e.key === 'Tab') {
      e.preventDefault();
      const updated = [...lines];
      const currentLine = updated[index];
      if (e.shiftKey) {
        // Outdent
        updated[index] = {
          ...currentLine,
          indent: Math.max(0, currentLine.indent - 1),
        };
      } else {
        // Indent
        updated[index] = {
          ...currentLine,
          indent: Math.min(5, currentLine.indent + 1),
        };
      }
      updateLinesState(updated, { type: 'merge', targetId: currentLine.id, selectionStart });
    }

    // 4. Arrow Navigation
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      const prevLine = lines[index - 1];
      const prevEl = document.getElementById(`editor-line-${prevLine.id}`) as HTMLInputElement | null;
      if (prevEl) {
        prevEl.focus();
        prevEl.setSelectionRange(selectionStart, selectionStart);
      }
    }

    if (e.key === 'ArrowDown' && index < lines.length - 1) {
      e.preventDefault();
      const nextLine = lines[index + 1];
      const nextEl = document.getElementById(`editor-line-${nextLine.id}`) as HTMLInputElement | null;
      if (nextEl) {
        nextEl.focus();
        nextEl.setSelectionRange(selectionStart, selectionStart);
      }
    }
  };

  const handleAddNewItem = () => {
    const lastLine = lines[lines.length - 1];
    const newLine: ChecklistLine = {
      id: Math.random().toString(36).substring(2, 9),
      text: '',
      isCheckbox: lastLine ? lastLine.isCheckbox : true,
      completed: false,
      indent: lastLine ? lastLine.indent : 0,
    };
    const updated = [...lines, newLine];
    updateLinesState(updated, { type: 'add', targetId: newLine.id });
  };

  const handleDeleteItem = (index: number) => {
    const updated = [...lines];
    updated.splice(index, 1);
    
    // If we delete all lines, ensure there's at least one empty line
    if (updated.length === 0) {
      updated.push({
        id: Math.random().toString(36).substring(2, 9),
        text: '',
        isCheckbox: false,
        completed: false,
        indent: 0,
      });
    }

    const nextFocusIndex = Math.min(index, updated.length - 1);
    updateLinesState(updated, { type: 'delete', targetId: updated[nextFocusIndex].id });
  };

  return (
    <div className="checklist-interactive-editor">
      <div className="checklist-editor-lines">
        {lines.map((line, index) => (
          <div 
            key={line.id} 
            className={`checklist-editor-line-row ${line.completed ? 'completed' : ''}`}
            style={{ paddingLeft: `${line.indent * 20}px` }}
          >
            {/* Action/Bullet column */}
            <div className="line-indicator-col">
              {line.isCheckbox ? (
                <button 
                  type="button"
                  className={`line-checkbox-btn ${line.completed ? 'checked' : ''}`}
                  onClick={() => handleToggleCheckbox(index)}
                  title="Toggle status"
                >
                  {line.completed ? '❦' : '☐'}
                </button>
              ) : (
                <button 
                  type="button" 
                  className="line-bullet-btn"
                  onClick={() => handleToggleLineType(index)}
                  title="Click to turn into checkbox"
                >
                  ❧
                </button>
              )}
            </div>

            {/* Input column */}
            <div className="line-input-col">
              <input
                id={`editor-line-${line.id}`}
                type="text"
                value={line.text}
                onChange={(e) => handleTextChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                placeholder="Type here..."
                className={`line-text-input ${line.completed ? 'line-through' : ''}`}
                spellCheck="false"
              />
            </div>

            {/* Row actions */}
            <div className="line-actions-col">
              <button 
                type="button" 
                className="line-delete-row-btn"
                onClick={() => handleDeleteItem(index)}
                title="Delete row"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="checklist-editor-footer">
        <button 
          type="button" 
          className="checklist-add-row-btn"
          onClick={handleAddNewItem}
        >
          <Plus size={12} /> Add list item
        </button>
        <span className="checklist-help-note">
          Tip: Type <strong>[]</strong> anywhere in a row to turn it into a checkbox. Use <strong>Tab</strong> to indent, <strong>Shift+Tab</strong> to outdent. Press <strong>Enter</strong> for a new line.
        </span>
      </div>
    </div>
  );
};

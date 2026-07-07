import React, { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { parseInput } from '../lib/parseInput';

interface CaptureBarProps {
  onCapture: (captured: { title: string; dueDate: string | null; isNote: boolean }) => void;
}

export const CaptureBar: React.FC<CaptureBarProps> = ({ onCapture }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Keep focus on initial render
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;

    // Parse the input
    const parsed = parseInput(value);
    onCapture(parsed);

    // Clear value and retain focus
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <div className="capture-bar-container">
      <form onSubmit={handleSubmit} className="capture-bar-form">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type a task, e.g. Call dentist @tomorrow or write essay agle week"
          className="capture-input"
        />
        <button type="submit" className="capture-submit-btn" aria-label="Add item">
          <Plus size={20} />
        </button>
      </form>
      <div className="capture-help-text">
        Use tags: @today, @tomorrow, @nextweek, @someday, @note (or type in kal, parso, agle week)
      </div>
    </div>
  );
};

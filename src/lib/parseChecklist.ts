export interface ChecklistLine {
  id: string;
  text: string;
  isCheckbox: boolean;
  completed: boolean;
  indent: number; // indentation level (0, 1, 2...)
}

// Generate a random-ish small ID for React keys
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function parseNoteToChecklist(noteText: string | null | undefined): ChecklistLine[] {
  if (!noteText) return [];
  
  const rawLines = noteText.split(/\r?\n/);
  return rawLines.map((line) => {
    // Regex matches leading spaces, optional checkbox [ ] or [x], and the rest of the line
    const match = line.match(/^(\s*)(?:\[([ xX])\]\s*)?(.*)$/);
    
    if (!match) {
      return {
        id: generateId(),
        text: line,
        isCheckbox: false,
        completed: false,
        indent: 0,
      };
    }

    const leadingWhitespace = match[1] || '';
    const checkboxChar = match[2]; // ' ' or 'x' or 'X' or undefined
    const contentText = match[3] || '';

    // Calculate indent level (2 spaces or 1 tab = 1 level)
    let tabs = 0;
    let spaces = 0;
    for (let char of leadingWhitespace) {
      if (char === '\t') tabs++;
      else if (char === ' ') spaces++;
    }
    const indent = tabs + Math.floor(spaces / 2);

    const isCheckbox = checkboxChar !== undefined;
    const completed = checkboxChar === 'x' || checkboxChar === 'X';

    return {
      id: generateId(),
      text: contentText,
      isCheckbox,
      completed,
      indent,
    };
  });
}

export function checklistToNote(lines: ChecklistLine[]): string {
  return lines
    .map((line) => {
      const indentation = '  '.repeat(line.indent);
      if (line.isCheckbox) {
        const checkbox = line.completed ? '[x]' : '[ ]';
        return `${indentation}${checkbox} ${line.text}`;
      } else {
        // If it's a blank line and no checkbox, just output spacing if there is text,
        // or just empty string.
        return line.text ? `${indentation}${line.text}` : '';
      }
    })
    .join('\n');
}

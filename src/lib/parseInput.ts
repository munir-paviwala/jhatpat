import * as chrono from 'chrono-node';

export interface ParseResult {
  title: string;
  dueDate: string | null; // ISO string YYYY-MM-DD
  isNote: boolean;
}

// Helper to format Date to YYYY-MM-DD
export function formatDateISO(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseInput(input: string, refDate: Date = new Date()): ParseResult {
  let title = input.trim();
  let dueDate: string | null = null;
  let isNote = false;

  // 1. Parse Note tag: @note
  // Note tag is case-insensitive.
  const noteRegex = /\b@note\b/i;
  if (noteRegex.test(title)) {
    isNote = true;
    title = title.replace(noteRegex, '').replace(/\s+/g, ' ').trim();
  }

  // 2. Parse Date Tags (Explicit shorthand always wins)
  // Tags: @today, @tomorrow, @nextweek, @nextmonth, @weekend, @nextweekend, @someday
  const tagPatterns = [
    { tag: '@today', resolve: (d: Date) => d },
    { tag: '@tomorrow', resolve: (d: Date) => {
        const res = new Date(d);
        res.setDate(d.getDate() + 1);
        return res;
      }
    },
    { tag: '@nextweek', resolve: (d: Date) => {
        const day = d.getDay();
        const diff = day === 0 ? 1 : 8 - day;
        const res = new Date(d);
        res.setDate(d.getDate() + diff);
        return res;
      }
    },
    { tag: '@nextmonth', resolve: (d: Date) => {
        return new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    },
    { tag: '@weekend', resolve: (d: Date) => {
        const day = d.getDay();
        let diff = 0;
        if (day === 6 || day === 0) {
          diff = 0; // Saturday or Sunday -> resolve to today
        } else {
          diff = 6 - day; // upcoming Saturday
        }
        const res = new Date(d);
        res.setDate(d.getDate() + diff);
        return res;
      }
    },
    { tag: '@nextweekend', resolve: (d: Date) => {
        const day = d.getDay();
        let diff = 0;
        if (day === 6 || day === 0) {
          diff = 0;
        } else {
          diff = 6 - day;
        }
        const res = new Date(d);
        res.setDate(d.getDate() + diff + 7); // Saturday + 7 days
        return res;
      }
    },
    { tag: '@someday', resolve: () => null }
  ];

  // We find all present tags and their indices to process "last one wins"
  interface MatchedTag {
    index: number;
    tagText: string;
    resolvedDate: Date | null;
  }

  const matches: MatchedTag[] = [];
  tagPatterns.forEach(({ tag, resolve }) => {
    // Find all matches for this tag (case-insensitive)
    const regex = new RegExp(tag, 'gi');
    let match;
    while ((match = regex.exec(title)) !== null) {
      matches.push({
        index: match.index,
        tagText: match[0],
        resolvedDate: resolve(refDate)
      });
    }
  });

  // If explicit date tags were matched
  if (matches.length > 0) {
    // Sort matches by index ascending
    matches.sort((a, b) => a.index - b.index);

    if (matches.length > 1) {
      console.warn(`Multiple date tags detected in input. Last one wins.`);
    }

    // Last tag in string wins
    const winner = matches[matches.length - 1];
    if (winner.resolvedDate !== undefined) {
      dueDate = winner.resolvedDate ? formatDateISO(winner.resolvedDate) : null;
    }

    // Remove all matched tags from title
    matches.forEach(m => {
      // Escape for regex replacement
      const esc = m.tagText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      title = title.replace(new RegExp(esc, 'gi'), '');
    });
    title = title.replace(/\s+/g, ' ').trim();

  } else {
    // 3. Fallback to Custom NLP (Hinglish + Fuzzy words)
    // We check Hinglish and Fuzzy offsets manually first because chrono-node doesn't recognize them.
    // If we match any, we set dueDate and strip the text.
    let nlpDate: Date | null = null;

    const hinges = [
      { regex: /\bkal\b/i, resolve: (d: Date) => {
          const res = new Date(d);
          res.setDate(d.getDate() + 1);
          return res;
        }
      },
      { regex: /\bparso\b/i, resolve: (d: Date) => {
          const res = new Date(d);
          res.setDate(d.getDate() + 2);
          return res;
        }
      },
      { regex: /\bagla\s+hafta\b/i, resolve: (d: Date) => {
          const day = d.getDay();
          const diff = day === 0 ? 1 : 8 - day;
          const res = new Date(d);
          res.setDate(d.getDate() + diff);
          return res;
        }
      },
      { regex: /\bagla\s+week\b/i, resolve: (d: Date) => {
          const day = d.getDay();
          const diff = day === 0 ? 1 : 8 - day;
          const res = new Date(d);
          res.setDate(d.getDate() + diff);
          return res;
        }
      },
      { regex: /\bagle\s+week\b/i, resolve: (d: Date) => {
          const day = d.getDay();
          const diff = day === 0 ? 1 : 8 - day;
          const res = new Date(d);
          res.setDate(d.getDate() + diff);
          return res;
        }
      },
      { regex: /\bagle\s+mahine\b/i, resolve: (d: Date) => {
          return new Date(d.getFullYear(), d.getMonth() + 1, 1);
        }
      },
      // Fuzzy words
      { regex: /\beod\b/i, resolve: (d: Date) => d },
      { regex: /\bend\s+of\s+day\b/i, resolve: (d: Date) => d },
      { regex: /\beow\b/i, resolve: (d: Date) => {
          const day = d.getDay();
          const diff = day === 0 ? 0 : 7 - day; // coming Sunday
          const res = new Date(d);
          res.setDate(d.getDate() + diff);
          return res;
        }
      },
      { regex: /\bend\s+of\s+week\b/i, resolve: (d: Date) => {
          const day = d.getDay();
          const diff = day === 0 ? 0 : 7 - day;
          const res = new Date(d);
          res.setDate(d.getDate() + diff);
          return res;
        }
      },
      { regex: /\basap\b/i, resolve: (d: Date) => d }
    ];

    for (const item of hinges) {
      if (item.regex.test(title)) {
        nlpDate = item.resolve(refDate);
        title = title.replace(item.regex, '');
        break; // first match wins
      }
    }

    if (nlpDate) {
      dueDate = formatDateISO(nlpDate);
      title = title.replace(/\s+/g, ' ').trim();
    } else {
      // 4. Chrono-node English NLP Fallback
      // Pass reference date to chrono-node
      const chronoResults = chrono.parse(title, refDate, { forwardDate: true });
      if (chronoResults.length > 0) {
        // Find first valid parsed date
        const parsed = chronoResults[0];
        const dateVal = parsed.start.date();
        dueDate = formatDateISO(dateVal);
        // Strip matched text from title
        title = title.replace(parsed.text, '').replace(/\s+/g, ' ').trim();
      }
    }
  }

  // 5. Filler Stripping
  // Recognizes "remind me to", "need to", "gotta", and strips them from the start of the title
  const fillerRegex = /^(remind me to|need to|gotta)\s+/i;
  title = title.replace(fillerRegex, '').trim();

  // Ensure title is not empty, if so, default to original string minus the tag/phrase
  if (!title && input) {
    title = input.trim();
  }

  return {
    title,
    dueDate,
    isNote
  };
}

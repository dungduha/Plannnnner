export const getLocalISO = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};

export const escapeHtml = (text: string): string => {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

export const shouldShowTask = (task: any, dateStr: string): boolean => {
    const todayStr = getLocalISO();
    if (task.hiddenDates && task.hiddenDates.includes(dateStr)) return false;
    
    if (task.type === 'one-time') {
        if (task.dateCreated === dateStr) return true;
        // Show overdue tasks on "today" view only if they are not completed
        if (dateStr === todayStr && task.dateCreated < todayStr && !task.completions.includes(task.dateCreated)) return true;
        return false;
    }
    if (task.type === 'recurring') {
        return task.dateCreated <= dateStr;
    }
    if (task.type === 'weekly') {
        const d = parseLocalDate(dateStr);
        return task.weeklyDay === d.getDay() && task.dateCreated <= dateStr;
    }
    return false;
};

export interface TimeParseResult {
    text: string;
    time: string | undefined;
}

export const extractTimeFromText = (input: string): TimeParseResult => {
    let cleanText = input;
    let detectedTime: string | undefined;

    // Helper to format HH:mm
    const format = (h: number, m: number): string | undefined => {
        if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // Regex Patterns
    const patterns = [
        // 1. Korean specific (Order matters: modifiers first)
        // Matches: "오후 2시", "오후 2시 30분", "밤 9시"
        {
            regex: /(오전|오후|아침|새벽|밤|저녁|낮)\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/,
            handler: (match: RegExpExecArray) => {
                const modifier = match[1];
                let h = parseInt(match[2], 10);
                const m = match[3] ? parseInt(match[3], 10) : 0;
                
                if (['오후', '저녁', '밤', '낮'].includes(modifier) && h < 12) h += 12;
                if (['오전', '아침', '새벽'].includes(modifier) && h === 12) h = 0;
                
                return format(h, m);
            }
        },
        // 2. English AM/PM
        // Matches: "2pm", "2:30pm", "10 am"
        {
            regex: /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i,
            handler: (match: RegExpExecArray) => {
                let h = parseInt(match[1], 10);
                const m = match[2] ? parseInt(match[2], 10) : 0;
                const mod = match[3].toLowerCase().replace(/\./g, '');
                
                if (mod === 'pm' && h < 12) h += 12;
                if (mod === 'am' && h === 12) h = 0;
                
                return format(h, m);
            }
        },
        // 3. HH:mm format (Strict 24h)
        // Matches: "14:00", "09:30"
        {
            regex: /\b([01]?\d|2[0-3]):([0-5]\d)\b/,
            handler: (match: RegExpExecArray) => {
                return format(parseInt(match[1], 10), parseInt(match[2], 10));
            }
        },
        // 4. Simple Korean "N시" (Assume 24h or context-free)
        // Matches: "14시", "14시 30분"
        {
            regex: /\b(\d{1,2})시(?:\s*(\d{1,2})분)?/,
            handler: (match: RegExpExecArray) => {
                return format(parseInt(match[1], 10), match[2] ? parseInt(match[2], 10) : 0);
            }
        }
    ];

    for (const { regex, handler } of patterns) {
        const match = regex.exec(input);
        if (match) {
            const t = handler(match);
            if (t) {
                detectedTime = t;
                // Remove the matched time string from text
                // We use replace to remove the first occurrence
                cleanText = input.replace(match[0], '').replace(/\s+/g, ' ').trim();
                break;
            }
        }
    }

    return { text: cleanText, time: detectedTime };
};

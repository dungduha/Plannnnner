export type Category = 'personal' | 'work' | 'health' | 'other';
export type TaskType = 'one-time' | 'recurring' | 'weekly';

export interface Task {
  id: number;
  text: string;
  type: TaskType;
  category: Category;
  dateCreated: string; // ISO Date String YYYY-MM-DD
  completions: string[]; // Array of ISO Date Strings
  hiddenDates: string[]; // Array of ISO Date Strings
  weeklyDay?: number | null; // 0 (Sunday) - 6 (Saturday)
  time?: string; // HH:mm 24h format
  notes?: string; // Additional details/notes
}

export type ViewMode = 'day' | 'week' | 'history';

export const CATEGORIES: Category[] = ['personal', 'work', 'health', 'other'];
export const TASK_TYPES: TaskType[] = ['one-time', 'recurring', 'weekly'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const QUOTES = {
    start: ["The secret of getting ahead is getting started.", "Make today count.", "Your future self will thank you."],
    progress: ["Keep going, you're doing great!", "Momentum is building.", "One step at a time."],
    finish: ["Champion status achieved!", "Absolute legend.", "You crushed today!"]
};
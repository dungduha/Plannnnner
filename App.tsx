import React, { useState, useEffect, useRef } from 'react';
import { Task, ViewMode, QUOTES, TaskType, Category } from './types';
import { getLocalISO, parseLocalDate, shouldShowTask } from './utils';
import Sidebar from './components/Sidebar';
import TaskList from './components/TaskList';
import AddTask from './components/AddTask';
import History from './components/History';
import { Menu, Moon, Sun, Home, CalendarDays, BarChart2, Sunrise, Bell, X, CheckCircle2, Clock } from 'lucide-react';
import confetti from 'https://esm.sh/canvas-confetti@1.9.2';

// --- Audio Engine ---
let audioCtx: AudioContext | null = null;

const initAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Always check if suspended and try to resume
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.log("Audio resume failed (expected if no interaction)", e));
    }
    return audioCtx;
};

// Starts a looping alarm and returns a function to stop it
const startAlarmLoop = (): (() => void) => {
    const ctx = initAudio();
    if (!ctx) return () => {};

    let intervalId: any;
    let currentOsc: OscillatorNode | null = null;
    let currentGain: GainNode | null = null;

    const playCycle = () => {
        // Try to resume if suspended (requires user gesture previously)
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        currentOsc = osc;
        currentGain = gain;
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        // Use Square wave for "buzzer" effect - aggressive and audible
        osc.type = 'square';
        
        // Pattern: Beep-Beep-Beep (High urgency)
        // Beep 1
        osc.frequency.setValueAtTime(880, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.setValueAtTime(0.1, t + 0.15);
        gain.gain.linearRampToValueAtTime(0, t + 0.2);

        // Beep 2
        osc.frequency.setValueAtTime(880, t + 0.3);
        gain.gain.setValueAtTime(0.1, t + 0.3);
        gain.gain.setValueAtTime(0.1, t + 0.45);
        gain.gain.linearRampToValueAtTime(0, t + 0.5);

        // Beep 3 (Higher/Longer)
        osc.frequency.setValueAtTime(1760, t + 0.6);
        gain.gain.setValueAtTime(0.1, t + 0.6);
        gain.gain.setValueAtTime(0.1, t + 0.9);
        gain.gain.linearRampToValueAtTime(0, t + 1.0);

        osc.start(t);
        osc.stop(t + 1.2); 
        
        osc.onended = () => {
             try {
                osc.disconnect();
                gain.disconnect();
             } catch(e) {}
        };
    };

    // Play immediately then loop
    playCycle();
    intervalId = setInterval(playCycle, 2000); // Loop sequence every 2 seconds

    // Return cleanup function
    return () => {
        clearInterval(intervalId);
        if (currentOsc) {
            try { currentOsc.stop(); } catch(e){}
            try { currentOsc.disconnect(); } catch(e){}
        }
        if (currentGain) {
             try { currentGain.disconnect(); } catch(e){}
        }
    };
};

const App: React.FC = () => {
    // --- State ---
    const [tasks, setTasks] = useState<Task[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>(getLocalISO());
    const [currentView, setCurrentView] = useState<ViewMode>('day');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [historyDrilldownDate, setHistoryDrilldownDate] = useState<string | null>(null);
    const [deleteModalId, setDeleteModalId] = useState<number | null>(null);
    const [moveModalId, setMoveModalId] = useState<number | null>(null);
    const [activeAlert, setActiveAlert] = useState<Task | null>(null); // State for in-app alarm popup
    
    // Track notified tasks for the current session to prevent spam
    const notifiedTasksRef = useRef<Set<string>>(new Set());
    
    // Track the stop function for the currently playing alarm
    const stopAlarmRef = useRef<(() => void) | null>(null);
    
    // Track previous percentage to trigger confetti
    const prevPercentageRef = useRef(0);

    // --- Init ---
    useEffect(() => {
        // Load Tasks
        const storedTasks = localStorage.getItem('pro_tasks');
        if (storedTasks) {
            setTasks(JSON.parse(storedTasks));
        }

        // Load Theme
        const storedTheme = localStorage.getItem('theme');
        const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (storedTheme === 'dark' || (!storedTheme && sysDark)) {
            setDarkMode(true);
            document.documentElement.classList.add('dark');
        }

        // Unlock Audio Context on first interaction
        const unlockAudio = () => {
            initAudio();
            // Also try to request notification permission if not yet decided
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
        };
        
        document.addEventListener('click', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);
        document.addEventListener('keydown', unlockAudio);

        return () => {
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
        };
    }, []);

    // --- Global Keyboard Shortcuts ---
    useEffect(() => {
        const handleGlobalKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeAlert) dismissAlarm();
                else if (deleteModalId !== null) setDeleteModalId(null);
                else if (moveModalId !== null) setMoveModalId(null);
                else if (isSidebarOpen) setIsSidebarOpen(false);
                else if (historyDrilldownDate) setHistoryDrilldownDate(null);
            }
        };
        window.addEventListener('keydown', handleGlobalKey);
        return () => window.removeEventListener('keydown', handleGlobalKey);
    }, [activeAlert, deleteModalId, moveModalId, isSidebarOpen, historyDrilldownDate]);

    useEffect(() => {
        localStorage.setItem('pro_tasks', JSON.stringify(tasks));
    }, [tasks]);

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [darkMode]);

    // --- Alarm Interval ---
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const currentHM = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            const todayISO = getLocalISO();

            // Only notify for tasks visible on "Today"
            tasks.forEach(t => {
                // Check if task is valid for today and NOT completed
                if (shouldShowTask(t, todayISO) && !t.completions.includes(todayISO)) {
                    if (t.time === currentHM) {
                        const notificationKey = `${t.id}-${todayISO}-${currentHM}`;
                        if (!notifiedTasksRef.current.has(notificationKey)) {
                            // 1. Stop any existing alarm
                            if (stopAlarmRef.current) stopAlarmRef.current();

                            // 2. Start Looping Alarm
                            const stopFn = startAlarmLoop();
                            stopAlarmRef.current = stopFn;

                            // 3. Auto-stop after 1 minute (60,000ms)
                            setTimeout(() => {
                                if (stopAlarmRef.current === stopFn) {
                                    stopFn();
                                    stopAlarmRef.current = null;
                                }
                            }, 60000);
                            
                            // 4. Show In-App Modal
                            setActiveAlert(t);

                            // 5. Send System Notification
                            if ('Notification' in window && Notification.permission === 'granted') {
                                new Notification("IT'S TIME!", {
                                    body: t.text,
                                    icon: '/icon.png',
                                    requireInteraction: true
                                });
                            }

                            // Mark as notified so we don't spam every 10s
                            notifiedTasksRef.current.add(notificationKey);
                        }
                    }
                }
            });
        }, 10000); // Check every 10 seconds for precision

        return () => clearInterval(interval);
    }, [tasks]);

    // --- Computed Helpers ---
    const todayStr = getLocalISO();
    const moveDirection = selectedDate > todayStr ? 'backward' : 'forward';

    // --- Actions ---
    const addTask = (taskData: Omit<Task, 'id' | 'dateCreated' | 'completions' | 'hiddenDates'>) => {
        // Auto-move to tomorrow if time has passed and we are on "today"
        let finalDate = selectedDate;
        if (selectedDate === todayStr && taskData.time) {
             const now = new Date();
             const currentHM = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
             if (taskData.time < currentHM) {
                 const d = new Date();
                 d.setDate(d.getDate() + 1);
                 finalDate = getLocalISO(d);
             }
        }

        const newTask: Task = {
            id: Date.now(),
            ...taskData,
            dateCreated: finalDate,
            completions: [],
            hiddenDates: [],
            notes: "" // Initialize notes
        };
        setTasks(prev => [newTask, ...prev]);
        
        // Aggressively request permission if adding a timed task
        if (taskData.time && 'Notification' in window && Notification.permission !== 'granted') {
             Notification.requestPermission();
        }
    };

    const toggleTask = (id: number) => {
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            const idx = t.completions.indexOf(selectedDate);
            let newCompletions = [...t.completions];
            if (idx > -1) newCompletions.splice(idx, 1);
            else newCompletions.push(selectedDate);
            return { ...t, completions: newCompletions };
        }));
    };

    const confirmDelete = (id: number) => {
        setDeleteModalId(id);
    };

    const executeDelete = () => {
        if (deleteModalId === null) return;
        setTasks(prev => prev.map(t => {
            if (t.id !== deleteModalId) return t;
            return {
                ...t,
                hiddenDates: [...(t.hiddenDates || []), selectedDate]
            };
        }));
        setDeleteModalId(null);
    };

    const requestMoveTask = (id: number) => {
        setMoveModalId(id);
    };

    const executeMoveTask = () => {
        if (moveModalId === null) return;
        const id = moveModalId;
        const direction = moveDirection;

        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;

            const current = parseLocalDate(selectedDate);
            const offset = direction === 'forward' ? 1 : -1;
            current.setDate(current.getDate() + offset);
            const targetDateStr = getLocalISO(current);

            // 1. Hide from current date
            const newHidden = new Set(t.hiddenDates || []);
            newHidden.add(selectedDate);

            // 2. Ensure visible on target date (if it was previously hidden there)
            if (newHidden.has(targetDateStr)) {
                newHidden.delete(targetDateStr);
            }

            // 3. Adjust dateCreated if necessary (for one-time tasks primarily)
            let newDateCreated = t.dateCreated;
            if (t.type === 'one-time') {
                 if (targetDateStr < t.dateCreated) {
                     newDateCreated = targetDateStr;
                 }
                 else if (direction === 'forward' && t.dateCreated === selectedDate) {
                     newDateCreated = targetDateStr;
                 }
            }

            const newCompletions = t.completions.filter(d => d !== selectedDate);

            return {
                ...t,
                hiddenDates: Array.from(newHidden),
                dateCreated: newDateCreated,
                completions: newCompletions
            };
        }));
        setMoveModalId(null);
    };

    const updateTaskText = (id: number, text: string) => {
        if (!text.trim()) return;
        setTasks(prev => prev.map(t => t.id === id ? { ...t, text: text.trim().substring(0, 100) } : t));
    };

    const updateTaskTime = (id: number, time: string | undefined) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, time } : t));
    };

    const updateTaskNotes = (id: number, notes: string) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, notes } : t));
    };

    const updateTaskCategory = (id: number, category: Category) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, category } : t));
    };

    const updateTaskType = (id: number, type: TaskType) => {
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            // When changing type, ensure weeklyDay is set if switching to weekly
            return { 
                ...t, 
                type,
                weeklyDay: type === 'weekly' && t.weeklyDay === undefined ? new Date().getDay() : t.weeklyDay
            };
        }));
    };

    // Stops the alarm loop and clears the state
    const dismissAlarm = () => {
        if (stopAlarmRef.current) {
            stopAlarmRef.current();
            stopAlarmRef.current = null;
        }
        setActiveAlert(null);
    };

    const snoozeTask = () => {
        if (!activeAlert || !activeAlert.time) return;
        
        const [h, m] = activeAlert.time.split(':').map(Number);
        const date = new Date();
        date.setHours(h);
        date.setMinutes(m + 5);
        
        const newTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        
        updateTaskTime(activeAlert.id, newTime);
        dismissAlarm(); // Stop sound
    };

    const markActiveAlertDone = () => {
        if (activeAlert) {
            toggleTask(activeAlert.id);
            dismissAlarm(); // Stop sound
        }
    };

    const cycleCategory = (id: number) => {
        const cats: Category[] = ['personal', 'work', 'health', 'other'];
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            const idx = cats.indexOf(t.category);
            return { ...t, category: cats[(idx + 1) % cats.length] };
        }));
    };

    const cycleType = (id: number) => {
        const types: TaskType[] = ['one-time', 'recurring', 'weekly'];
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            const idx = types.indexOf(t.type);
            const nextType = types[(idx + 1) % types.length];
            return { 
                ...t, 
                type: nextType,
                weeklyDay: nextType === 'weekly' && t.weeklyDay === undefined ? new Date().getDay() : t.weeklyDay
            };
        }));
    };

    const updateWeeklyDay = (id: number, day: number) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, weeklyDay: day } : t));
    };

    // --- Computed Data ---
    // Prepare tasks for the current view
    let visibleTasks: Task[] = [];
    let contextDate = selectedDate;

    if (currentView === 'week') {
         const weekTaskIds = new Set<number>();
         for (let i = 0; i < 7; i++) {
             const d = parseLocalDate(selectedDate);
             d.setDate(d.getDate() + i);
             const ds = getLocalISO(d);
             tasks.filter(t => shouldShowTask(t, ds)).forEach(t => weekTaskIds.add(t.id));
         }
         visibleTasks = tasks.filter(t => weekTaskIds.has(t.id));

         // Sort Week Tasks by Date ASC
         visibleTasks.sort((a, b) => {
             const getSortDate = (t: Task) => {
                 if (t.type === 'one-time') return t.dateCreated;
                 if (t.type === 'recurring') return selectedDate;
                 if (t.type === 'weekly' && t.weeklyDay !== undefined) {
                     const start = parseLocalDate(selectedDate);
                     const currentDay = start.getDay();
                     const diff = (t.weeklyDay - currentDay + 7) % 7;
                     const d = new Date(start);
                     d.setDate(d.getDate() + diff);
                     return getLocalISO(d);
                 }
                 return t.dateCreated;
             };
             
             const dateA = getSortDate(a);
             const dateB = getSortDate(b);
             if (dateA !== dateB) return dateA.localeCompare(dateB);
             
             // Same date? Time priority
             if (a.time && b.time) return a.time.localeCompare(b.time);
             if (a.time) return -1;
             if (b.time) return 1;
             return 0;
         });
    } else if (currentView === 'history' && historyDrilldownDate) {
        visibleTasks = tasks.filter(t => shouldShowTask(t, historyDrilldownDate));
        contextDate = historyDrilldownDate;
    } else {
        visibleTasks = tasks.filter(t => shouldShowTask(t, selectedDate));
    }

    // --- Sorting Logic ---
    // 1. Separate Active and Completed
    const activeTasks = visibleTasks.filter(t => !t.completions.includes(contextDate));
    const completedTasks = visibleTasks.filter(t => t.completions.includes(contextDate));

    // 2. Sort Active: Timed tasks first (chronological), then Untimed (manual order)
    const timedActive = activeTasks.filter(t => !!t.time).sort((a, b) => a.time!.localeCompare(b.time!));
    const untimedActive = activeTasks.filter(t => !t.time); // Maintain array order (manual)

    // Note: We are passing ALL visible tasks to TaskList. 
    // TaskList will handle the visual separation of Timed vs Untimed to fix the D&D issue.
    const sortedVisibleTasks = [...timedActive, ...untimedActive, ...completedTasks];

    // Stats
    const totalCount = sortedVisibleTasks.length;
    const completedCount = completedTasks.length;
    const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    // Confetti Effect
    useEffect(() => {
        if (percentage === 100 && totalCount > 0 && prevPercentageRef.current < 100) {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
        prevPercentageRef.current = percentage;
    }, [percentage, totalCount]);

    // Header Text
    let headerText = parseLocalDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (currentView === 'week') headerText = "Upcoming Week";
    if (currentView === 'history') headerText = "Momentum History";
    if (currentView === 'history' && historyDrilldownDate) headerText = `Tasks for ${historyDrilldownDate}`;

    // Quote
    const quotePool = percentage === 100 && totalCount > 0 ? QUOTES.finish : (percentage > 0 ? QUOTES.progress : QUOTES.start);
    const quote = quotePool[selectedDate.charCodeAt(selectedDate.length - 1) % quotePool.length]; // Stable random based on date char

    // Navigation Helper
    const setViewDate = (view: ViewMode, offset: number = 0) => {
        setCurrentView(view);
        setHistoryDrilldownDate(null);
        if (view === 'day') {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            setSelectedDate(getLocalISO(d));
        } else if (view === 'week') {
            // Fix: Always start Week view from Today so it's consistent
            setSelectedDate(getLocalISO());
        }
    };

    return (
        <>
             {/* Delete Modal */}
             {deleteModalId !== null && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDeleteModalId(null)}></div>
                    <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-2xl animate-fade-in-up">
                        <h3 className="text-xl font-black text-center dark:text-white">Remove Task?</h3>
                        <p className="text-slate-500 text-sm font-bold text-center mt-3">This will hide the task from today's list.</p>
                        <div className="flex gap-4 mt-8">
                            <button onClick={() => setDeleteModalId(null)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl text-[10px] font-black uppercase text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
                            <button onClick={executeDelete} className="flex-1 py-4 bg-red-600 rounded-2xl text-[10px] font-black uppercase text-white shadow-lg hover:bg-red-700 transition-colors">Remove</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Move Modal */}
            {moveModalId !== null && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMoveModalId(null)}></div>
                    <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-2xl animate-fade-in-up">
                        <h3 className="text-xl font-black text-center dark:text-white">
                            {moveDirection === 'forward' ? 'Push to Tomorrow?' : 'Pull to Previous Day?'}
                        </h3>
                        <p className="text-slate-500 text-sm font-bold text-center mt-3">
                            {moveDirection === 'forward' 
                                ? "This will move the task to the next day." 
                                : "This will move the task to the previous day."}
                        </p>
                        <div className="flex gap-4 mt-8">
                            <button onClick={() => setMoveModalId(null)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl text-[10px] font-black uppercase text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
                            <button onClick={executeMoveTask} className="flex-1 py-4 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase text-white shadow-lg hover:bg-indigo-700 transition-colors">
                                {moveDirection === 'forward' ? 'Push' : 'Pull'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Alarm Popup Modal */}
            {activeAlert && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={dismissAlarm}></div>
                    <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl animate-bounce-in flex flex-col items-center text-center">
                        <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 mb-6 animate-pulse">
                            <Bell size={40} strokeWidth={2.5} />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">It's Time!</h2>
                        <p className="text-lg font-bold text-indigo-600 mb-8">{activeAlert.text}</p>
                        
                        <div className="flex flex-col gap-3 w-full">
                            <button 
                                onClick={markActiveAlertDone}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 size={16} /> Mark Done
                            </button>
                            
                            <div className="flex gap-3">
                                <button 
                                    onClick={snoozeTask}
                                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <Clock size={16} /> Snooze 5m
                                </button>
                                <button 
                                    onClick={dismissAlarm}
                                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <Sidebar 
                isOpen={isSidebarOpen} 
                onClose={() => setIsSidebarOpen(false)} 
                selectedDate={selectedDate}
                onSelectDate={(d) => {
                    setSelectedDate(d);
                    setCurrentView('day');
                }}
            />

            <main className="max-w-xl mx-auto px-6 pt-12 pb-32">
                <header className="mb-10">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setIsSidebarOpen(true)} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl text-slate-400 hover:text-indigo-600 transition-colors">
                                <Menu size={24} strokeWidth={2.5} />
                            </button>
                            <div>
                                <h1 className="text-3xl font-black italic tracking-tighter leading-none text-slate-900 dark:text-white">
                                    {currentView === 'history' && !historyDrilldownDate ? 'MOTI-ON' : headerText}
                                </h1>
                                <div className="flex items-center gap-3 mt-2">
                                    <p className="text-slate-400 font-bold text-xs uppercase italic">
                                        {currentView === 'history' ? '"Motivation follows Motion."' : `"${quote}"`}
                                    </p>
                                    <button onClick={() => setDarkMode(!darkMode)} className="text-slate-300 hover:text-indigo-500 transition-colors">
                                        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        {/* Progress Circle */}
                        {currentView !== 'history' && (
                            <div className="relative w-16 h-16 shrink-0">
                                <svg viewBox="0 0 64 64" className="w-full h-full transform -rotate-90">
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="5" fill="transparent" className="text-slate-100 dark:text-slate-800"/>
                                    <circle 
                                        cx="32" cy="32" r="28" 
                                        stroke="currentColor" strokeWidth="5" fill="transparent" 
                                        strokeDasharray="175.84" 
                                        strokeDashoffset={175.84 - (175.84 * (percentage / 100))} 
                                        strokeLinecap="round" 
                                        className="text-indigo-600 transition-all duration-700 ease-out"
                                    />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-xs font-black dark:text-white">
                                    {percentage}%
                                </span>
                            </div>
                        )}
                    </div>
                    {currentView !== 'history' && (
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-indigo-600 rounded-full transition-all duration-700 ease-out" 
                                style={{ width: `${percentage}%` }}
                            ></div>
                        </div>
                    )}
                </header>

                {currentView === 'history' && !historyDrilldownDate ? (
                    <History 
                        tasks={tasks} 
                        onDrillDown={(d) => {
                            setHistoryDrilldownDate(d);
                            // Keep view as history, but show list
                        }}
                        drillDownDate={historyDrilldownDate}
                    />
                ) : (
                    <>
                        {currentView === 'day' && !historyDrilldownDate && (
                            <AddTask onAdd={addTask} />
                        )}
                        
                        {historyDrilldownDate && (
                             <div className="mb-4">
                                <button onClick={() => setHistoryDrilldownDate(null)} className="text-sm font-bold text-indigo-500 hover:underline">
                                    ← Back to Overview
                                </button>
                             </div>
                        )}

                        <TaskList 
                            tasks={sortedVisibleTasks}
                            contextDate={contextDate}
                            onToggle={toggleTask}
                            onDelete={confirmDelete}
                            onMoveTask={requestMoveTask}
                            onUpdateText={updateTaskText}
                            onUpdateTime={updateTaskTime}
                            onUpdateNotes={updateTaskNotes}
                            onCycleCategory={cycleCategory}
                            onCycleType={cycleType}
                            onUpdateWeeklyDay={updateWeeklyDay}
                            onUpdateCategory={updateTaskCategory}
                            onUpdateType={updateTaskType}
                            onReorder={(newOrder) => {
                                // We merge the `newOrder` (which likely contains only what was draggable or all visible)
                                // back into the main state.
                                const visibleIds = new Set(newOrder.map(t => t.id));
                                const otherTasks = tasks.filter(t => !visibleIds.has(t.id));
                                setTasks([...newOrder, ...otherTasks]);
                            }}
                            moveDirection={moveDirection}
                        />
                    </>
                )}
            </main>

            <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border-t border-slate-100 dark:border-slate-800 px-6 py-4 pb-safe flex justify-between items-center z-50 transition-all duration-300">
                <button 
                    onClick={() => setViewDate('day', 0)} 
                    className={`flex flex-col items-center gap-1.5 ${currentView === 'day' && selectedDate === getLocalISO() ? 'text-indigo-600' : 'text-slate-400'}`}
                >
                    <Home size={20} />
                    <span className="text-[9px] font-black uppercase">Today</span>
                </button>
                <button 
                    onClick={() => setViewDate('day', 1)} 
                    className={`flex flex-col items-center gap-1.5 ${currentView === 'day' && selectedDate !== getLocalISO() ? 'text-indigo-600' : 'text-slate-400'}`}
                >
                    <Sunrise size={20} strokeWidth={2.5} />
                    <span className="text-[9px] font-black uppercase">Tomorrow</span>
                </button>
                <button 
                    onClick={() => setViewDate('week')} 
                    className={`flex flex-col items-center gap-1.5 ${currentView === 'week' ? 'text-indigo-600' : 'text-slate-400'}`}
                >
                    <CalendarDays size={20} strokeWidth={2.5} />
                    <span className="text-[9px] font-black uppercase">Week</span>
                </button>
                <button 
                    onClick={() => setCurrentView('history')} 
                    className={`flex flex-col items-center gap-1.5 ${currentView === 'history' ? 'text-indigo-600' : 'text-slate-400'}`}
                >
                    <BarChart2 size={20} strokeWidth={2.5} />
                    <span className="text-[9px] font-black uppercase">Stats</span>
                </button>
            </nav>
        </>
    );
};

export default App;
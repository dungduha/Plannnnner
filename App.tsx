import React, { useState, useEffect, useRef } from 'react';
import { Task, ViewMode, QUOTES, TaskType, Category } from './types';
import { getLocalISO, parseLocalDate, shouldShowTask } from './utils';
import Sidebar from './components/Sidebar';
import TaskList, { EditTaskModal } from './components/TaskList';
import AddTask from './components/AddTask';
import History from './components/History';
import { Menu, Moon, Sun, Home, CalendarDays, BarChart2, Sunrise, Bell, CheckCircle2, Clock } from 'lucide-react';
import confetti from 'https://esm.sh/canvas-confetti@1.9.2';

// --- Audio Engine ---
let audioCtx: AudioContext | null = null;

const initAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.log("Audio resume failed (expected if no interaction)", e));
    }
    return audioCtx;
};

const startAlarmLoop = (): (() => void) => {
    const ctx = initAudio();
    if (!ctx) return () => {};

    let intervalId: any;
    let currentOsc: OscillatorNode | null = null;
    let currentGain: GainNode | null = null;

    const playCycle = () => {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        currentOsc = osc;
        currentGain = gain;
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'square';
        
        osc.frequency.setValueAtTime(880, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.setValueAtTime(0.1, t + 0.15);
        gain.gain.linearRampToValueAtTime(0, t + 0.2);

        osc.frequency.setValueAtTime(880, t + 0.3);
        gain.gain.setValueAtTime(0.1, t + 0.3);
        gain.gain.setValueAtTime(0.1, t + 0.45);
        gain.gain.linearRampToValueAtTime(0, t + 0.5);

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

    playCycle();
    intervalId = setInterval(playCycle, 2000);

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
    const [activeAlert, setActiveAlert] = useState<Task | null>(null);
    
    // Editing State (Draft)
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    
    // Swipe State
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    const notifiedTasksRef = useRef<Set<string>>(new Set());
    const stopAlarmRef = useRef<(() => void) | null>(null);
    const prevPercentageRef = useRef(0);

    // --- Init ---
    useEffect(() => {
        const storedTasks = localStorage.getItem('pro_tasks');
        if (storedTasks) {
            setTasks(JSON.parse(storedTasks));
        }

        const storedTheme = localStorage.getItem('theme');
        const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (storedTheme === 'dark' || (!storedTheme && sysDark)) {
            setDarkMode(true);
            document.documentElement.classList.add('dark');
        }

        const unlockAudio = () => {
            initAudio();
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

    useEffect(() => {
        const handleGlobalKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeAlert) dismissAlarm();
                else if (editingTask) setEditingTask(null);
                else if (deleteModalId !== null) setDeleteModalId(null);
                else if (moveModalId !== null) setMoveModalId(null);
                else if (isSidebarOpen) setIsSidebarOpen(false);
                else if (historyDrilldownDate) setHistoryDrilldownDate(null);
            }
        };
        window.addEventListener('keydown', handleGlobalKey);
        return () => window.removeEventListener('keydown', handleGlobalKey);
    }, [activeAlert, editingTask, deleteModalId, moveModalId, isSidebarOpen, historyDrilldownDate]);

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

            tasks.forEach(t => {
                if (shouldShowTask(t, todayISO) && !t.completions.includes(todayISO)) {
                    if (t.time === currentHM) {
                        const notificationKey = `${t.id}-${todayISO}-${currentHM}`;
                        if (!notifiedTasksRef.current.has(notificationKey)) {
                            if (stopAlarmRef.current) stopAlarmRef.current();

                            const stopFn = startAlarmLoop();
                            stopAlarmRef.current = stopFn;

                            setTimeout(() => {
                                if (stopAlarmRef.current === stopFn) {
                                    stopFn();
                                    stopAlarmRef.current = null;
                                }
                            }, 60000);
                            
                            setActiveAlert(t);

                            if ('Notification' in window && Notification.permission === 'granted') {
                                new Notification("IT'S TIME!", {
                                    body: t.text,
                                    icon: '/icon.png',
                                    requireInteraction: true
                                });
                            }
                            notifiedTasksRef.current.add(notificationKey);
                        }
                    }
                }
            });
        }, 10000);

        return () => clearInterval(interval);
    }, [tasks]);

    // --- Computed Helpers ---
    const todayStr = getLocalISO();
    const getTomorrowStr = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return getLocalISO(d);
    };
    const tomorrowStr = getTomorrowStr();
    const moveDirection = selectedDate > todayStr ? 'backward' : 'forward';

    const setViewDate = (view: ViewMode, offset: number = 0) => {
        setCurrentView(view);
        setHistoryDrilldownDate(null);
        if (view === 'day') {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            setSelectedDate(getLocalISO(d));
        } else if (view === 'week') {
            setSelectedDate(getLocalISO());
        }
    };

    const onTouchStart = (e: React.TouchEvent) => {
        if ((e.target as HTMLElement).closest('.task-item') || (e.target as HTMLElement).closest('input') || editingTask) {
             return;
        }
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const minSwipeDistance = 50;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe || isRightSwipe) {
            let currentIndex = 0;
            if (currentView === 'day') {
                if (selectedDate === todayStr) currentIndex = 0;
                else if (selectedDate === tomorrowStr) currentIndex = 1;
                else currentIndex = 0;
            } else if (currentView === 'week') currentIndex = 2;
            else if (currentView === 'history') currentIndex = 3;

            let newIndex = currentIndex;
            if (isLeftSwipe) { if (newIndex < 3) newIndex++; } 
            else if (isRightSwipe) { if (newIndex > 0) newIndex--; }

            if (newIndex !== currentIndex) {
                if (newIndex === 0) setViewDate('day', 0);
                else if (newIndex === 1) setViewDate('day', 1);
                else if (newIndex === 2) setViewDate('week');
                else if (newIndex === 3) setCurrentView('history');
            }
        }
    };

    // --- Add/Edit Logic ---

    const startAddTask = () => {
        // Create a temporary ID (negative) to signal it's new
        const newTask: Task = {
            id: -Date.now(),
            text: '',
            type: 'one-time',
            category: 'personal',
            dateCreated: selectedDate, // Start with selected date
            completions: [],
            hiddenDates: [],
            notes: '',
            weeklyDay: new Date(selectedDate).getDay()
        };
        setEditingTask(newTask);
    };

    const saveEditingTask = () => {
        if (!editingTask) return;

        // If no text, and it's a new task (negative ID), simply discard it.
        // This effectively handles "Cancel" behavior for new tasks.
        if (!editingTask.text.trim()) {
            if (editingTask.id < 0) {
                setEditingTask(null);
                return;
            }
            // If existing task has no text, we might want to keep it open or revert?
            // For now, let's just keep it open to force user to enter text or delete properly.
            return;
        }

        setTasks(prev => {
            // Check if this is a new task (negative ID)
            if (editingTask.id < 0) {
                const newTask = { ...editingTask, id: Date.now() };
                
                // Permission check for notifications on new timed tasks
                if (newTask.time && 'Notification' in window && Notification.permission !== 'granted') {
                    Notification.requestPermission();
                }
                
                return [newTask, ...prev];
            } else {
                // Update existing
                return prev.map(t => t.id === editingTask.id ? editingTask : t);
            }
        });
        setEditingTask(null);
    };

    const deleteEditingTask = (id: number) => {
        if (id > 0) {
            setDeleteModalId(id);
        }
        setEditingTask(null);
    };

    // --- Actions ---
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

            const newHidden = new Set(t.hiddenDates || []);
            newHidden.add(selectedDate);

            if (newHidden.has(targetDateStr)) {
                newHidden.delete(targetDateStr);
            }

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

    const updateTaskTime = (id: number, time: string | undefined) => {
        // Deprecated usage from direct list, but needed for Snooze
        setTasks(prev => prev.map(t => t.id === id ? { ...t, time } : t));
    };

    // Keep these empty/stubbed as we moved to Modal editing mostly, but List might call them if not fully refactored?
    // Actually List calls onEdit now.
    const updateTaskText = (id: number, text: string) => {}; 
    const updateTaskNotes = (id: number, notes: string) => {};
    const updateTaskCategory = (id: number, category: Category) => {};
    const updateTaskType = (id: number, type: TaskType) => {};
    const cycleCategory = (id: number) => {};
    const cycleType = (id: number) => {};
    const updateWeeklyDay = (id: number, day: number) => {};

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
        dismissAlarm();
    };

    const markActiveAlertDone = () => {
        if (activeAlert) {
            toggleTask(activeAlert.id);
            dismissAlarm();
        }
    };

    // --- Computed Data ---
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

    const activeTasks = visibleTasks.filter(t => !t.completions.includes(contextDate));
    const completedTasks = visibleTasks.filter(t => t.completions.includes(contextDate));

    const timedActive = activeTasks.filter(t => !!t.time).sort((a, b) => a.time!.localeCompare(b.time!));
    const untimedActive = activeTasks.filter(t => !t.time);
    const sortedVisibleTasks = [...timedActive, ...untimedActive, ...completedTasks];

    const totalCount = sortedVisibleTasks.length;
    const completedCount = completedTasks.length;
    const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    useEffect(() => {
        if (percentage === 100 && totalCount > 0 && prevPercentageRef.current < 100) {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
        prevPercentageRef.current = percentage;
    }, [percentage, totalCount]);

    let headerText = parseLocalDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (currentView === 'week') headerText = "Upcoming Week";
    if (currentView === 'history') headerText = "Momentum History";
    if (currentView === 'history' && historyDrilldownDate) headerText = `Tasks for ${historyDrilldownDate}`;

    const quotePool = percentage === 100 && totalCount > 0 ? QUOTES.finish : (percentage > 0 ? QUOTES.progress : QUOTES.start);
    const quote = quotePool[selectedDate.charCodeAt(selectedDate.length - 1) % quotePool.length];

    return (
        <div 
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="min-h-screen"
        >
             {/* Edit/Add Modal */}
             {editingTask && (
                 <EditTaskModal 
                    task={editingTask}
                    onChange={setEditingTask}
                    onClose={saveEditingTask}
                    onDelete={deleteEditingTask}
                 />
             )}

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
                        }}
                        drillDownDate={historyDrilldownDate}
                    />
                ) : (
                    <>
                        {currentView === 'day' && !historyDrilldownDate && (
                            <AddTask onTrigger={startAddTask} />
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
                            onEdit={(task) => setEditingTask({ ...task })}
                            onUpdateText={updateTaskText}
                            onUpdateTime={updateTaskTime}
                            onUpdateNotes={updateTaskNotes}
                            onCycleCategory={cycleCategory}
                            onCycleType={cycleType}
                            onUpdateWeeklyDay={updateWeeklyDay}
                            onUpdateCategory={updateTaskCategory}
                            onUpdateType={updateTaskType}
                            onReorder={(newOrder) => {
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
        </div>
    );
};

export default App;
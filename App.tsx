import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Task, ViewMode, QUOTES, TaskType, Category } from './types';
import { getLocalISO, parseLocalDate, shouldShowTask } from './utils';
import Sidebar from './components/Sidebar';
import TaskList, { EditTaskModal } from './components/TaskList';
import AddTask from './components/AddTask';
import History from './components/History';
import { Menu, Moon, Sun, Home, CalendarDays, BarChart2, Sunrise, Bell, RotateCcw, CheckCircle2, Clock } from 'lucide-react';
import confetti from 'https://esm.sh/canvas-confetti@1.9.2';

// --- Web Worker for Precision Timing (Background Reliability) ---
const createWorker = () => {
    const blob = new Blob([`
        let expected = Date.now() + 1000;
        let timeoutId = null;

        function step() {
            const now = Date.now();
            const dt = now - expected; // drift
            // If drift is huge (tab suspended), reset
            if (dt > 1000) expected = now;
            
            self.postMessage('tick');

            expected += 1000;
            timeoutId = setTimeout(step, Math.max(0, 1000 - dt));
        }

        self.onmessage = function(e) {
            if (e.data === 'start') {
                expected = Date.now() + 1000;
                step();
            } else if (e.data === 'stop') {
                if (timeoutId) clearTimeout(timeoutId);
            }
        };
    `], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
};

// --- Audio Engine ---
let audioCtx: AudioContext | null = null;

const initAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.log("Audio resume failed", e));
    }
    return audioCtx;
};

const startAlarmSound = () => {
    const ctx = initAudio();
    if (!ctx) return () => {};

    let currentOsc: OscillatorNode | null = null;
    let currentGain: GainNode | null = null;
    let intervalId: any;

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
        
        // Pattern: High-Low-High
        osc.frequency.setValueAtTime(880, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.1);
        gain.gain.linearRampToValueAtTime(0, t + 0.2);

        osc.frequency.setValueAtTime(440, t + 0.2);
        gain.gain.setValueAtTime(0.1, t + 0.2);
        gain.gain.linearRampToValueAtTime(0, t + 0.4);

        osc.frequency.setValueAtTime(880, t + 0.4);
        gain.gain.setValueAtTime(0.1, t + 0.4);
        gain.gain.linearRampToValueAtTime(0, t + 0.8);

        osc.start(t);
        osc.stop(t + 1.0);
    };

    playCycle();
    intervalId = setInterval(playCycle, 2000);

    return () => {
        clearInterval(intervalId);
        if (currentOsc) { try { currentOsc.stop(); currentOsc.disconnect(); } catch(e){} }
        if (currentGain) { try { currentGain.disconnect(); } catch(e){} }
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
    const [moveModalId, setMoveModalId] = useState<number | null>(null); // Kept for logic compatibility, though immediate move is used
    const [activeAlert, setActiveAlert] = useState<Task | null>(null);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [undoAction, setUndoAction] = useState<{ label: string, handler: () => void } | null>(null);
    
    // Swipe State
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    // Refs
    const notifiedTasksRef = useRef<Set<string>>(new Set());
    const stopAlarmRef = useRef<(() => void) | null>(null);
    const prevPercentageRef = useRef(0);
    const workerRef = useRef<Worker | null>(null);
    const tasksRef = useRef(tasks); // Ref to hold latest tasks for Worker callback
    const undoTimeoutRef = useRef<any>(null);

    // Keep tasks ref synced
    useEffect(() => {
        tasksRef.current = tasks;
        localStorage.setItem('pro_tasks', JSON.stringify(tasks));
    }, [tasks]);

    // --- Initialization ---
    useEffect(() => {
        const storedTasks = localStorage.getItem('pro_tasks');
        if (storedTasks) setTasks(JSON.parse(storedTasks));

        const storedTheme = localStorage.getItem('theme');
        const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (storedTheme === 'dark' || (!storedTheme && sysDark)) {
            setDarkMode(true);
            document.documentElement.classList.add('dark');
        }

        const handleInteraction = () => {
            initAudio();
            document.removeEventListener('click', handleInteraction);
            document.removeEventListener('touchstart', handleInteraction);
        };
        document.addEventListener('click', handleInteraction);
        document.addEventListener('touchstart', handleInteraction);

        // Init Worker
        workerRef.current = createWorker();
        workerRef.current.postMessage('start');

        workerRef.current.onmessage = (e) => {
            if (e.data === 'tick') checkAlarms();
        };

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [darkMode]);

    // --- Alarm Logic ---
    const checkAlarms = () => {
        const now = new Date();
        const currentHM = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const todayISO = getLocalISO();

        tasksRef.current.forEach(t => {
            if (shouldShowTask(t, todayISO) && !t.completions.includes(todayISO)) {
                if (t.time === currentHM) {
                    const notificationKey = `${t.id}-${todayISO}-${currentHM}`;
                    if (!notifiedTasksRef.current.has(notificationKey)) {
                        // We must trigger via state or ref to avoid stale closure issues, 
                        // but here we just call the trigger function which uses latest refs where possible
                        // However, we need to pass the 't' from the ref.
                        triggerAlarm(t);
                        notifiedTasksRef.current.add(notificationKey);
                    }
                }
            }
        });
    };

    const triggerAlarm = async (task: Task) => {
        if (stopAlarmRef.current) stopAlarmRef.current();
        const stopFn = startAlarmSound();
        stopAlarmRef.current = stopFn;
        
        // Auto-stop after 60s
        setTimeout(() => {
            if (stopAlarmRef.current === stopFn) {
                stopFn();
                stopAlarmRef.current = null;
            }
        }, 60000);

        if ('wakeLock' in navigator) {
            try {
                await navigator.wakeLock.request('screen');
            } catch (err) { console.warn("Wake Lock not supported/allowed"); }
        }

        setActiveAlert(task);
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification("MOTI-ON: It's Time!", { body: task.text, icon: '/icon.png' });
        }
    };

    const dismissAlarm = () => {
        if (stopAlarmRef.current) {
            stopAlarmRef.current();
            stopAlarmRef.current = null;
        }
        setActiveAlert(null);
    };

    const markActiveAlertDone = () => {
        if (activeAlert) {
            toggleTask(activeAlert.id);
            dismissAlarm();
        }
    };

    // --- Data & Logic ---
    const todayStr = getLocalISO();
    
    // Tab Sync Fix: When in Week view, strictly anchor to Today (or start of week)
    // This prevents "Blank List" when switching from Tomorrow -> Week
    const effectiveViewDate = useMemo(() => {
        if (currentView === 'week') return todayStr;
        if (currentView === 'history' && historyDrilldownDate) return historyDrilldownDate;
        return selectedDate;
    }, [currentView, selectedDate, historyDrilldownDate, todayStr]);

    const { sortedVisibleTasks, percentage } = useMemo(() => {
        let visible: Task[] = [];
        const viewStart = effectiveViewDate;

        if (currentView === 'week') {
            const weekIds = new Set<number>();
            for (let i = 0; i < 7; i++) {
                const d = parseLocalDate(viewStart);
                d.setDate(d.getDate() + i);
                const iso = getLocalISO(d);
                tasks.filter(t => shouldShowTask(t, iso)).forEach(t => weekIds.add(t.id));
            }
            visible = tasks.filter(t => weekIds.has(t.id));
        } else {
            // Day View (or History Drilldown)
            visible = tasks.filter(t => shouldShowTask(t, viewStart));
        }

        // --- Strict Date Sort, then Manual Order ---
        visible.sort((a, b) => {
            // Helper to get effective sort date for recurring/weekly tasks
            const getSortDate = (t: Task) => {
                if (t.type === 'one-time') return t.dateCreated;
                // For recurring, if created in past, it effectively is "today" relative to viewStart
                if (t.type === 'recurring') {
                     return t.dateCreated < viewStart ? viewStart : t.dateCreated;
                }
                if (t.type === 'weekly' && t.weeklyDay !== undefined) {
                    const start = parseLocalDate(viewStart);
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

            // 1. Primary: Date (Strict Ascending)
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            
            // 2. Secondary: If dates are equal (e.g. Day View), respect Array Order (Manual Sort)
            // We do NOT sort by time here to allow Drag & Drop to work.
            return 0;
        });

        const completed = visible.filter(t => t.completions.includes(viewStart)); 
        const pct = visible.length > 0 ? Math.round((completed.length / visible.length) * 100) : 0;
        
        return { sortedVisibleTasks: visible, percentage: pct };
    }, [tasks, currentView, effectiveViewDate, historyDrilldownDate]);


    // --- Actions ---
    const setUndo = (label: string, oldTasks: Task[]) => {
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        setUndoAction({ label, handler: () => { setTasks(oldTasks); setUndoAction(null); } });
        undoTimeoutRef.current = setTimeout(() => setUndoAction(null), 4000);
    };

    const toggleTask = (id: number) => {
        const oldTasks = [...tasks];
        const isCompleting = !tasks.find(t => t.id === id)?.completions.includes(effectiveViewDate);
        
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            const targetDate = effectiveViewDate;
            const idx = t.completions.indexOf(targetDate);
            let newCompletions = [...t.completions];
            if (idx > -1) newCompletions.splice(idx, 1);
            else newCompletions.push(targetDate);
            return { ...t, completions: newCompletions };
        }));

        if (isCompleting) {
            confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
            setUndo('Task Completed', oldTasks);
        }
    };

    // Immediate Move (Logic Fixed for Rollover)
    const handleMoveTask = (id: number) => {
        const oldTasks = [...tasks];
        const direction = selectedDate > todayStr ? -1 : 1; 
        
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            
            // USE NATIVE DATE OBJECT FOR ROLLOVER SAFETY
            const d = parseLocalDate(effectiveViewDate);
            d.setDate(d.getDate() + direction);
            const targetIso = getLocalISO(d);

            const newHidden = [...(t.hiddenDates || []), effectiveViewDate];
            let newDateCreated = t.dateCreated;
            
            // Only update dateCreated for one-time tasks to physically move them
            if (t.type === 'one-time') newDateCreated = targetIso;
            
            return { 
                ...t, 
                hiddenDates: newHidden, 
                dateCreated: newDateCreated,
                completions: t.completions.filter(c => c !== effectiveViewDate)
            };
        }));

        const label = direction === 1 ? 'Moved to Tomorrow' : 'Moved to Yesterday';
        setUndo(label, oldTasks);
    };

    const handleDelete = (id: number) => {
        if (deleteModalId === id) {
             const oldTasks = [...tasks];
             setTasks(prev => prev.map(t => t.id === id ? { ...t, hiddenDates: [...(t.hiddenDates||[]), effectiveViewDate] } : t));
             setDeleteModalId(null);
             setUndo('Task Deleted', oldTasks);
        } else {
            setDeleteModalId(id);
        }
    };

    const handleReorder = useCallback((newOrderedTasks: Task[]) => {
        setTasks(prev => {
            const newOrderIds = newOrderedTasks.map(t => t.id);
            const idMap = new Map(prev.map(t => [t.id, t]));
            const reorderedVisible = newOrderIds.map(id => idMap.get(id)!).filter(Boolean);
            const visibleSet = new Set(newOrderIds);
            const otherTasks = prev.filter(t => !visibleSet.has(t.id));
            return [...reorderedVisible, ...otherTasks];
        });
    }, []);

    // --- Render Helpers ---
    const quotePool = percentage === 100 && sortedVisibleTasks.length > 0 ? QUOTES.finish : (percentage > 0 ? QUOTES.progress : QUOTES.start);
    const quote = quotePool[todayStr.charCodeAt(todayStr.length - 1) % quotePool.length];

    useEffect(() => {
        if (percentage === 100 && sortedVisibleTasks.length > 0 && prevPercentageRef.current < 100) {
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        }
        prevPercentageRef.current = percentage;
    }, [percentage, sortedVisibleTasks.length]);

    const setViewDate = (view: ViewMode, offset: number = 0) => {
        setCurrentView(view);
        setHistoryDrilldownDate(null);
        if (view === 'day') {
            const d = new Date(); // Start from actual today
            d.setDate(d.getDate() + offset);
            setSelectedDate(getLocalISO(d));
        } else {
            setSelectedDate(todayStr); 
        }
    };

    return (
        <div className="min-h-screen pb-safe relative">
            {activeAlert && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-md animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 text-center shadow-2xl border-4 border-indigo-500 animate-bounce-in">
                        <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                            <Bell size={48} className="text-indigo-600" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2">{activeAlert.text}</h2>
                        <button onClick={markActiveAlertDone} className="w-full py-5 bg-indigo-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform mb-3 mt-8">
                            Complete Task
                        </button>
                        <button onClick={dismissAlarm} className="w-full py-4 text-slate-400 font-bold hover:text-indigo-500">Dismiss</button>
                    </div>
                </div>
            )}

            {/* Undo Toast */}
            {undoAction && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] animate-fade-in-up">
                    <button 
                        onClick={undoAction.handler}
                        className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 font-bold text-sm hover:scale-105 transition-transform"
                    >
                        <span>{undoAction.label}</span>
                        <div className="h-4 w-[1px] bg-white/20 dark:bg-black/20"></div>
                        <div className="flex items-center gap-1 text-indigo-400 dark:text-indigo-600">
                            <RotateCcw size={14} strokeWidth={3} />
                            <span className="uppercase text-[10px] tracking-widest">Undo</span>
                        </div>
                    </button>
                </div>
            )}

            {editingTask && (
                <EditTaskModal 
                    task={editingTask} 
                    onChange={setEditingTask} 
                    onClose={() => {
                        if (!editingTask.text.trim() && editingTask.id < 0) { setEditingTask(null); return; }
                        setTasks(prev => editingTask.id < 0 ? [editingTask, ...prev] : prev.map(t => t.id === editingTask.id ? editingTask : t));
                        setEditingTask(null);
                    }} 
                    onDelete={(id) => {
                        // If new task (id < 0), just close. If existing, open delete modal
                        if (id < 0) setEditingTask(null);
                        else {
                            setDeleteModalId(id);
                            setEditingTask(null);
                        }
                    }} 
                />
            )}

            {deleteModalId !== null && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDeleteModalId(null)}>
                     <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2rem] p-8 shadow-2xl animate-fade-in-up">
                        <h3 className="text-xl font-black text-center dark:text-white">Remove Task?</h3>
                        <p className="text-slate-500 text-sm font-bold text-center mt-3">This will hide the task from today's list.</p>
                        <div className="flex gap-4 mt-8">
                            <button onClick={() => setDeleteModalId(null)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl text-[10px] font-black uppercase text-slate-500 hover:bg-slate-200">Cancel</button>
                            <button onClick={() => handleDelete(deleteModalId)} className="flex-1 py-4 bg-red-600 rounded-2xl text-[10px] font-black uppercase text-white shadow-lg">Remove</button>
                        </div>
                     </div>
                </div>
            )}

            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} selectedDate={selectedDate} onSelectDate={(d) => { setSelectedDate(d); setCurrentView('day'); }} />

            <main className="max-w-xl mx-auto px-6 pt-12 pb-32">
                <header className="mb-10">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setIsSidebarOpen(true)} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl text-slate-400 hover:text-indigo-600 transition-colors">
                                <Menu size={24} strokeWidth={2.5} />
                            </button>
                            <div>
                                <h1 className="text-3xl font-black italic tracking-tighter leading-none text-slate-900 dark:text-white">
                                    {currentView === 'history' && !historyDrilldownDate ? 'MOTI-ON' : 
                                     currentView === 'week' ? 'Upcoming' : 
                                     parseLocalDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                </h1>
                                <div className="flex items-center gap-3 mt-2">
                                    <p className="text-slate-400 font-bold text-xs uppercase italic truncate max-w-[200px]">"{quote}"</p>
                                    <button onClick={() => setDarkMode(!darkMode)} className="text-slate-300 hover:text-indigo-500">
                                        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                        {currentView !== 'history' && (
                             <div className="relative w-16 h-16 shrink-0">
                                <svg viewBox="0 0 64 64" className="w-full h-full transform -rotate-90">
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="5" fill="transparent" className="text-slate-100 dark:text-slate-800"/>
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="5" fill="transparent" strokeDasharray="175.84" strokeDashoffset={175.84 - (175.84 * (percentage / 100))} strokeLinecap="round" className="text-indigo-600 transition-all duration-700 ease-out"/>
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-xs font-black dark:text-white">{percentage}%</span>
                            </div>
                        )}
                    </div>
                    {currentView !== 'history' && (
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-600 rounded-full transition-all duration-700 ease-out" style={{ width: `${percentage}%` }}></div>
                        </div>
                    )}
                </header>

                {currentView === 'history' && !historyDrilldownDate ? (
                    <History tasks={tasks} onDrillDown={setHistoryDrilldownDate} drillDownDate={historyDrilldownDate} />
                ) : (
                    <>
                        {currentView === 'day' && selectedDate === todayStr && !historyDrilldownDate && (
                            <AddTask onTrigger={() => setEditingTask({ id: -Date.now(), text: '', type: 'one-time', category: 'personal', dateCreated: selectedDate, completions: [], hiddenDates: [], notes: '', weeklyDay: new Date().getDay() })} />
                        )}
                        {historyDrilldownDate && (
                             <button onClick={() => setHistoryDrilldownDate(null)} className="mb-4 text-sm font-bold text-indigo-500 hover:underline">← Back to Stats</button>
                        )}
                        <TaskList 
                            tasks={sortedVisibleTasks} 
                            contextDate={effectiveViewDate} 
                            onToggle={toggleTask} 
                            onDelete={handleDelete} 
                            onMoveTask={handleMoveTask} 
                            onEdit={(t) => setEditingTask({...t})}
                            onReorder={handleReorder}
                            // Compatibility props
                            onUpdateText={()=>{}} onUpdateTime={()=>{}} onCycleCategory={()=>{}} onCycleType={()=>{}} onUpdateWeeklyDay={()=>{}} onUpdateNotes={()=>{}} onUpdateCategory={()=>{}} onUpdateType={()=>{}}
                            moveDirection={selectedDate > todayStr ? 'backward' : 'forward'}
                        />
                    </>
                )}
            </main>

            <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border-t border-slate-100 dark:border-slate-800 px-6 py-4 pb-safe flex justify-between items-center z-50">
                <button onClick={() => setViewDate('day', 0)} className={`flex flex-col items-center gap-1.5 ${currentView === 'day' && selectedDate === todayStr ? 'text-indigo-600 scale-110' : 'text-slate-400'} transition-all`}>
                    <Home size={20} />
                    <span className="text-[9px] font-black uppercase">Today</span>
                </button>
                <button onClick={() => setViewDate('day', 1)} className={`flex flex-col items-center gap-1.5 ${currentView === 'day' && selectedDate !== todayStr ? 'text-indigo-600 scale-110' : 'text-slate-400'} transition-all`}>
                    <Sunrise size={20} strokeWidth={2.5} />
                    <span className="text-[9px] font-black uppercase">Tmrw</span>
                </button>
                <button onClick={() => setViewDate('week')} className={`flex flex-col items-center gap-1.5 ${currentView === 'week' ? 'text-indigo-600 scale-110' : 'text-slate-400'} transition-all`}>
                    <CalendarDays size={20} strokeWidth={2.5} />
                    <span className="text-[9px] font-black uppercase">Week</span>
                </button>
                <button onClick={() => setCurrentView('history')} className={`flex flex-col items-center gap-1.5 ${currentView === 'history' ? 'text-indigo-600 scale-110' : 'text-slate-400'} transition-all`}>
                    <BarChart2 size={20} strokeWidth={2.5} />
                    <span className="text-[9px] font-black uppercase">Stats</span>
                </button>
            </nav>
        </div>
    );
};

export default App;
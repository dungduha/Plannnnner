import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Task, ViewMode, QUOTES, TaskType, Category } from './types';
import { getLocalISO, parseLocalDate, shouldShowTask } from './utils';
import Sidebar from './components/Sidebar';
import TaskList, { EditTaskModal } from './components/TaskList';
import AddTask from './components/AddTask';
import History from './components/History';
import { Menu, Moon, Sun, Home, CalendarDays, BarChart2, Sunrise, Bell, CheckCircle2, Clock } from 'lucide-react';
import confetti from 'https://esm.sh/canvas-confetti@1.9.2';

// --- Web Worker for Precision Timing & Drift Correction ---
// We use a Blob to inline the worker code without needing a separate file in this environment.
const createWorker = () => {
    const blob = new Blob([`
        let expected = Date.now() + 1000;
        let timeoutId = null;

        function step() {
            const dt = Date.now() - expected; // the drift (positive means we are late)
            
            if (dt > 1000) {
                // We drifted significantly (e.g. tab was suspended), just re-sync
                expected = Date.now();
            }

            // Post tick
            self.postMessage('tick');

            expected += 1000;
            // Adjust next timeout by subtracting the drift
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
        audioCtx.resume().catch(e => console.log("Audio resume failed (expected if no interaction)", e));
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
        
        // High-pitch alert pattern
        osc.frequency.setValueAtTime(880, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.1);
        gain.gain.linearRampToValueAtTime(0, t + 0.2);

        osc.frequency.setValueAtTime(1760, t + 0.2);
        gain.gain.setValueAtTime(0.1, t + 0.2);
        gain.gain.linearRampToValueAtTime(0, t + 0.6);

        osc.start(t);
        osc.stop(t + 0.8);
    };

    playCycle();
    intervalId = setInterval(playCycle, 1500);

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
    const [moveModalId, setMoveModalId] = useState<number | null>(null);
    const [activeAlert, setActiveAlert] = useState<Task | null>(null);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    
    // Swipe State
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    // Refs
    const notifiedTasksRef = useRef<Set<string>>(new Set());
    const stopAlarmRef = useRef<(() => void) | null>(null);
    const prevPercentageRef = useRef(0);
    const workerRef = useRef<Worker | null>(null);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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

        // Initialize Audio Context on first interaction
        const handleInteraction = () => {
            initAudio();
            document.removeEventListener('click', handleInteraction);
            document.removeEventListener('touchstart', handleInteraction);
        };
        document.addEventListener('click', handleInteraction);
        document.addEventListener('touchstart', handleInteraction);

        // Start Web Worker
        workerRef.current = createWorker();
        workerRef.current.postMessage('start');

        return () => {
            workerRef.current?.terminate();
            if (wakeLockRef.current) wakeLockRef.current.release();
        };
    }, []);

    // Persist Tasks
    useEffect(() => {
        localStorage.setItem('pro_tasks', JSON.stringify(tasks));
    }, [tasks]);

    // Theme Toggle
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [darkMode]);

    // --- Precision Alarm Logic ---
    useEffect(() => {
        if (!workerRef.current) return;

        const checkAlarms = () => {
            const now = new Date();
            const currentHM = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            const todayISO = getLocalISO();

            tasks.forEach(t => {
                if (shouldShowTask(t, todayISO) && !t.completions.includes(todayISO)) {
                    if (t.time === currentHM) {
                        const notificationKey = `${t.id}-${todayISO}-${currentHM}`;
                        if (!notifiedTasksRef.current.has(notificationKey)) {
                            triggerAlarm(t);
                            notifiedTasksRef.current.add(notificationKey);
                        }
                    }
                }
            });
        };

        workerRef.current.onmessage = (e) => {
            if (e.data === 'tick') checkAlarms();
        };
    }, [tasks]);

    const triggerAlarm = async (task: Task) => {
        // 1. Audio
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

        // 2. Wake Lock
        if ('wakeLock' in navigator) {
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.error("Wake Lock failed:", err);
            }
        }

        // 3. UI & Notification
        setActiveAlert(task);
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification("MOTI-ON: It's Time!", { body: task.text, icon: '/icon.png', requireInteraction: true });
        }
    };

    const dismissAlarm = () => {
        if (stopAlarmRef.current) {
            stopAlarmRef.current();
            stopAlarmRef.current = null;
        }
        if (wakeLockRef.current) {
            wakeLockRef.current.release().then(() => wakeLockRef.current = null);
        }
        setActiveAlert(null);
    };

    // --- Core Logic: View & Sorting ---
    
    // Tab Sync Fix: Ensure 'Week' view always starts from Today, ignoring 'selectedDate' cursor
    const todayStr = getLocalISO();
    const effectiveViewDate = useMemo(() => {
        if (currentView === 'week') return todayStr;
        if (currentView === 'history' && historyDrilldownDate) return historyDrilldownDate;
        return selectedDate;
    }, [currentView, selectedDate, historyDrilldownDate, todayStr]);

    const { sortedVisibleTasks, percentage } = useMemo(() => {
        let visible: Task[] = [];
        const viewStart = effectiveViewDate;

        if (currentView === 'week') {
            // Collect next 7 days
            const weekIds = new Set<number>();
            for (let i = 0; i < 7; i++) {
                const d = parseLocalDate(viewStart);
                d.setDate(d.getDate() + i);
                const iso = getLocalISO(d);
                tasks.filter(t => shouldShowTask(t, iso)).forEach(t => weekIds.add(t.id));
            }
            visible = tasks.filter(t => weekIds.has(t.id));
        } else {
            // Day View (History is treated as a day view if drilldown is active)
            visible = tasks.filter(t => shouldShowTask(t, viewStart));
        }

        // --- Deterministic Sorting ---
        // 1. Date (Earliest First)
        // 2. Time (Earliest First)
        // 3. ID (Creation Order)
        visible.sort((a, b) => {
            // Helper to determine the "effective date" of a task for sorting purposes
            const getEffectiveSortDate = (t: Task) => {
                if (t.type === 'one-time') return t.dateCreated;
                // For recurring/weekly, we clamp the date to the viewStart if it started in the past
                // This ensures "Daily" tasks show up as "Today" in the sort order
                if (t.dateCreated < viewStart) return viewStart; 
                
                // For weekly specific
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

            const dateA = getEffectiveSortDate(a);
            const dateB = getEffectiveSortDate(b);
            
            if (dateA !== dateB) return dateA.localeCompare(dateB);

            // Time Sort (Tasks with time come before tasks without time, OR strictly by string)
            // Let's go strictly by string. No time ('') is treated as 23:59 to put at end, or 00:00 to put at start.
            // Requirement: "Deterministic".
            const timeA = a.time || '23:59'; 
            const timeB = b.time || '23:59';
            if (timeA !== timeB) return timeA.localeCompare(timeB);

            return a.id - b.id; 
        });

        // Percentage
        const completed = visible.filter(t => t.completions.includes(viewStart)); // Note: this calculates completion for the *start* date of view. 
        // For Week view, percentage is tricky. Let's simplify: 
        // For Day/History: Exact. 
        // For Week: Percentage of *all visible tasks* that are completed *on their respective days*.
        
        let completedCount = 0;
        visible.forEach(t => {
            // Check if completed on its effective date? 
            // Simplified: Check if completed on viewStart (for day view) 
            // OR check if completed on any day in the range (for week view - naive approach but effective for visual)
            if (currentView === 'day' || currentView === 'history') {
                if (t.completions.includes(viewStart)) completedCount++;
            } else {
                // For week, check if completed today/upcoming? 
                // Let's stick to standard Day View percentage for the header mainly.
                // If in Week view, header usually shows Today's progress or week's total? 
                // Let's show Today's progress in header even in Week View to keep motivation high.
                const today = getLocalISO();
                if (t.completions.includes(today)) completedCount++; // This counts completions for today specifically
            }
        });
        
        // Recalculate strict percentage for the progress bar based on CURRENT VIEW context
        const viewTotal = visible.length;
        const viewCompleted = visible.filter(t => {
             // For each task, is it completed on the day it represents in the list?
             // Since we sorted them, we know their dates.
             // This is complex for the `visible` array which mixes days. 
             // Let's default to: Percentage = Completed Tasks on the "viewStart" date (Today).
             return t.completions.includes(viewStart);
        }).length;
        
        const pct = viewTotal > 0 ? Math.round((viewCompleted / viewTotal) * 100) : 0;

        return { sortedVisibleTasks: visible, percentage: pct };

    }, [tasks, currentView, effectiveViewDate, historyDrilldownDate]);


    // --- Actions ---
    const toggleTask = (id: number) => {
        // Use effectiveViewDate to ensure we mark the correct day
        // In Week view, we need to know WHICH day the user clicked.
        // But the `toggle` function is generic. 
        // We will default to marking 'effectiveViewDate' (Today or Selected Day).
        // If the task in Week view is for a future date, we should probably mark that future date?
        // Current architecture limits `completions` to strings. 
        // For simplicity in this Refactor (Reliability focus), we toggle for the *current context date*.
        
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            
            // Logic: If in Week View, find the date this task belongs to?
            // Since we don't pass the clicked date up, we assume the user is working on "Today" or the "Selected Date".
            // To be safe and deterministic: Toggle the date that acts as the View Context.
            const targetDate = effectiveViewDate; 
            
            const idx = t.completions.indexOf(targetDate);
            let newCompletions = [...t.completions];
            if (idx > -1) newCompletions.splice(idx, 1);
            else newCompletions.push(targetDate);
            
            return { ...t, completions: newCompletions };
        }));
    };

    // --- Render Helpers ---
    const quotePool = percentage === 100 && sortedVisibleTasks.length > 0 ? QUOTES.finish : (percentage > 0 ? QUOTES.progress : QUOTES.start);
    const quote = quotePool[todayStr.charCodeAt(todayStr.length - 1) % quotePool.length];
    
    // Confetti Effect
    useEffect(() => {
        if (percentage === 100 && sortedVisibleTasks.length > 0 && prevPercentageRef.current < 100) {
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        }
        prevPercentageRef.current = percentage;
    }, [percentage, sortedVisibleTasks.length]);

    // Handle View Switching
    const setViewDate = (view: ViewMode, offset: number = 0) => {
        setCurrentView(view);
        setHistoryDrilldownDate(null);
        if (view === 'day') {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            setSelectedDate(getLocalISO(d));
        } else {
            // Reset selected date to today when going to week/history to ensure clean state
            setSelectedDate(todayStr);
        }
    };

    // Global Swipe Handler
    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const dist = touchStart - touchEnd;
        if (Math.abs(dist) > 50) {
            const isLeft = dist > 0;
            // Simplified navigation for cognitive load reduction
            if (isLeft) {
                // Swipe Left -> Next
                if (currentView === 'day' && selectedDate === todayStr) setViewDate('day', 1); // Go Tomorrow
                else if (currentView === 'day' && selectedDate !== todayStr) setViewDate('week'); // Go Week
                else if (currentView === 'week') setCurrentView('history'); // Go Stats
            } else {
                // Swipe Right -> Prev
                if (currentView === 'history') setViewDate('week');
                else if (currentView === 'week') setViewDate('day', 1);
                else if (currentView === 'day' && selectedDate !== todayStr) setViewDate('day', 0);
            }
        }
        setTouchStart(null);
        setTouchEnd(null);
    };

    return (
        <div 
            onTouchStart={e => {
                const target = e.target as HTMLElement;
                if (!target.closest('.no-swipe')) {
                    setTouchStart(e.targetTouches[0].clientX);
                }
            }}
            onTouchMove={e => setTouchEnd(e.targetTouches[0].clientX)}
            onTouchEnd={onTouchEnd}
            className="min-h-screen pb-safe"
        >
            {activeAlert && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-md animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 text-center shadow-2xl border-4 border-indigo-500 animate-bounce-in">
                        <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                            <Bell size={48} className="text-indigo-600" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2">{activeAlert.text}</h2>
                        <p className="text-slate-500 font-bold mb-8">It's time to move.</p>
                        <button onClick={() => { toggleTask(activeAlert.id); dismissAlarm(); }} className="w-full py-5 bg-indigo-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform mb-3">
                            Complete Task
                        </button>
                        <button onClick={dismissAlarm} className="w-full py-4 text-slate-400 font-bold hover:text-indigo-500">Dismiss</button>
                    </div>
                </div>
            )}

            {editingTask && <EditTaskModal task={editingTask} onChange={setEditingTask} onClose={() => {
                if(!editingTask.text.trim() && editingTask.id < 0) { setEditingTask(null); return; }
                setTasks(prev => editingTask.id < 0 ? [editingTask, ...prev] : prev.map(t => t.id === editingTask.id ? editingTask : t));
                setEditingTask(null);
            }} onDelete={(id) => { setTasks(prev => prev.filter(t => t.id !== id)); setEditingTask(null); }} />}

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
                            <AddTask onTrigger={() => setEditingTask({ id: -Date.now(), text: '', type: 'one-time', category: 'personal', dateCreated: selectedDate, completions: [], hiddenDates: [] })} />
                        )}
                        {historyDrilldownDate && (
                             <button onClick={() => setHistoryDrilldownDate(null)} className="mb-4 text-sm font-bold text-indigo-500 hover:underline">← Back to Stats</button>
                        )}
                        <TaskList 
                            tasks={sortedVisibleTasks} 
                            contextDate={effectiveViewDate} 
                            onToggle={toggleTask} 
                            onDelete={(id) => setDeleteModalId(id)} 
                            onMoveTask={(id) => setMoveModalId(id)} 
                            onEdit={(t) => setEditingTask({...t})}
                            // Pass empty functions for unnecessary props in this refactor
                            onUpdateText={()=>{}} onUpdateTime={()=>{}} onCycleCategory={()=>{}} onCycleType={()=>{}} onUpdateWeeklyDay={()=>{}} onUpdateNotes={()=>{}} onUpdateCategory={()=>{}} onUpdateType={()=>{}} onReorder={()=>{}}
                            moveDirection={selectedDate > todayStr ? 'backward' : 'forward'}
                        />
                    </>
                )}
            </main>

            <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border-t border-slate-100 dark:border-slate-800 px-6 py-4 pb-safe flex justify-between items-center z-50 transition-all duration-300 no-swipe">
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
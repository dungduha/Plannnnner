import React, { useEffect, useRef, useState } from 'react';
import Sortable from 'sortablejs';
import { Task, Category, TaskType, DAYS, CATEGORIES } from '../types';
import { GripVertical, Check, Trash2, ArrowRightCircle, ArrowLeftCircle, Clock, X, AlignLeft, ChevronDown } from 'lucide-react';

interface TaskListProps {
    tasks: Task[];
    contextDate: string;
    onToggle: (id: number) => void;
    onDelete: (id: number) => void;
    onMoveTask: (id: number) => void;
    onUpdateText: (id: number, newText: string) => void;
    onUpdateTime: (id: number, time: string | undefined) => void;
    onCycleCategory: (id: number) => void;
    onCycleType: (id: number) => void;
    onUpdateWeeklyDay: (id: number, day: number) => void;
    onUpdateNotes: (id: number, notes: string) => void;
    onUpdateCategory: (id: number, category: Category) => void;
    onUpdateType: (id: number, type: TaskType) => void;
    onReorder: (newOrder: Task[]) => void;
    moveDirection: 'forward' | 'backward';
}

const CATEGORY_STYLES = {
    work: { dot: 'bg-blue-500' },
    personal: { dot: 'bg-purple-500' },
    health: { dot: 'bg-emerald-500' },
    other: { dot: 'bg-slate-500' }
};

// Inline Popover TimePicker for reuse
const TimePickerPopover: React.FC<{ 
    currentTime: string | undefined, 
    onSave: (t: string | undefined) => void, 
    onClose: () => void 
}> = ({ currentTime, onSave, onClose }) => {
    const [time, setTime] = useState(currentTime || '09:00');
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
    const pickerRef = useRef<HTMLDivElement>(null);
    
    // Refs for native listeners
    const hourRef = useRef<HTMLDivElement>(null);
    const minuteRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    const getCurrentHour = () => time.split(':')[0];
    const getCurrentMinute = () => time.split(':')[1];
    const handleTimeSelect = (h: string, m: string) => setTime(`${h}:${m}`);

    // Native Wheel Handler (Non-Passive)
    useEffect(() => {
        const createWheelHandler = (mode: 'hour' | 'minute') => (e: WheelEvent) => {
            e.preventDefault(); // Stop page scroll
            e.stopPropagation();

            const delta = Math.sign(e.deltaY);
            const currentH = parseInt(time.split(':')[0], 10);
            const currentM = parseInt(time.split(':')[1], 10);

            if (mode === 'hour') {
                let val = currentH + delta;
                if (val > 23) val = 0;
                if (val < 0) val = 23;
                handleTimeSelect(String(val).padStart(2, '0'), String(currentM).padStart(2, '0'));
            } else {
                let val = currentM + delta;
                if (val > 59) val = 0;
                if (val < 0) val = 59;
                handleTimeSelect(String(currentH).padStart(2, '0'), String(val).padStart(2, '0'));
            }
        };

        const hourHandler = createWheelHandler('hour');
        const minuteHandler = createWheelHandler('minute');

        const hEl = hourRef.current;
        const mEl = minuteRef.current;

        if (hEl) hEl.addEventListener('wheel', hourHandler, { passive: false });
        if (mEl) mEl.addEventListener('wheel', minuteHandler, { passive: false });

        return () => {
            if (hEl) hEl.removeEventListener('wheel', hourHandler);
            if (mEl) mEl.removeEventListener('wheel', minuteHandler);
        };
    }, [time]);

    return (
        <div 
            ref={pickerRef} 
            onClick={(e) => e.stopPropagation()} 
            className="absolute left-0 top-full mt-2 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border dark:border-slate-700 p-4 w-60 z-[100] animate-fade-in-up cursor-auto"
        >
            <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-black uppercase text-slate-400">Edit Time</span>
                <button onClick={() => onSave(undefined)} className="text-[9px] font-bold text-red-500 uppercase hover:underline">Remove</button>
            </div>
            <div className="flex gap-2 items-center justify-center">
                <div 
                    ref={hourRef}
                    className="flex flex-col gap-1 w-full"
                >
                    <select 
                        value={getCurrentHour()} 
                        onChange={(e) => handleTimeSelect(e.target.value, getCurrentMinute())} 
                        className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white text-base font-bold p-1 rounded-lg text-center outline-none w-full appearance-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                        {hours.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                </div>
                <span className="text-xl font-black text-slate-300">:</span>
                <div 
                    ref={minuteRef}
                    className="flex flex-col gap-1 w-full"
                >
                    <select 
                        value={getCurrentMinute()} 
                        onChange={(e) => handleTimeSelect(getCurrentHour(), e.target.value)} 
                        className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white text-base font-bold p-1 rounded-lg text-center outline-none w-full appearance-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
            </div>
            <button onClick={() => onSave(time)} className="w-full mt-3 bg-indigo-600 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700">Save</button>
        </div>
    );
};

// Mobile Detail Modal Component
const MobileEditModal = ({ task, onClose, onUpdateText, onUpdateTime, onUpdateNotes, onUpdateCategory, onUpdateType, onUpdateWeeklyDay, onDelete }: any) => {
    // We use local state for smooth editing, then save on change or blur
    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-2xl animate-fade-in-up flex flex-col gap-5 max-h-[85vh] overflow-y-auto">
                
                <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Edit Task</h3>
                    <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500">
                        <X size={16} strokeWidth={3} />
                    </button>
                </div>

                {/* Main Text Input */}
                <input 
                    type="text" 
                    value={task.text} 
                    onChange={(e) => onUpdateText(task.id, e.target.value)}
                    className="text-xl font-bold bg-transparent border-b-2 border-slate-100 dark:border-slate-800 pb-2 outline-none focus:border-indigo-500 dark:text-white"
                    placeholder="Task name"
                />

                {/* Flex Row: Category Dropdown & Time Picker */}
                <div className="flex gap-4">
                    {/* Category Dropdown (Flex-Grow) */}
                    <div className="flex-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Category</label>
                        <div className="relative">
                            <select 
                                value={task.category}
                                onChange={(e) => onUpdateCategory(task.id, e.target.value as Category)}
                                className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm font-bold appearance-none outline-none text-slate-700 dark:text-slate-200 border-r-[16px] border-transparent"
                            >
                                {CATEGORIES.map((c: string) => (
                                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Compact Time Picker */}
                    <div>
                        <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Time</label>
                        <div className="relative flex items-center">
                            <input 
                                type="time" 
                                value={task.time || ''} 
                                onChange={(e) => onUpdateTime(task.id, e.target.value || undefined)}
                                className="bg-slate-100 dark:bg-slate-800 rounded-xl pl-9 pr-3 py-3 text-sm font-bold outline-none text-slate-700 dark:text-slate-200 w-[110px]"
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none">
                                <Clock size={16} strokeWidth={2.5} />
                            </div>
                            {task.time && (
                                <button 
                                    onClick={() => onUpdateTime(task.id, undefined)} 
                                    className="absolute -right-2 -top-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm"
                                >
                                    <X size={10} strokeWidth={3} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Type Selection */}
                <div>
                     <label className="text-[9px] font-black uppercase text-slate-400 block mb-2">Recurrence</label>
                     <div className="flex gap-2">
                        {(['one-time', 'recurring', 'weekly'] as TaskType[]).map(t => (
                            <button 
                                key={t}
                                onClick={() => onUpdateType(task.id, t)}
                                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                                    task.type === t
                                    ? 'bg-indigo-600 text-white' 
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                }`}
                            >
                                {t === 'one-time' ? 'Once' : (t === 'recurring' ? 'Daily' : 'Week')}
                            </button>
                        ))}
                     </div>
                     {task.type === 'weekly' && (
                        <div className="mt-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl flex items-center justify-between">
                             <span className="text-[10px] font-bold text-slate-500">Day of Week</span>
                             <select 
                                value={task.weeklyDay ?? 1}
                                onChange={(e) => onUpdateWeeklyDay(task.id, parseInt(e.target.value))}
                                className="bg-transparent text-xs font-black text-indigo-600 outline-none cursor-pointer"
                             >
                                 {DAYS.map((day, i) => (
                                     <option key={i} value={i}>{day}</option>
                                 ))}
                             </select>
                        </div>
                     )}
                </div>

                {/* Notes */}
                <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 block mb-2">Notes</label>
                    <textarea 
                        value={task.notes || ''} 
                        onChange={(e) => onUpdateNotes(task.id, e.target.value)}
                        placeholder="Add details..."
                        className="w-full h-24 bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-sm font-medium outline-none resize-none dark:text-slate-300"
                    />
                </div>
                
                {/* Footer Actions */}
                <div className="pt-2 border-t dark:border-slate-800 flex gap-3">
                    <button onClick={() => { onDelete(task.id); onClose(); }} className="p-4 bg-red-50 text-red-500 rounded-xl flex-grow font-black text-xs uppercase hover:bg-red-100">Delete Task</button>
                    <button onClick={onClose} className="p-4 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-xl flex-grow font-black text-xs uppercase shadow-lg">Done</button>
                </div>
            </div>
        </div>
    )
}

const TaskItem = ({ task, contextDate, onToggle, onDelete, onMoveTask, onUpdateText, onUpdateTime, onCycleCategory, onCycleType, onUpdateWeeklyDay, onUpdateNotes, onUpdateCategory, onUpdateType, moveDirection }: any) => {
    const isDone = task.completions.includes(contextDate);
    const isOverdue = task.type === 'one-time' && task.dateCreated < contextDate && !isDone && contextDate === new Date().toISOString().split('T')[0];
    const catStyle = CATEGORY_STYLES[task.category as keyof typeof CATEGORY_STYLES] || CATEGORY_STYLES.other;
    const taskDisplayType = task.type === 'one-time' ? 'once' : (task.type === 'recurring' ? 'daily' : 'weekly');
    const hasTime = !!task.time;
    const hasNotes = !!task.notes && task.notes.trim().length > 0;
    
    const [showPicker, setShowPicker] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showMobileEdit, setShowMobileEdit] = useState(false);

    // Handle click based on device width
    const handleBodyClick = (e: React.MouseEvent) => {
        // Prevent if clicking specific interactive elements
        const target = e.target as HTMLElement;
        if (target.tagName === 'SELECT' || target.getAttribute('contenteditable') || target.closest('button')) {
            return;
        }

        if (window.innerWidth < 640) { // Mobile breakpoint
            setShowMobileEdit(true);
        } else {
            setIsExpanded(!isExpanded);
        }
    };

    return (
        <>
            {showMobileEdit && (
                <MobileEditModal 
                    task={task} 
                    onClose={() => setShowMobileEdit(false)}
                    onUpdateText={onUpdateText}
                    onUpdateTime={onUpdateTime}
                    onUpdateNotes={onUpdateNotes}
                    onUpdateCategory={onUpdateCategory}
                    onUpdateType={onUpdateType}
                    onUpdateWeeklyDay={onUpdateWeeklyDay}
                    onDelete={onDelete}
                />
            )}
            
            <div 
                data-id={task.id} 
                className={`task-item group flex flex-col bg-white dark:bg-slate-800 p-5 rounded-3xl border-2 transition-all relative ${
                    isDone 
                        ? 'border-slate-50 dark:border-slate-900 opacity-60' 
                        : 'border-slate-100 dark:border-slate-700 shadow-sm'
                }`}
            >
                <div className="flex items-center w-full">
                    <div className={`mr-4 transition-colors px-1 touch-none ${hasTime ? 'cursor-pointer text-indigo-400 hover:text-indigo-600' : 'drag-handle cursor-grab active:cursor-grabbing text-slate-200 dark:text-slate-600 group-hover:text-slate-400'}`}>
                            {hasTime ? (
                                <div onClick={() => setShowPicker(true)} className="relative">
                                    <Clock size={16} />
                                    {showPicker && (
                                        <TimePickerPopover 
                                            currentTime={task.time} 
                                            onSave={(t) => { onUpdateTime(task.id, t); setShowPicker(false); }}
                                            onClose={() => setShowPicker(false)}
                                        />
                                    )}
                                </div>
                            ) : <GripVertical size={20} />}
                    </div>
                    
                    <button 
                        onClick={() => onToggle(task.id)}
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${isDone ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-600'}`}
                    >
                        {isDone && <Check size={16} strokeWidth={3} />}
                    </button>
                    
                    <div 
                        className="ml-5 flex-grow min-w-0 cursor-pointer" 
                        onClick={handleBodyClick}
                    >
                        <div className="flex items-center gap-2 flex-wrap">
                            {hasTime && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
                                    className="text-[10px] font-black bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                >
                                    {task.time}
                                </button>
                            )}
                            {/* Allow untimed tasks to become timed via a small button */}
                            {!hasTime && (
                                <div className="relative">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setShowPicker(true); }} 
                                        className="text-slate-400 dark:text-slate-500 hover:text-indigo-500 transition-colors p-0.5"
                                    >
                                        <Clock size={14} />
                                    </button>
                                    {showPicker && (
                                        <TimePickerPopover 
                                            currentTime={undefined} 
                                            onSave={(t) => { onUpdateTime(task.id, t); setShowPicker(false); }}
                                            onClose={() => setShowPicker(false)}
                                        />
                                    )}
                                </div>
                            )}

                            <span 
                                contentEditable 
                                suppressContentEditableWarning
                                onBlur={(e) => onUpdateText(task.id, e.currentTarget.innerText)}
                                onClick={(e) => e.stopPropagation()} // Stop toggle when clicking text to edit
                                className={`text-base font-bold tracking-tight outline-none focus:text-indigo-600 truncate block min-w-[50px] ${isDone ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}
                            >
                                {task.text}
                            </span>
                            {isOverdue && <span className="text-[9px] px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-black uppercase tracking-tighter shrink-0">Late</span>}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-1.5 overflow-x-auto no-scrollbar">
                            <button onClick={(e) => { e.stopPropagation(); onCycleCategory(task.id); }} className="flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 px-1.5 py-0.5 rounded-lg transition-colors group/cat shrink-0">
                                <span className={`w-2 h-2 rounded-full ${catStyle.dot}`}></span>
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover/cat:text-indigo-500 transition-colors">{task.category}</span>
                            </button>
                            
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={(e) => { e.stopPropagation(); onCycleType(task.id); }} className="text-[11px] font-bold text-slate-300 dark:text-slate-600 italic uppercase tracking-tighter hover:text-indigo-500 hover:bg-slate-50 px-1.5 py-0.5 rounded-lg transition-colors">
                                    {taskDisplayType}
                                </button>
                                {task.type === 'weekly' && (
                                    <select 
                                        value={task.weeklyDay ?? 1}
                                        onChange={(e) => onUpdateWeeklyDay(task.id, parseInt(e.target.value))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[11px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-2 py-0.5 outline-none appearance-none cursor-pointer border-none"
                                    >
                                        {DAYS.map((day, i) => (
                                            <option key={i} value={i}>{day[0]}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Notes Indicator Icon */}
                            <div className={`flex items-center transition-opacity ${hasNotes || isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                                    className={`p-1 rounded-md transition-colors ${hasNotes ? 'text-indigo-400 dark:text-indigo-500' : 'text-slate-300 dark:text-slate-600 hover:text-indigo-400'}`}
                                >
                                    <AlignLeft size={14} strokeWidth={hasNotes ? 2.5 : 2} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center shrink-0">
                        <button 
                            onClick={() => onMoveTask(task.id)}
                            className="flex items-center gap-2 text-slate-300 dark:text-slate-600 hover:text-indigo-500 transition-all px-3 py-2 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 group/tomorrow max-w-[40px] hover:max-w-[200px] overflow-hidden duration-500"
                        >
                            {moveDirection === 'forward' ? (
                                <ArrowRightCircle size={24} strokeWidth={2.5} className="shrink-0" />
                            ) : (
                                <ArrowLeftCircle size={24} strokeWidth={2.5} className="shrink-0" />
                            )}
                            <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap opacity-0 group-hover/tomorrow:opacity-100 transition-opacity">
                                {moveDirection === 'forward' ? 'Push' : 'Pull'}
                            </span>
                        </button>
                        
                        <button 
                            onClick={() => onDelete(task.id)}
                            className="p-3 text-slate-200 dark:text-slate-600 hover:text-red-500 transition-all rounded-2xl"
                        >
                            <Trash2 size={24} strokeWidth={2} />
                        </button>
                    </div>
                </div>

                {/* Notes Section - Desktop Only (on mobile this is inside modal) */}
                {isExpanded && (
                    <div className="w-full pl-[4.5rem] pr-2 mt-2 animate-fade-in origin-top hidden sm:block">
                        <div className="relative">
                            <textarea
                                value={task.notes || ''}
                                onChange={(e) => onUpdateNotes(task.id, e.target.value)}
                                onBlur={() => { if (!task.notes) setIsExpanded(false); }}
                                onClick={(e) => e.stopPropagation()} // Prevent DnD interference
                                onPointerDown={(e) => e.stopPropagation()} // Prevent DnD start
                                placeholder="Add details..."
                                className="w-full bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 text-sm font-medium text-slate-600 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 resize-none min-h-[80px] transition-all"
                            />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

const TaskList: React.FC<TaskListProps> = (props) => {
    const { tasks, contextDate, onReorder } = props;
    const untimedListRef = useRef<HTMLDivElement>(null);
    const sortableInstance = useRef<Sortable | null>(null);

    // Derived State
    const timedTasks = tasks.filter(t => !!t.time && !t.completions.includes(contextDate));
    const untimedTasks = tasks.filter(t => !t.time && !t.completions.includes(contextDate));
    const completedTasks = tasks.filter(t => t.completions.includes(contextDate));

    // Ref to track state for closure
    const tasksRef = useRef({ timed: timedTasks, untimed: untimedTasks, completed: completedTasks });
    
    // Update ref on render
    useEffect(() => {
        tasksRef.current = { timed: timedTasks, untimed: untimedTasks, completed: completedTasks };
    }, [timedTasks, untimedTasks, completedTasks]);

    useEffect(() => {
        if (untimedListRef.current && !sortableInstance.current) {
            sortableInstance.current = Sortable.create(untimedListRef.current, {
                animation: 150,
                delay: 200,
                delayOnTouchOnly: true,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                onEnd: () => {
                   if (!untimedListRef.current) return;
                   
                   const { timed, untimed, completed } = tasksRef.current;
                   
                   // Get new order of Untimed by reading DOM IDs
                   const ids = Array.from(untimedListRef.current.children).map(child => 
                       Number((child as HTMLElement).getAttribute('data-id'))
                   );
                   
                   const untimedMap = new Map(untimed.map(t => [t.id, t]));
                   const reorderedUntimed = ids.map(id => untimedMap.get(id)).filter((t): t is Task => !!t);
                   
                   // Reconstruct full list: Timed + Reordered Untimed + Completed
                   const newFullOrder = [...timed, ...reorderedUntimed, ...completed];
                   
                   onReorder(newFullOrder);
                }
            });
        }
    }, [onReorder]);

    if (tasks.length === 0) {
        return <div className="py-20 text-center text-slate-400 font-bold">No tasks scheduled</div>;
    }

    return (
        <div className="space-y-4 min-h-[100px]">
            {/* Timed Tasks - Not Sortable - Always at Top */}
            <div className="space-y-4">
                {timedTasks.map(task => (
                    <TaskItem key={task.id} task={task} {...props} />
                ))}
            </div>

            {/* Untimed Tasks - Sortable */}
            <div ref={untimedListRef} className="space-y-4">
                {untimedTasks.map(task => (
                    <TaskItem key={task.id} task={task} {...props} />
                ))}
            </div>

            {/* Completed Tasks - Not Sortable - Always at Bottom */}
            <div className="space-y-4 opacity-80">
                {completedTasks.map(task => (
                    <TaskItem key={task.id} task={task} {...props} />
                ))}
            </div>
        </div>
    );
};

export default TaskList;
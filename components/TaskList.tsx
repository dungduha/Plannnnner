import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Task, Category, TaskType, DAYS, CATEGORIES, MONTHS } from '../types';
import { Check, Trash2, ArrowRightCircle, ArrowLeftCircle, Clock, X, Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocalISO, parseLocalDate } from '../utils';

interface TaskListProps {
    tasks: Task[];
    contextDate: string;
    onToggle: (id: number) => void;
    onDelete: (id: number) => void;
    onMoveTask: (id: number) => void;
    onEdit: (task: Task) => void;
    // Legacy compatibility
    onUpdateText: any; onUpdateTime: any; onCycleCategory: any; onCycleType: any; onUpdateWeeklyDay: any; onUpdateNotes: any; onUpdateCategory: any; onUpdateType: any; onReorder: any;
    moveDirection: 'forward' | 'backward';
}

const CATEGORY_STYLES = {
    work: { dot: 'bg-blue-500' },
    personal: { dot: 'bg-purple-500' },
    health: { dot: 'bg-emerald-500' },
    other: { dot: 'bg-slate-500' }
};

// --- Helpers for Popovers ---
const usePopoverPosition = (triggerRef: React.RefObject<HTMLElement>, isOpen: boolean) => {
    const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

    useLayoutEffect(() => {
        if (isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            let top = rect.bottom + 8;
            let left = rect.left;
            if (left + 240 > window.innerWidth) left = window.innerWidth - 250;
            setStyle({ position: 'fixed', top: `${top}px`, left: `${left}px`, zIndex: 150, opacity: 1 });
        }
    }, [isOpen, triggerRef]);
    return style;
};

// --- Restored Components ---
const DatePickerPopover: React.FC<{ currentDate: string, onSelect: (date: string) => void, onClose: () => void, triggerRef: React.RefObject<HTMLElement> }> = ({ currentDate, onSelect, onClose, triggerRef }) => {
    const [viewDate, setViewDate] = useState(parseLocalDate(currentDate));
    const style = usePopoverPosition(triggerRef, true);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node) && triggerRef.current && !triggerRef.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [onClose, triggerRef]);

    const changeMonth = (offset: number) => {
        const d = new Date(viewDate);
        d.setMonth(d.getMonth() + offset);
        setViewDate(d);
    };

    const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];
        for (let i = 0; i < firstDay.getDay(); i++) days.push(<div key={`empty-${i}`} />);
        for (let d = 1; d <= lastDay.getDate(); d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isSelected = dateStr === currentDate;
            const isToday = dateStr === getLocalISO();
            days.push(
                <button key={dateStr} onClick={() => onSelect(dateStr)} className={`aspect-square flex items-center justify-center rounded-lg text-xs font-bold transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'} ${isToday && !isSelected ? 'text-indigo-600 ring-1 ring-inset ring-indigo-200' : ''}`}>
                    {d}
                </button>
            );
        }
        return days;
    };

    return (
        <div ref={popoverRef} style={style} className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border dark:border-slate-700 p-4 w-64 animate-fade-in-up">
            <div className="flex justify-between items-center mb-4">
                <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500"><ChevronLeft size={16} /></button>
                <span className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
                <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2 text-center">{['S','M','T','W','T','F','S'].map(d => <span key={d} className="text-[9px] font-black text-slate-400 uppercase">{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
        </div>
    );
};

const TimePickerPopover: React.FC<{ currentTime: string | undefined, onSave: (t: string | undefined) => void, onClose: () => void, triggerRef: React.RefObject<HTMLElement> }> = ({ currentTime, onSave, onClose, triggerRef }) => {
    const [time, setTime] = useState(currentTime || '09:00');
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
    const style = usePopoverPosition(triggerRef, true);
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node) && triggerRef.current && !triggerRef.current.contains(event.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, triggerRef]);

    const handleTimeSelect = (h: string, m: string) => setTime(`${h}:${m}`);

    return (
        <div ref={pickerRef} style={style} className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border dark:border-slate-700 p-4 w-60 animate-fade-in-up">
            <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-black uppercase text-slate-400">Edit Time</span>
                <button onClick={() => onSave(undefined)} className="text-[9px] font-bold text-red-500 uppercase hover:underline">Remove</button>
            </div>
            <div className="flex gap-2 items-center justify-center">
                <select value={time.split(':')[0]} onChange={(e) => handleTimeSelect(e.target.value, time.split(':')[1])} className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white text-base font-bold p-1 rounded-lg text-center outline-none w-full appearance-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                    {hours.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="text-xl font-black text-slate-300">:</span>
                <select value={time.split(':')[1]} onChange={(e) => handleTimeSelect(time.split(':')[0], e.target.value)} className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white text-base font-bold p-1 rounded-lg text-center outline-none w-full appearance-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                    {minutes.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>
            <button onClick={() => onSave(time)} className="w-full mt-3 bg-indigo-600 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700">Save</button>
        </div>
    );
};

// --- Main Components ---
const TaskItem = ({ task, contextDate, onToggle, onDelete, onMoveTask, onEdit, moveDirection }: any) => {
    const isDone = task.completions.includes(contextDate);
    const isOverdue = task.type === 'one-time' && task.dateCreated < contextDate && !isDone && contextDate === new Date().toISOString().split('T')[0];
    const catStyle = CATEGORY_STYLES[task.category as keyof typeof CATEGORY_STYLES] || CATEGORY_STYLES.other;
    // Display "Daily" for recurring tasks as requested
    const displayType = task.type === 'one-time' ? 'Once' : (task.type === 'recurring' ? 'Daily' : 'Weekly');

    return (
        <div data-id={task.id} className={`group flex flex-col bg-white dark:bg-slate-800 p-5 rounded-3xl border-2 transition-all relative ${isDone ? 'border-slate-50 dark:border-slate-900 opacity-60' : 'border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/30'}`}>
            <div className="flex items-center w-full">
                <button onClick={() => onToggle(task.id)} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${isDone ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-600 hover:border-indigo-400'}`}>
                    {isDone && <Check size={16} strokeWidth={3} />}
                </button>
                <div className="ml-5 flex-grow min-w-0 cursor-pointer" onClick={() => onEdit(task)}>
                    <div className="flex items-center gap-2 flex-wrap">
                        {task.time && <span className="text-[10px] font-black bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800/50">{task.time}</span>}
                        <span className={`text-base font-bold tracking-tight truncate block min-w-[50px] ${isDone ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>{task.text}</span>
                        {isOverdue && <span className="text-[9px] px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-black uppercase tracking-tighter shrink-0">Late</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 overflow-x-auto no-scrollbar">
                        <span className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded-lg">
                            <span className={`w-2 h-2 rounded-full ${catStyle.dot}`}></span>
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{task.category}</span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-300 dark:text-slate-600 italic uppercase tracking-tighter px-1.5 py-0.5 rounded-lg">{displayType}</span>
                    </div>
                </div>
                <div className="flex items-center shrink-0">
                    <button onClick={() => onMoveTask(task.id)} className="flex items-center gap-2 text-slate-300 dark:text-slate-600 hover:text-indigo-500 transition-all px-3 py-2 rounded-2xl">
                        {moveDirection === 'forward' ? <ArrowRightCircle size={24} strokeWidth={2.5} /> : <ArrowLeftCircle size={24} strokeWidth={2.5} />}
                    </button>
                    <button onClick={() => onDelete(task.id)} className="p-3 text-slate-200 dark:text-slate-600 hover:text-red-500 transition-all rounded-2xl"><Trash2 size={24} strokeWidth={2} /></button>
                </div>
            </div>
        </div>
    );
};

export const EditTaskModal: React.FC<{ task: Task, onChange: (t: Task) => void, onClose: () => void, onDelete: (id: number) => void }> = ({ task, onChange, onClose, onDelete }) => {
    const [activePopover, setActivePopover] = useState<'none' | 'date' | 'time'>('none');
    const dateTriggerRef = useRef<HTMLDivElement>(null);
    const timeTriggerRef = useRef<HTMLDivElement>(null);

    const updateField = (field: keyof Task, value: any) => onChange({ ...task, [field]: value });

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-2xl animate-fade-in-up flex flex-col gap-4 max-h-[90vh] overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center shrink-0">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">{task.id < 0 ? 'New Task' : 'Edit Task'}</h3>
                    <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><X size={16} strokeWidth={3} /></button>
                </div>
                
                <input type="text" value={task.text} onChange={(e) => updateField('text', e.target.value)} autoFocus className="text-xl font-bold bg-transparent border-b-2 border-slate-100 dark:border-slate-800 pb-2 outline-none focus:border-indigo-500 dark:text-white transition-colors shrink-0" placeholder="Task name" />

                <div className="flex gap-2 shrink-0">
                    <div className="flex-1 min-w-[30%]">
                        <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Category</label>
                        <div className="relative">
                            <select value={task.category} onChange={(e) => updateField('category', e.target.value as Category)} className="w-full h-11 bg-slate-100 dark:bg-slate-800 rounded-xl px-2 text-sm font-bold appearance-none outline-none text-slate-700 dark:text-slate-200 border-r-[16px] border-transparent cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                {CATEGORIES.map((c: string) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                            </select>
                            <ChevronDown size={14} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="flex-1 min-w-[30%]">
                        <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Date</label>
                        <div ref={dateTriggerRef} onClick={() => setActivePopover(activePopover === 'date' ? 'none' : 'date')} className={`relative h-11 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer ${activePopover === 'date' ? 'ring-2 ring-indigo-500/20' : ''}`}>
                            <div className="flex items-center gap-1.5 pointer-events-none text-slate-900 dark:text-white">
                                <CalendarIcon size={14} strokeWidth={2.5} />
                                <span className="text-xs font-bold pt-0.5 truncate">{new Date(task.dateCreated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </div>
                        </div>
                        {activePopover === 'date' && <DatePickerPopover currentDate={task.dateCreated} onSelect={(d) => { updateField('dateCreated', d); setActivePopover('none'); }} onClose={() => setActivePopover('none')} triggerRef={dateTriggerRef} />}
                    </div>
                    <div className="flex-1 min-w-[30%]">
                        <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Time</label>
                        <div ref={timeTriggerRef} onClick={() => setActivePopover(activePopover === 'time' ? 'none' : 'time')} className={`relative h-11 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer ${activePopover === 'time' ? 'ring-2 ring-indigo-500/20' : ''}`}>
                            <div className={`flex items-center gap-1.5 pointer-events-none ${task.time ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                                <Clock size={14} strokeWidth={2.5} className={task.time ? 'text-indigo-600' : ''} />
                                <span className="text-xs font-bold pt-0.5">{task.time || 'Anytime'}</span>
                            </div>
                        </div>
                        {activePopover === 'time' && <TimePickerPopover currentTime={task.time} onSave={(t) => { updateField('time', t); setActivePopover('none'); }} onClose={() => setActivePopover('none')} triggerRef={timeTriggerRef} />}
                    </div>
                </div>

                <div className="shrink-0">
                     <label className="text-[9px] font-black uppercase text-slate-400 block mb-2">Recurrence</label>
                     <div className="flex gap-2">
                        {(['one-time', 'recurring', 'weekly'] as TaskType[]).map(t => (
                            <button key={t} onClick={() => updateField('type', t)} className={`flex-1 h-11 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center ${task.type === t ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                {t === 'one-time' ? 'Once' : (t === 'recurring' ? 'Daily' : 'Week')}
                            </button>
                        ))}
                     </div>
                     {task.type === 'weekly' && (
                        <div className="mt-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl flex items-center justify-between animate-fade-in">
                             <span className="text-[10px] font-bold text-slate-500">Day of Week</span>
                             <select value={task.weeklyDay ?? 1} onChange={(e) => updateField('weeklyDay', parseInt(e.target.value))} className="bg-transparent text-xs font-black text-indigo-600 outline-none cursor-pointer">
                                 {DAYS.map((day, i) => <option key={i} value={i}>{day}</option>)}
                             </select>
                        </div>
                     )}
                </div>

                <div className="flex-grow min-h-0">
                    <label className="text-[9px] font-black uppercase text-slate-400 block mb-2">Notes</label>
                    <textarea value={task.notes || ''} onChange={(e) => updateField('notes', e.target.value)} placeholder="Add details..." className="w-full h-full min-h-[100px] bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-sm font-medium outline-none resize-none dark:text-slate-300 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all" />
                </div>
                
                <div className="pt-2 border-t dark:border-slate-800 flex gap-3 shrink-0">
                    {task.id > 0 && <button onClick={() => { onDelete(task.id); onClose(); }} className="p-4 bg-red-50 text-red-500 rounded-xl flex-1 font-black text-xs uppercase hover:bg-red-100 transition-colors">Delete Task</button>}
                    <button onClick={onClose} className="p-4 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-xl flex-1 font-black text-xs uppercase shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all">{task.id > 0 ? 'Done' : 'Add Task'}</button>
                </div>
            </div>
        </div>
    )
}

const TaskList: React.FC<TaskListProps> = (props) => {
    if (props.tasks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 opacity-40 animate-fade-in">
                <div className="text-5xl mb-4 grayscale">🏔️</div>
                <p className="text-sm font-black uppercase tracking-widest text-slate-400 text-center">No Tasks Here</p>
                <p className="text-[10px] font-bold text-slate-300 mt-2">Enjoy the view!</p>
            </div>
        );
    }
    return (
        <div className="space-y-4 pb-32 animate-fade-in">
            {props.tasks.map(task => <TaskItem key={task.id} task={task} {...props} />)}
        </div>
    );
};

export default TaskList;
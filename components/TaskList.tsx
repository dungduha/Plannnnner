import React, { useRef, useState, useEffect } from 'react';
import { Task, Category, TaskType, CATEGORIES, TASK_TYPES, DAYS } from '../types';
import { Check, Trash2, ArrowRightCircle, ArrowLeftCircle, Clock, GripVertical, X } from 'lucide-react';
import { extractTimeFromText } from '../utils';

interface TaskListProps {
    tasks: Task[];
    contextDate: string;
    onToggle: (id: number) => void;
    onDelete: (id: number) => void;
    onMoveTask: (id: number) => void;
    onEdit: (task: Task) => void;
    // Legacy props kept for compatibility
    onUpdateText: any; onUpdateTime: any; onCycleCategory: any; onCycleType: any; onUpdateWeeklyDay: any; onUpdateNotes: any; onUpdateCategory: any; onUpdateType: any; onReorder: any;
    moveDirection: 'forward' | 'backward';
}

const CATEGORY_STYLES = {
    work: { dot: 'bg-blue-500' },
    personal: { dot: 'bg-purple-500' },
    health: { dot: 'bg-emerald-500' },
    other: { dot: 'bg-slate-500' }
};

const TaskItem = ({ task, contextDate, onToggle, onDelete, onMoveTask, onEdit, moveDirection }: any) => {
    // Determine completion based on context or generally if it's a one-time task completed on its date
    const isDone = task.completions.includes(contextDate); 
    const isOverdue = task.type === 'one-time' && task.dateCreated < contextDate && !isDone && contextDate === new Date().toISOString().split('T')[0];
    const catStyle = CATEGORY_STYLES[task.category as keyof typeof CATEGORY_STYLES] || CATEGORY_STYLES.other;

    return (
        <div 
            className={`group flex flex-col bg-white dark:bg-slate-800 p-5 rounded-3xl border-2 transition-all duration-300 relative ${
                isDone 
                    ? 'border-slate-50 dark:border-slate-900 opacity-50 scale-[0.98]' 
                    : 'border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/30'
            }`}
        >
            <div className="flex items-center w-full">
                {/* Checkbox / Toggle */}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        // Trigger simple vibration if available
                        if (navigator.vibrate) navigator.vibrate(10);
                        onToggle(task.id);
                    }}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 shrink-0 ${
                        isDone 
                        ? 'bg-indigo-600 border-indigo-600 text-white rotate-0' 
                        : 'border-slate-200 dark:border-slate-600 hover:border-indigo-400 rotate-0'
                    }`}
                >
                    <div className={`transition-transform duration-300 ${isDone ? 'scale-100' : 'scale-0'}`}>
                        <Check size={16} strokeWidth={3} />
                    </div>
                </button>
                
                <div className="ml-5 flex-grow min-w-0 cursor-pointer" onClick={() => onEdit(task)}>
                    <div className="flex items-center gap-2 flex-wrap">
                        {task.time && (
                            <span className="text-[10px] font-black bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800/50 flex items-center gap-1">
                                <Clock size={10} /> {task.time}
                            </span>
                        )}
                        <span className={`text-base font-bold tracking-tight truncate block min-w-[50px] transition-all duration-300 ${isDone ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                            {task.text}
                        </span>
                        {isOverdue && <span className="text-[9px] px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-black uppercase tracking-tighter shrink-0 animate-pulse">Late</span>}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1.5 overflow-x-auto no-scrollbar">
                        <span className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded-lg">
                            <span className={`w-2 h-2 rounded-full ${catStyle.dot}`}></span>
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{task.category}</span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-300 dark:text-slate-600 italic uppercase tracking-tighter px-1.5 py-0.5 rounded-lg">
                            {task.type === 'one-time' ? 'One-off' : (task.type === 'recurring' ? 'Daily' : 'Weekly')}
                        </span>
                    </div>
                </div>

                <div className="flex items-center shrink-0 ml-2">
                    <button onClick={() => onMoveTask(task.id)} className="p-2 text-slate-300 dark:text-slate-600 hover:text-indigo-500 transition-colors">
                        {moveDirection === 'forward' ? <ArrowRightCircle size={22} /> : <ArrowLeftCircle size={22} />}
                    </button>
                    <button onClick={() => onDelete(task.id)} className="p-2 text-slate-200 dark:text-slate-600 hover:text-red-500 transition-colors">
                        <Trash2 size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const TaskList: React.FC<TaskListProps> = (props) => {
    // We removed SortableJS initialization to enforce strict date sorting
    
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
            {props.tasks.map(task => (
                <TaskItem key={task.id} task={task} {...props} />
            ))}
        </div>
    );
};

export interface EditTaskModalProps {
    task: Task;
    onChange: (task: Task) => void;
    onClose: () => void;
    onDelete: (id: number) => void;
}

export const EditTaskModal: React.FC<EditTaskModalProps> = ({ task, onChange, onClose, onDelete }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
    }, []);

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        const { text, time } = extractTimeFromText(newVal);
        
        if (time && !task.time) {
             onChange({ ...task, text: text, time: time });
        } else {
             onChange({ ...task, text: newVal });
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-6 animate-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border-t sm:border border-slate-100 dark:border-slate-800 animate-slide-up">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black italic text-slate-900 dark:text-white">Edit Task</h3>
                    <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200">
                        <X size={20} />
                    </button>
                </div>

                {/* Text Input */}
                <input
                    ref={inputRef}
                    type="text"
                    value={task.text}
                    onChange={handleTextChange}
                    placeholder="Task description..."
                    className="w-full text-lg font-bold bg-transparent border-b-2 border-slate-200 dark:border-slate-700 py-2 mb-6 focus:outline-none focus:border-indigo-500 placeholder:text-slate-300 dark:text-white"
                />

                {/* Time Input */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-500">
                        <Clock size={20} />
                    </div>
                    <div className="flex-grow">
                         <label className="text-[10px] font-black uppercase text-slate-400">Time (Optional)</label>
                         <input 
                            type="time" 
                            value={task.time || ''} 
                            onChange={(e) => onChange({...task, time: e.target.value})}
                            className="w-full bg-transparent font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
                         />
                    </div>
                </div>

                {/* Type Selection */}
                <div className="mb-6">
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Frequency</label>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {TASK_TYPES.map(type => (
                            <button
                                key={type}
                                onClick={() => onChange({...task, type: type as TaskType})}
                                className={`px-4 py-2 rounded-xl text-xs font-bold capitalize whitespace-nowrap transition-colors border ${
                                    task.type === type 
                                    ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900' 
                                    : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                                }`}
                            >
                                {type === 'one-time' ? 'One Time' : type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Weekly Day Selector */}
                {task.type === 'weekly' && (
                    <div className="mb-6 animate-fade-in">
                        <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Repeat On</label>
                        <div className="flex justify-between gap-1">
                            {DAYS.map((d, i) => (
                                <button
                                    key={d}
                                    onClick={() => onChange({...task, weeklyDay: i})}
                                    className={`w-full aspect-square rounded-lg flex items-center justify-center text-[10px] font-black border transition-colors ${
                                        task.weeklyDay === i
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    {d[0]}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Category Selection */}
                <div className="mb-8">
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Category</label>
                    <div className="flex gap-3">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => onChange({...task, category: cat as Category})}
                                className={`flex-1 py-3 rounded-xl flex items-center justify-center border transition-all ${
                                    task.category === cat
                                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-600 shadow-sm'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 grayscale opacity-60 hover:opacity-100'
                                }`}
                            >
                                <div className={`w-3 h-3 rounded-full mr-2 ${
                                    cat === 'work' ? 'bg-blue-500' : 
                                    cat === 'personal' ? 'bg-purple-500' : 
                                    cat === 'health' ? 'bg-emerald-500' : 'bg-slate-500'
                                }`}></div>
                                <span className="text-xs font-bold capitalize">{cat}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    {task.id > 0 && (
                        <button 
                            onClick={() => { onDelete(task.id); onClose(); }}
                            className="px-6 py-4 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl font-bold hover:bg-red-100 transition-colors"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                    <button 
                        onClick={onClose}
                        className="flex-grow py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        {task.id < 0 ? 'Create Task' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TaskList;
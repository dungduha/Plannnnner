import React, { useState, useRef, useEffect } from 'react';
import { Category, Task, TaskType, DAYS, CATEGORIES } from '../types';
import { extractTimeFromText } from '../utils';
import { Plus, Clock, X, ChevronDown } from 'lucide-react';

interface AddTaskProps {
    onAdd: (task: Omit<Task, 'id' | 'dateCreated' | 'completions' | 'hiddenDates'>) => void;
}

const AddTask: React.FC<AddTaskProps> = ({ onAdd }) => {
    const [text, setText] = useState('');
    const [type, setType] = useState<TaskType>('one-time');
    const [category, setCategory] = useState<Category>('personal');
    const [weeklyDay, setWeeklyDay] = useState<number>(1);
    
    // Time state
    const [time, setTime] = useState<string>('');
    const [showTimePicker, setShowTimePicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);
    
    // Refs for Native Wheel Listeners
    const hourRef = useRef<HTMLDivElement>(null);
    const minuteRef = useRef<HTMLDivElement>(null);
    const categoryRef = useRef<HTMLDivElement>(null);

    // Helpers to generate time options
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    // Changed to 1-minute granularity (0-59)
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setShowTimePicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!text.trim()) return;

        // Extract time from text if no time is manually selected
        let finalText = text.trim();
        let finalTime = time;

        // Only try extraction if time isn't explicitly set by the picker
        if (!finalTime) {
            const result = extractTimeFromText(finalText);
            if (result.time) {
                finalTime = result.time;
                finalText = result.text;
            }
        }

        // If extraction resulted in empty text (e.g. user just typed "2pm"), restore original
        if (!finalText) {
            finalText = text.trim();
        }

        onAdd({
            text: finalText,
            type,
            category,
            weeklyDay: type === 'weekly' ? weeklyDay : undefined,
            time: finalTime || undefined
        });

        setText('');
        setTime('');
        setShowTimePicker(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleTimeSelect = (h: string, m: string) => {
        setTime(`${h}:${m}`);
    };
    
    const getCurrentHour = () => time ? time.split(':')[0] : '09';
    const getCurrentMinute = () => time ? time.split(':')[1] : '00';

    // Native Listeners for Time Picker
    useEffect(() => {
        if (!showTimePicker) return;

        const createHandler = (mode: 'hour' | 'minute') => (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const delta = Math.sign(e.deltaY);
            const currentH = parseInt(getCurrentHour(), 10);
            const currentM = parseInt(getCurrentMinute(), 10);

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

        const hourHandler = createHandler('hour');
        const minuteHandler = createHandler('minute');
        
        const hEl = hourRef.current;
        const mEl = minuteRef.current;

        if (hEl) hEl.addEventListener('wheel', hourHandler, { passive: false });
        if (mEl) mEl.addEventListener('wheel', minuteHandler, { passive: false });

        return () => {
            if (hEl) hEl.removeEventListener('wheel', hourHandler);
            if (mEl) mEl.removeEventListener('wheel', minuteHandler);
        };
    }, [showTimePicker, time]); // Re-bind when time changes to catch closure values or logic

    // Native Listener for Category
    useEffect(() => {
        const catEl = categoryRef.current;
        if (!catEl) return;

        const handler = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            const delta = Math.sign(e.deltaY);
            const currentIndex = CATEGORIES.indexOf(category);
            let newIndex;
            
            if (delta > 0) { // Scroll down -> next
                newIndex = (currentIndex + 1) % CATEGORIES.length;
            } else { // Scroll up -> prev
                newIndex = (currentIndex - 1 + CATEGORIES.length) % CATEGORIES.length;
            }
            setCategory(CATEGORIES[newIndex]);
        };

        catEl.addEventListener('wheel', handler, { passive: false });
        return () => catEl.removeEventListener('wheel', handler);
    }, [category]);

    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] shadow-xl border dark:border-slate-800 mb-8 transition-colors duration-300 relative z-20">
            <div className="relative mb-4">
                <input 
                    type="text" 
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={100}
                    placeholder="What's the next win?"
                    className="w-full bg-slate-50 dark:bg-slate-800 rounded-2xl pl-6 pr-24 py-4 text-lg font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all"
                />
                
                {/* Time Trigger Icon */}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {time && (
                        <button 
                            onClick={() => { setTime(''); }}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                        >
                            <X size={14} strokeWidth={3} />
                        </button>
                    )}
                    <button 
                        onClick={() => setShowTimePicker(!showTimePicker)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                            time 
                                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600' 
                                : 'bg-slate-200 dark:bg-slate-700/50 text-slate-400 hover:text-indigo-500'
                        }`}
                    >
                        {time ? (
                            <span className="text-xs font-black tracking-widest font-mono">{time}</span>
                        ) : (
                            <Clock size={20} strokeWidth={2.5} />
                        )}
                    </button>
                </div>

                {/* Custom Time Picker Popover */}
                {showTimePicker && (
                    <div ref={pickerRef} className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border dark:border-slate-700 p-4 w-64 z-50 animate-fade-in-up">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Set Time (24H)</span>
                        </div>
                        <div className="flex gap-2 items-center justify-center">
                            <div 
                                ref={hourRef}
                                className="flex flex-col gap-1 w-full"
                            >
                                <label className="text-[9px] font-bold text-slate-400 text-center uppercase">Hour</label>
                                <select 
                                    value={getCurrentHour()}
                                    onChange={(e) => handleTimeSelect(e.target.value, getCurrentMinute())}
                                    className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white text-lg font-bold p-2 rounded-xl outline-none border-2 border-transparent focus:border-indigo-500 text-center appearance-none"
                                >
                                    {hours.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </div>
                            <span className="text-2xl font-black text-slate-300 -mb-5">:</span>
                            <div 
                                ref={minuteRef}
                                className="flex flex-col gap-1 w-full"
                            >
                                <label className="text-[9px] font-bold text-slate-400 text-center uppercase">Min</label>
                                <select 
                                    value={getCurrentMinute()}
                                    onChange={(e) => handleTimeSelect(getCurrentHour(), e.target.value)}
                                    className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white text-lg font-bold p-2 rounded-xl outline-none border-2 border-transparent focus:border-indigo-500 text-center appearance-none"
                                >
                                    {minutes.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                if (!time) setTime('09:00'); // Default if nothing selected yet but clicked done
                                setShowTimePicker(false);
                            }}
                            className="w-full mt-4 bg-indigo-600 text-white py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                )}
            </div>
            
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 sm:gap-2 flex-wrap">
                    <div className="flex-grow flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 overflow-hidden min-w-[150px]">
                        {(['one-time', 'recurring', 'weekly'] as TaskType[]).map((t) => (
                            <button
                                key={t}
                                onClick={() => setType(t)}
                                className={`flex-1 text-[9px] font-black uppercase py-3.5 sm:py-2.5 rounded-lg transition-all ${
                                    type === t 
                                    ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                }`}
                            >
                                {t === 'one-time' ? 'Once' : (t === 'recurring' ? 'Daily' : 'Week')}
                            </button>
                        ))}
                    </div>
                    
                    {/* Custom Select with fixed arrow position */}
                    <div 
                        ref={categoryRef}
                        className="relative"
                    >
                        <select 
                            value={category}
                            onChange={(e) => setCategory(e.target.value as Category)}
                            className="text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 rounded-xl pl-4 pr-10 py-4 sm:py-3 outline-none text-slate-500 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors appearance-none"
                        >
                            <option value="personal">Personal</option>
                            <option value="work">Work</option>
                            <option value="health">Health</option>
                            <option value="other">Other</option>
                        </select>
                        <ChevronDown size={14} strokeWidth={3} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>

                    <button 
                        onClick={() => handleSubmit()}
                        className="bg-indigo-600 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform hover:bg-indigo-700 shrink-0
                        w-full sm:w-[50px]
                        h-[60px] sm:h-[42px]
                        rounded-2xl sm:rounded-xl"
                    >
                        <Plus className="w-8 h-8 sm:w-5 sm:h-5" strokeWidth={3} />
                    </button>
                </div>

                {type === 'weekly' && (
                    <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/10 p-3 rounded-xl animate-fade-in">
                        <span className="text-[9px] font-black uppercase text-indigo-600">Repeat Every:</span>
                        <select 
                            value={weeklyDay}
                            onChange={(e) => setWeeklyDay(Number(e.target.value))}
                            className="bg-white dark:bg-slate-800 text-[10px] font-bold rounded-lg px-3 py-1 outline-none cursor-pointer text-slate-700 dark:text-slate-300"
                        >
                            {DAYS.map((day, i) => (
                                <option key={i} value={i}>{day[0]}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AddTask;
import React, { useState, useEffect } from 'react';
import { getLocalISO, parseLocalDate } from '../utils';
import { MONTHS } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    selectedDate: string;
    onSelectDate: (date: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, selectedDate, onSelectDate }) => {
    const [baseDate, setBaseDate] = useState<Date>(new Date());

    useEffect(() => {
        setBaseDate(parseLocalDate(selectedDate));
    }, [selectedDate, isOpen]);

    const changeMonth = (offset: number) => {
        const newDate = new Date(baseDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setBaseDate(newDate);
    };

    const renderCalendar = () => {
        const year = baseDate.getFullYear();
        const month = baseDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const todayStr = getLocalISO();
        
        const days = [];
        // Empty slots for start of month
        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push(<div key={`empty-${i}`} />);
        }

        for (let d = 1; d <= lastDay.getDate(); d++) {
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isSelected = ds === selectedDate;
            const isToday = ds === todayStr;
            
            days.push(
                <button 
                    key={ds}
                    onClick={() => {
                        onSelectDate(ds);
                        onClose();
                    }}
                    className={`aspect-square flex items-center justify-center rounded-xl text-sm font-bold transition-all 
                        ${isSelected 
                            ? 'bg-indigo-600 text-white shadow-lg' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                        } 
                        ${isToday && !isSelected ? 'text-indigo-600 ring-1 ring-indigo-100 dark:ring-indigo-900' : ''}`}
                >
                    {d}
                </button>
            );
        }
        return days;
    };

    return (
        <>
            <div 
                onClick={onClose} 
                className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            ></div>

            <aside 
                className={`fixed top-0 left-0 bottom-0 w-80 bg-white dark:bg-slate-900 z-[70] border-r border-slate-100 dark:border-slate-800 transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="p-8 border-b dark:border-slate-800">
                    <h2 className="text-2xl font-black italic">Calendar</h2>
                    <div className="flex items-center justify-between mt-6 bg-slate-50 dark:bg-slate-800 p-2 rounded-2xl">
                        <button onClick={() => changeMonth(-1)} className="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-500">
                            <ChevronLeft size={20} strokeWidth={3} />
                        </button>
                        <span className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
                            {MONTHS[baseDate.getMonth()]} {baseDate.getFullYear()}
                        </span>
                        <button onClick={() => changeMonth(1)} className="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-500">
                            <ChevronRight size={20} strokeWidth={3} />
                        </button>
                    </div>
                </div>
                <div className="flex-grow p-6">
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['S','M','T','W','T','F','S'].map(d => (
                            <div key={d} className="text-center text-[10px] font-black text-slate-300 dark:text-slate-500 uppercase py-2">
                                {d}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 content-start">
                        {renderCalendar()}
                    </div>
                </div>
                <div className="p-6 border-t dark:border-slate-800">
                    <button 
                        onClick={() => {
                            onSelectDate(getLocalISO());
                            onClose();
                        }}
                        className="w-full py-3 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl text-[10px] font-black uppercase text-slate-500 hover:text-indigo-600 transition-colors"
                    >
                        Go to Today
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
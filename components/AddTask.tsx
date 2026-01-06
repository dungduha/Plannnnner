import React from 'react';
import { Plus } from 'lucide-react';

interface AddTaskProps {
    onTrigger: () => void;
}

const AddTask: React.FC<AddTaskProps> = ({ onTrigger }) => {
    return (
        <div 
            onClick={onTrigger}
            className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] shadow-xl border dark:border-slate-800 mb-8 transition-colors duration-300 cursor-pointer group hover:border-indigo-200 dark:hover:border-indigo-900/50"
        >
            <div className="relative flex items-center gap-4">
                <div className="w-full bg-slate-50 dark:bg-slate-800 rounded-2xl px-6 py-4 text-base sm:text-lg font-bold text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors">
                    What's the next win?
                </div>
                
                <button 
                    className="bg-indigo-600 text-white shadow-lg flex items-center justify-center transition-transform group-hover:scale-105 shrink-0
                    w-[50px] h-[50px] rounded-2xl"
                >
                    <Plus className="w-6 h-6" strokeWidth={3} />
                </button>
            </div>
        </div>
    );
};

export default AddTask;
import React from 'react';
import { getLocalISO, shouldShowTask as checkShowTask } from '../utils';
import { Task as TaskType } from '../types';
import { Trophy, Flame, Zap } from 'lucide-react';

interface HistoryProps {
    tasks: TaskType[];
    onDrillDown: (date: string) => void;
    drillDownDate: string | null;
}

const History: React.FC<HistoryProps> = ({ tasks, onDrillDown, drillDownDate }) => {
    
    // --- Calculations ---
    const totalWins = tasks.reduce((acc, t) => acc + (t.completions?.length || 0), 0);
    
    // Leveling System: 1 Level per 10 tasks
    const xp = totalWins;
    const level = Math.floor(xp / 10) + 1;
    const nextLevelXp = level * 10;
    const currentLevelXp = (level - 1) * 10;
    const progress = Math.min(100, Math.max(0, ((xp - currentLevelXp) / 10) * 100));

    // Streak Calculation
    const calculateStreak = () => {
        const uniqueDates = new Set<string>();
        tasks.forEach(t => t.completions.forEach(c => uniqueDates.add(c)));
        const sortedDates = Array.from(uniqueDates).sort().reverse();
        
        let streak = 0;
        const today = getLocalISO();
        
        // If no completions ever
        if (sortedDates.length === 0) return 0;

        // Check if today or yesterday has a completion to keep streak alive
        const todayDate = new Date();
        const yesterdayDate = new Date();
        yesterdayDate.setDate(todayDate.getDate() - 1);
        const yesterdayStr = getLocalISO(yesterdayDate);

        // If neither today nor yesterday has completions, streak is 0 (broken)
        if (!uniqueDates.has(today) && !uniqueDates.has(yesterdayStr)) {
            return 0;
        }

        // iterate backwards to count streak
        // Start checking from today (if done) or yesterday
        let checkDate = new Date();
        // If today is not done, we start counting from yesterday
        if (!uniqueDates.has(today)) {
             checkDate.setDate(checkDate.getDate() - 1);
        }

        while (true) {
            const dateStr = getLocalISO(checkDate);
            if (uniqueDates.has(dateStr)) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        return streak;
    };

    const currentStreak = calculateStreak();

    // Heatmap Render
    const renderHeatmap = () => {
        const today = new Date();
        const cells = [];
        
        for (let i = 27; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const ds = getLocalISO(d);
            
            // Filter tasks for that day
            const dayTasks = tasks.filter(t => checkShowTask(t, ds));
            const completedCount = dayTasks.filter(t => t.completions.includes(ds)).length;
            const pct = dayTasks.length ? Math.round((completedCount / dayTasks.length) * 100) : 0;
            
            // Determine level
            let level = 0;
            if (pct >= 100) level = 4;
            else if (pct > 60) level = 3;
            else if (pct > 30) level = 2;
            else if (pct > 0) level = 1;

            cells.push(
                <button 
                    key={ds}
                    onClick={() => onDrillDown(ds)}
                    className={`aspect-square rounded-lg flex items-center justify-center text-[9px] font-black border-2 border-white dark:border-slate-800 transition-transform active:scale-90 lv-${level}`}
                >
                    {pct > 0 ? `${pct}%` : ''}
                </button>
            );
        }
        return cells;
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Heatmap Card */}
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 text-center">30-Day Consistency</h3>
                <div className="grid grid-cols-7 gap-3">
                    {renderHeatmap()}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Level / XP Card */}
                <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-lg shadow-indigo-200 dark:shadow-none relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Trophy size={80} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                            <Trophy size={16} className="text-indigo-200" />
                            <span className="text-[10px] font-black uppercase text-indigo-200">Current Rank</span>
                        </div>
                        <h4 className="text-4xl font-black mb-4">Level {level}</h4>
                        
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold uppercase opacity-80">
                                <span>XP: {xp}</span>
                                <span>Next: {nextLevelXp}</span>
                            </div>
                            <div className="h-2 bg-indigo-900/30 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-white rounded-full transition-all duration-1000 ease-out" 
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Streak Card */}
                <div className="bg-orange-500 p-6 rounded-[2rem] text-white shadow-lg shadow-orange-200 dark:shadow-none relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Flame size={80} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                            <Flame size={16} className="text-orange-100" />
                            <span className="text-[10px] font-black uppercase text-orange-100">Daily Streak</span>
                        </div>
                        <h4 className="text-4xl font-black mb-2">{currentStreak} <span className="text-lg opacity-60">Days</span></h4>
                        <p className="text-xs font-bold text-orange-100 opacity-80 leading-tight">
                            {currentStreak > 3 ? "You're on fire! Keep the momentum going." : "Consistency is key. Do one task today!"}
                        </p>
                    </div>
                </div>
            </div>
            
            {/* Quick Tip */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 flex items-start gap-4">
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 rounded-2xl shrink-0">
                    <Zap size={20} strokeWidth={2.5} />
                </div>
                <div>
                    <h5 className="text-sm font-black text-slate-800 dark:text-white mb-1">Pro Tip</h5>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                        To maintain your streak, complete at least one task every single day. Even small wins compound over time!
                    </p>
                </div>
            </div>

        </div>
    );
};

export default History;
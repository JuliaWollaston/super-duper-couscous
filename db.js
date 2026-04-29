class PomodoroDB {
    constructor() {
        this.db = null;
        this.init();
    }
    
    async init() {
        this.db = await this.openDatabase();
        await this.createTables();
    }
    
    async openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('PomodoroDB', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('settings')) {
                    const settingsStore = db.createObjectStore('settings', { keyPath: 'id' });
                    settingsStore.createIndex('id', 'id', { unique: true });
                }
                
                if (!db.objectStoreNames.contains('pomodoros')) {
                    const pomodorosStore = db.createObjectStore('pomodoros', { keyPath: 'id', autoIncrement: true });
                    pomodorosStore.createIndex('task_id', 'task_id');
                    pomodorosStore.createIndex('type', 'type');
                    pomodorosStore.createIndex('started_at', 'started_at');
                }
                
                if (!db.objectStoreNames.contains('tasks')) {
                    const tasksStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                    tasksStore.createIndex('status', 'status');
                    tasksStore.createIndex('created_at', 'created_at');
                }
                
                if (!db.objectStoreNames.contains('daily_stats')) {
                    const statsStore = db.createObjectStore('daily_stats', { keyPath: 'date' });
                    statsStore.createIndex('date', 'date', { unique: true });
                }
            };
        });
    }
    
    async createTables() {
        const defaultSettings = await this.getSettings();
        if (!defaultSettings) {
            await this.saveSettings({
                id: 1,
                work_duration: 25,
                break_duration: 5,
                long_break_duration: 15,
                pomodoros_before_long_break: 4,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }
    }
    
    async getSettings() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(1);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async saveSettings(settings) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({
                ...settings,
                updated_at: new Date().toISOString()
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async addPomodoro(pomodoro) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pomodoros', 'daily_stats'], 'readwrite');
            const pomodorosStore = transaction.objectStore('pomodoros');
            const statsStore = transaction.objectStore('daily_stats');
            
            const newPomodoro = {
                ...pomodoro,
                started_at: pomodoro.started_at || new Date().toISOString(),
                ended_at: pomodoro.ended_at || new Date().toISOString()
            };
            
            const pomodoroRequest = pomodorosStore.add(newPomodoro);
            
            pomodoroRequest.onsuccess = async () => {
                const today = new Date().toISOString().split('T')[0];
                const statsRequest = statsStore.get(today);
                
                statsRequest.onsuccess = () => {
                    const existingStats = statsRequest.result;
                    let stats;
                    
                    if (existingStats) {
                        stats = {
                            ...existingStats,
                            total_pomodoros: existingStats.total_pomodoros + (pomodoro.type === 'work' ? 1 : 0),
                            work_minutes: existingStats.work_minutes + (pomodoro.type === 'work' ? Math.floor(pomodoro.duration / 60) : 0),
                            break_minutes: existingStats.break_minutes + (pomodoro.type !== 'work' ? Math.floor(pomodoro.duration / 60) : 0)
                        };
                    } else {
                        stats = {
                            date: today,
                            total_pomodoros: pomodoro.type === 'work' ? 1 : 0,
                            work_minutes: pomodoro.type === 'work' ? Math.floor(pomodoro.duration / 60) : 0,
                            break_minutes: pomodoro.type !== 'work' ? Math.floor(pomodoro.duration / 60) : 0
                        };
                    }
                    
                    statsStore.put(stats);
                    resolve(pomodoroRequest.result);
                };
            };
            
            pomodoroRequest.onerror = () => reject(pomodoroRequest.error);
        });
    }
    
    async getPomodoros(filters = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pomodoros'], 'readonly');
            const store = transaction.objectStore('pomodoros');
            const request = store.getAll();
            
            request.onsuccess = () => {
                let result = request.result || [];
                
                if (filters.start_date) {
                    result = result.filter(p => p.started_at >= filters.start_date);
                }
                if (filters.end_date) {
                    result = result.filter(p => p.started_at <= filters.end_date);
                }
                
                result.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
                resolve(result);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async addTask(task) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = store.add({
                ...task,
                status: task.status || 'pending',
                completed_pomodoros: task.completed_pomodoros || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getTasks(filters = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const request = store.getAll();
            
            request.onsuccess = () => {
                let result = request.result || [];
                
                if (filters.status) {
                    result = result.filter(t => t.status === filters.status);
                }
                
                result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                resolve(result);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async updateTask(task) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = store.put({
                ...task,
                updated_at: new Date().toISOString()
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async deleteTask(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks', 'pomodoros'], 'readwrite');
            const tasksStore = transaction.objectStore('tasks');
            const pomodorosStore = transaction.objectStore('pomodoros');
            
            pomodorosStore.openCursor().onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.task_id === taskId) {
                        cursor.delete();
                    }
                    cursor.continue();
                }
            };
            
            const request = tasksStore.delete(taskId);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getStats(period = 'today') {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['daily_stats'], 'readonly');
            const store = transaction.objectStore('daily_stats');
            const request = store.getAll();
            
            request.onsuccess = () => {
                const allStats = request.result || [];
                const today = new Date();
                
                let filteredStats = [];
                
                switch (period) {
                    case 'today':
                        const todayStr = today.toISOString().split('T')[0];
                        filteredStats = allStats.filter(s => s.date === todayStr);
                        break;
                    case 'week':
                        const weekAgo = new Date(today);
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        filteredStats = allStats.filter(s => s.date >= weekAgo.toISOString().split('T')[0]);
                        break;
                    case 'month':
                        const monthAgo = new Date(today);
                        monthAgo.setDate(monthAgo.getDate() - 30);
                        filteredStats = allStats.filter(s => s.date >= monthAgo.toISOString().split('T')[0]);
                        break;
                }
                
                const totals = filteredStats.reduce((acc, stats) => ({
                    total_pomodoros: acc.total_pomodoros + (stats.total_pomodoros || 0),
                    work_minutes: acc.work_minutes + (stats.work_minutes || 0),
                    break_minutes: acc.break_minutes + (stats.break_minutes || 0)
                }), { total_pomodoros: 0, work_minutes: 0, break_minutes: 0 });
                
                resolve(totals);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async getWeeklyStats() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['daily_stats'], 'readonly');
            const store = transaction.objectStore('daily_stats');
            const request = store.getAll();
            
            request.onsuccess = () => {
                const allStats = request.result || [];
                const today = new Date();
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                
                const weekDays = [];
                for (let i = 6; i >= 0; i--) {
                    const date = new Date(today);
                    date.setDate(date.getDate() - i);
                    weekDays.push(date.toISOString().split('T')[0]);
                }
                
                const result = weekDays.map(day => {
                    const stats = allStats.find(s => s.date === day);
                    return {
                        date: day,
                        total_pomodoros: stats ? stats.total_pomodoros : 0,
                        work_minutes: stats ? stats.work_minutes : 0
                    };
                });
                
                resolve(result);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
}
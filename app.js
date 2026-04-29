class PomodoroApp {
    constructor() {
        this.workDuration = 25;
        this.breakDuration = 5;
        this.longBreakDuration = 15;
        this.pomodorosBeforeLongBreak = 4;
        
        this.currentMinutes = this.workDuration;
        this.currentSeconds = 0;
        this.pomodoroCount = 0;
        this.isRunning = false;
        this.isBreak = false;
        this.isLongBreak = false;
        this.timer = null;
        this.startedAt = null;
        
        this.db = null;
        this.chart = null;
        
        this.initElements();
        this.bindEvents();
        this.initDatabase();
    }
    
    async initDatabase() {
        this.db = new PomodoroDB();
        await this.db.init().then(() => {
            this.loadSettings();
            this.loadTodayStats();
            this.loadTasks();
        }).catch(() => {
            console.log('IndexedDB not available, using defaults');
            this.updateDisplay();
        });
    }
    
    initElements() {
        this.minutesDisplay = document.getElementById('minutes');
        this.secondsDisplay = document.getElementById('seconds');
        this.timerLabel = document.getElementById('timer-label');
        this.timerCircle = document.querySelector('.timer-circle');
        this.startBtn = document.getElementById('start-btn');
        this.pauseBtn = document.getElementById('pause-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.pomodoroCountDisplay = document.getElementById('pomodoro-count');
        this.currentSessionDisplay = document.getElementById('current-session');
        
        this.workDurationInput = document.getElementById('work-duration');
        this.breakDurationInput = document.getElementById('break-duration');
        this.longBreakDurationInput = document.getElementById('long-break-duration');
        this.pomodorosBeforeLongBreakInput = document.getElementById('pomodoros-before-long-break');
        
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');
        
        this.addTaskBtn = document.getElementById('add-task-btn');
        this.taskList = document.getElementById('task-list');
        this.taskModal = document.getElementById('task-modal');
        this.modalTitle = document.getElementById('modal-title');
        this.taskForm = document.getElementById('task-form');
        this.taskIdInput = document.getElementById('task-id');
        this.taskTitleInput = document.getElementById('task-title');
        this.taskDescriptionInput = document.getElementById('task-description');
        this.taskTargetPomodorosInput = document.getElementById('task-target-pomodoros');
        this.cancelBtn = document.getElementById('cancel-btn');
        this.closeModalBtn = document.querySelector('.close');
        
        this.periodBtns = document.querySelectorAll('.period-btn');
        this.totalPomodorosDisplay = document.getElementById('total-pomodoros');
        this.workMinutesDisplay = document.getElementById('work-minutes');
        this.breakMinutesDisplay = document.getElementById('break-minutes');
        
        this.chartCanvas = document.getElementById('pomodoro-chart');
    }
    
    bindEvents() {
        this.startBtn.addEventListener('click', () => this.start());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.resetBtn.addEventListener('click', () => this.reset());
        
        this.workDurationInput.addEventListener('change', () => this.updateSettings());
        this.breakDurationInput.addEventListener('change', () => this.updateSettings());
        this.longBreakDurationInput.addEventListener('change', () => this.updateSettings());
        this.pomodorosBeforeLongBreakInput.addEventListener('change', () => this.updateSettings());
        
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        this.addTaskBtn.addEventListener('click', () => this.openTaskModal());
        this.closeModalBtn.addEventListener('click', () => this.closeTaskModal());
        this.cancelBtn.addEventListener('click', () => this.closeTaskModal());
        this.taskForm.addEventListener('submit', (e) => this.handleTaskSubmit(e));
        
        this.periodBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.loadStats(e.target.dataset.period));
        });
        
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        window.addEventListener('click', (e) => {
            if (e.target === this.taskModal) {
                this.closeTaskModal();
            }
        });
    }
    
    async loadSettings() {
        try {
            const settings = await this.db.getSettings();
            if (settings) {
                this.workDuration = settings.work_duration || 25;
                this.breakDuration = settings.break_duration || 5;
                this.longBreakDuration = settings.long_break_duration || 15;
                this.pomodorosBeforeLongBreak = settings.pomodoros_before_long_break || 4;
                
                this.workDurationInput.value = this.workDuration;
                this.breakDurationInput.value = this.breakDuration;
                this.longBreakDurationInput.value = this.longBreakDuration;
                this.pomodorosBeforeLongBreakInput.value = this.pomodorosBeforeLongBreak;
                
                this.currentMinutes = this.workDuration;
                this.currentSeconds = 0;
                this.updateDisplay();
            }
        } catch (error) {
            console.log('Failed to load settings');
        }
    }
    
    async loadTodayStats() {
        try {
            const stats = await this.db.getStats('today');
            this.pomodoroCount = stats.total_pomodoros || 0;
            this.pomodoroCountDisplay.textContent = this.pomodoroCount;
        } catch (error) {
            console.log('Failed to load stats');
        }
    }
    
    async saveSettingsToDB() {
        try {
            await this.db.saveSettings({
                id: 1,
                work_duration: this.workDuration,
                break_duration: this.breakDuration,
                long_break_duration: this.longBreakDuration,
                pomodoros_before_long_break: this.pomodorosBeforeLongBreak
            });
        } catch (error) {
            console.log('Failed to save settings');
        }
    }
    
    async savePomodoroToDB(type, duration) {
        try {
            await this.db.addPomodoro({
                type: type,
                duration: duration,
                completed: 1,
                started_at: this.startedAt,
                ended_at: new Date().toISOString()
            });
        } catch (error) {
            console.log('Failed to save pomodoro');
        }
    }
    
    updateSettings() {
        this.workDuration = parseInt(this.workDurationInput.value) || 25;
        this.breakDuration = parseInt(this.breakDurationInput.value) || 5;
        this.longBreakDuration = parseInt(this.longBreakDurationInput.value) || 15;
        this.pomodorosBeforeLongBreak = parseInt(this.pomodorosBeforeLongBreakInput.value) || 4;
        
        this.saveSettingsToDB();
        
        if (!this.isRunning && !this.isBreak && !this.isLongBreak) {
            this.currentMinutes = this.workDuration;
            this.currentSeconds = 0;
            this.updateDisplay();
        }
    }
    
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.startedAt = new Date().toISOString();
        this.timer = setInterval(() => this.tick(), 1000);
    }
    
    pause() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        clearInterval(this.timer);
        this.timer = null;
    }
    
    reset() {
        this.isRunning = false;
        this.isBreak = false;
        this.isLongBreak = false;
        clearInterval(this.timer);
        this.timer = null;
        this.startedAt = null;
        
        this.currentMinutes = this.workDuration;
        this.currentSeconds = 0;
        
        this.updateDisplay();
        this.updateTimerCircleClass();
    }
    
    tick() {
        if (this.currentSeconds === 0) {
            if (this.currentMinutes === 0) {
                this.completeSession();
                return;
            }
            this.currentMinutes--;
            this.currentSeconds = 59;
        } else {
            this.currentSeconds--;
        }
        
        this.updateDisplay();
    }
    
    completeSession() {
        clearInterval(this.timer);
        this.isRunning = false;
        
        const duration = this.isBreak ? this.breakDuration * 60 : 
                        this.isLongBreak ? this.longBreakDuration * 60 : 
                        this.workDuration * 60;
        const type = this.isBreak ? 'break' : this.isLongBreak ? 'long_break' : 'work';
        
        this.savePomodoroToDB(type, duration);
        
        if (this.isBreak || this.isLongBreak) {
            this.startWorkSession();
        } else {
            this.pomodoroCount++;
            this.pomodoroCountDisplay.textContent = this.pomodoroCount;
            
            if (this.pomodoroCount % this.pomodorosBeforeLongBreak === 0) {
                this.startLongBreakSession();
            } else {
                this.startBreakSession();
            }
        }
        
        this.playNotificationSound();
        this.showNotification();
        this.loadTodayStats();
        this.loadStats('today');
    }
    
    startWorkSession() {
        this.isBreak = false;
        this.isLongBreak = false;
        this.currentMinutes = this.workDuration;
        this.currentSeconds = 0;
        
        this.timerLabel.textContent = '专注时间';
        this.currentSessionDisplay.textContent = '工作';
        
        this.updateDisplay();
        this.updateTimerCircleClass();
    }
    
    startBreakSession() {
        this.isBreak = true;
        this.isLongBreak = false;
        this.currentMinutes = this.breakDuration;
        this.currentSeconds = 0;
        
        this.timerLabel.textContent = '休息时间';
        this.currentSessionDisplay.textContent = '休息';
        
        this.updateDisplay();
        this.updateTimerCircleClass();
    }
    
    startLongBreakSession() {
        this.isBreak = false;
        this.isLongBreak = true;
        this.currentMinutes = this.longBreakDuration;
        this.currentSeconds = 0;
        
        this.timerLabel.textContent = '长休息时间';
        this.currentSessionDisplay.textContent = '长休息';
        
        this.updateDisplay();
        this.updateTimerCircleClass();
    }
    
    updateDisplay() {
        this.minutesDisplay.textContent = this.formatTime(this.currentMinutes);
        this.secondsDisplay.textContent = this.formatTime(this.currentSeconds);
        this.pomodoroCountDisplay.textContent = this.pomodoroCount;
    }
    
    updateTimerCircleClass() {
        this.timerCircle.classList.remove('break', 'long-break');
        
        if (this.isBreak) {
            this.timerCircle.classList.add('break');
        } else if (this.isLongBreak) {
            this.timerCircle.classList.add('long-break');
        }
    }
    
    formatTime(time) {
        return time.toString().padStart(2, '0');
    }
    
    playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.log('Failed to play sound');
        }
    }
    
    showNotification() {
        if (!('Notification' in window)) return;
        
        if (Notification.permission === 'granted') {
            const title = this.isBreak || this.isLongBreak ? '休息结束！' : '番茄完成！';
            const body = this.isBreak || this.isLongBreak 
                ? '准备好继续工作了吗？' 
                : `已完成 ${this.pomodoroCount} 个番茄，休息一下吧！`;
            
            new Notification(title, { body, icon: null });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }
    
    handleKeydown(e) {
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                if (this.isRunning) {
                    this.pause();
                } else {
                    this.start();
                }
                break;
            case 'KeyR':
                this.reset();
                break;
            case 'KeyN':
                if (!this.taskModal.classList.contains('show')) {
                    this.openTaskModal();
                }
                break;
        }
    }
    
    switchTab(tab) {
        this.tabBtns.forEach(btn => btn.classList.remove('active'));
        this.tabContents.forEach(content => content.style.display = 'none');
        
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`${tab}-tab`).style.display = 'block';
        
        if (tab === 'stats') {
            this.loadStats('today');
        }
    }
    
    openTaskModal(task = null) {
        if (task) {
            this.modalTitle.textContent = '编辑任务';
            this.taskIdInput.value = task.id;
            this.taskTitleInput.value = task.title;
            this.taskDescriptionInput.value = task.description || '';
            this.taskTargetPomodorosInput.value = task.target_pomodoros || 1;
        } else {
            this.modalTitle.textContent = '添加任务';
            this.taskForm.reset();
            this.taskIdInput.value = '';
        }
        this.taskModal.classList.add('show');
    }
    
    closeTaskModal() {
        this.taskModal.classList.remove('show');
        this.taskForm.reset();
        this.taskIdInput.value = '';
    }
    
    async handleTaskSubmit(e) {
        e.preventDefault();
        
        const taskData = {
            title: this.taskTitleInput.value,
            description: this.taskDescriptionInput.value,
            target_pomodoros: parseInt(this.taskTargetPomodorosInput.value) || 1
        };
        
        if (this.taskIdInput.value) {
            taskData.id = parseInt(this.taskIdInput.value);
            await this.db.updateTask(taskData);
        } else {
            await this.db.addTask(taskData);
        }
        
        this.closeTaskModal();
        this.loadTasks();
    }
    
    async loadTasks() {
        try {
            const tasks = await this.db.getTasks();
            this.renderTasks(tasks);
        } catch (error) {
            console.log('Failed to load tasks');
        }
    }
    
    renderTasks(tasks) {
        if (tasks.length === 0) {
            this.taskList.innerHTML = '<div class="empty-state">暂无任务</div>';
            return;
        }
        
        this.taskList.innerHTML = tasks.map(task => {
            const progress = task.target_pomodoros > 0 
                ? (task.completed_pomodoros / task.target_pomodoros) * 100 
                : 0;
            
            return `
                <div class="task-item ${task.status === 'completed' ? 'completed' : ''}">
                    <div class="task-content">
                        <div class="task-title">${task.title}</div>
                        ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                        <div class="task-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress}%"></div>
                            </div>
                            <span class="progress-text">${task.completed_pomodoros}/${task.target_pomodoros}</span>
                        </div>
                    </div>
                    <div class="task-actions">
                        <button class="task-action-btn" onclick="app.editTask(${task.id})">✏️</button>
                        <button class="task-action-btn" onclick="app.deleteTask(${task.id})">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    async editTask(taskId) {
        try {
            const tasks = await this.db.getTasks();
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                this.openTaskModal(task);
            }
        } catch (error) {
            console.log('Failed to load task');
        }
    }
    
    async deleteTask(taskId) {
        if (confirm('确定要删除这个任务吗？')) {
            try {
                await this.db.deleteTask(taskId);
                this.loadTasks();
            } catch (error) {
                console.log('Failed to delete task');
            }
        }
    }
    
    async loadStats(period) {
        this.periodBtns.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-period="${period}"]`).classList.add('active');
        
        try {
            const stats = await this.db.getStats(period);
            this.totalPomodorosDisplay.textContent = stats.total_pomodoros || 0;
            this.workMinutesDisplay.textContent = stats.work_minutes || 0;
            this.breakMinutesDisplay.textContent = stats.break_minutes || 0;
            
            this.updateChart();
        } catch (error) {
            console.log('Failed to load stats');
        }
    }
    
    async updateChart() {
        try {
            const weeklyStats = await this.db.getWeeklyStats();
            
            const labels = weeklyStats.map(s => {
                const date = new Date(s.date);
                return `${date.getMonth() + 1}/${date.getDate()}`;
            });
            
            const data = weeklyStats.map(s => s.total_pomodoros);
            
            if (this.chart) {
                this.chart.destroy();
            }
            
            this.chart = new Chart(this.chartCanvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '番茄数量',
                        data: data,
                        backgroundColor: 'rgba(102, 126, 234, 0.7)',
                        borderColor: 'rgba(102, 126, 234, 1)',
                        borderWidth: 1,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.log('Failed to update chart');
        }
    }
    
    updateDisplay() {
        this.minutesDisplay.textContent = this.formatTime(this.currentMinutes);
        this.secondsDisplay.textContent = this.formatTime(this.currentSeconds);
        this.pomodoroCountDisplay.textContent = this.pomodoroCount;
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new PomodoroApp();
});
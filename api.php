<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$dbPath = dirname(__DIR__) . '/data/pomodoro.db';

function initDatabase() {
    global $dbPath;
    
    $db = new SQLite3($dbPath);
    
    $sql = <<<SQL
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_duration INTEGER NOT NULL DEFAULT 25,
    break_duration INTEGER NOT NULL DEFAULT 5,
    long_break_duration INTEGER NOT NULL DEFAULT 15,
    pomodoros_before_long_break INTEGER NOT NULL DEFAULT 4,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pomodoros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    type TEXT NOT NULL,
    duration INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 1,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    target_pomodoros INTEGER DEFAULT 1,
    completed_pomodoros INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    total_pomodoros INTEGER DEFAULT 0,
    work_minutes INTEGER DEFAULT 0,
    break_minutes INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO settings (id, work_duration, break_duration, long_break_duration, pomodoros_before_long_break) 
VALUES (1, 25, 5, 15, 4);
SQL;
    
    $db->exec($sql);
    return $db;
}

function getSettings($db) {
    $result = $db->query("SELECT * FROM settings WHERE id = 1");
    if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        return success($row);
    }
    return error('Settings not found');
}

function saveSettings($db, $data) {
    $workDuration = isset($data['work_duration']) ? (int)$data['work_duration'] : 25;
    $breakDuration = isset($data['break_duration']) ? (int)$data['break_duration'] : 5;
    $longBreakDuration = isset($data['long_break_duration']) ? (int)$data['long_break_duration'] : 15;
    $pomodorosBeforeLongBreak = isset($data['pomodoros_before_long_break']) ? (int)$data['pomodoros_before_long_break'] : 4;
    
    $stmt = $db->prepare("UPDATE settings SET work_duration = :work, break_duration = :break, long_break_duration = :long_break, pomodoros_before_long_break = :count, updated_at = CURRENT_TIMESTAMP WHERE id = 1");
    $stmt->bindValue(':work', $workDuration, SQLITE3_INTEGER);
    $stmt->bindValue(':break', $breakDuration, SQLITE3_INTEGER);
    $stmt->bindValue(':long_break', $longBreakDuration, SQLITE3_INTEGER);
    $stmt->bindValue(':count', $pomodorosBeforeLongBreak, SQLITE3_INTEGER);
    
    if ($stmt->execute()) {
        return success(['message' => 'Settings saved successfully']);
    }
    return error('Failed to save settings');
}

function addPomodoro($db, $data) {
    $taskId = isset($data['task_id']) ? (int)$data['task_id'] : null;
    $type = isset($data['type']) ? $data['type'] : 'work';
    $duration = isset($data['duration']) ? (int)$data['duration'] : 0;
    $completed = isset($data['completed']) ? (int)$data['completed'] : 1;
    $startedAt = isset($data['started_at']) ? $data['started_at'] : date('Y-m-d H:i:s');
    $endedAt = isset($data['ended_at']) ? $data['ended_at'] : null;
    
    $stmt = $db->prepare("INSERT INTO pomodoros (task_id, type, duration, completed, started_at, ended_at) VALUES (:task_id, :type, :duration, :completed, :started_at, :ended_at)");
    $stmt->bindValue(':task_id', $taskId, SQLITE3_INTEGER);
    $stmt->bindValue(':type', $type, SQLITE3_TEXT);
    $stmt->bindValue(':duration', $duration, SQLITE3_INTEGER);
    $stmt->bindValue(':completed', $completed, SQLITE3_INTEGER);
    $stmt->bindValue(':started_at', $startedAt, SQLITE3_TEXT);
    $stmt->bindValue(':ended_at', $endedAt, SQLITE3_TEXT);
    
    if ($stmt->execute()) {
        $id = $db->lastInsertRowID();
        
        updateDailyStats($db, $type, $duration);
        
        if ($taskId && $type === 'work') {
            updateTaskProgress($db, $taskId);
        }
        
        return success(['id' => $id, 'message' => 'Pomodoro added successfully']);
    }
    return error('Failed to add pomodoro');
}

function updateDailyStats($db, $type, $duration) {
    $date = date('Y-m-d');
    $minutes = (int)($duration / 60);
    
    $result = $db->query("SELECT * FROM daily_stats WHERE date = '$date'");
    
    if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        if ($type === 'work') {
            $db->exec("UPDATE daily_stats SET total_pomodoros = total_pomodoros + 1, work_minutes = work_minutes + $minutes WHERE date = '$date'");
        } else {
            $db->exec("UPDATE daily_stats SET break_minutes = break_minutes + $minutes WHERE date = '$date'");
        }
    } else {
        if ($type === 'work') {
            $db->exec("INSERT INTO daily_stats (date, total_pomodoros, work_minutes) VALUES ('$date', 1, $minutes)");
        } else {
            $db->exec("INSERT INTO daily_stats (date, break_minutes) VALUES ('$date', $minutes)");
        }
    }
}

function updateTaskProgress($db, $taskId) {
    $db->exec("UPDATE tasks SET completed_pomodoros = completed_pomodoros + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $taskId");
    
    $result = $db->query("SELECT target_pomodoros, completed_pomodoros FROM tasks WHERE id = $taskId");
    if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        if ($row['completed_pomodoros'] >= $row['target_pomodoros']) {
            $db->exec("UPDATE tasks SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $taskId");
        } else {
            $db->exec("UPDATE tasks SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = $taskId");
        }
    }
}

function getPomodoros($db, $params) {
    $startDate = isset($params['start_date']) ? $params['start_date'] : '';
    $endDate = isset($params['end_date']) ? $params['end_date'] : '';
    
    $query = "SELECT * FROM pomodoros";
    $conditions = [];
    
    if ($startDate) {
        $conditions[] = "started_at >= '$startDate'";
    }
    if ($endDate) {
        $conditions[] = "started_at <= '$endDate'";
    }
    
    if (!empty($conditions)) {
        $query .= " WHERE " . implode(' AND ', $conditions);
    }
    
    $query .= " ORDER BY started_at DESC";
    
    $result = $db->query($query);
    $pomodoros = [];
    
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $pomodoros[] = $row;
    }
    
    return success($pomodoros);
}

function addTask($db, $data) {
    $title = isset($data['title']) ? $data['title'] : '';
    $description = isset($data['description']) ? $data['description'] : '';
    $targetPomodoros = isset($data['target_pomodoros']) ? (int)$data['target_pomodoros'] : 1;
    
    if (empty($title)) {
        return error('Title is required');
    }
    
    $stmt = $db->prepare("INSERT INTO tasks (title, description, target_pomodoros) VALUES (:title, :description, :target)");
    $stmt->bindValue(':title', $title, SQLITE3_TEXT);
    $stmt->bindValue(':description', $description, SQLITE3_TEXT);
    $stmt->bindValue(':target', $targetPomodoros, SQLITE3_INTEGER);
    
    if ($stmt->execute()) {
        $id = $db->lastInsertRowID();
        return success(['id' => $id, 'message' => 'Task added successfully']);
    }
    return error('Failed to add task');
}

function getTasks($db, $params) {
    $status = isset($params['status']) ? $params['status'] : '';
    
    $query = "SELECT * FROM tasks";
    
    if ($status) {
        $query .= " WHERE status = '$status'";
    }
    
    $query .= " ORDER BY created_at DESC";
    
    $result = $db->query($query);
    $tasks = [];
    
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $tasks[] = $row;
    }
    
    return success($tasks);
}

function updateTask($db, $data) {
    $id = isset($data['id']) ? (int)$data['id'] : 0;
    $title = isset($data['title']) ? $data['title'] : '';
    $description = isset($data['description']) ? $data['description'] : '';
    $status = isset($data['status']) ? $data['status'] : '';
    
    if (!$id) {
        return error('Task ID is required');
    }
    
    $setParts = [];
    if ($title) {
        $setParts[] = "title = '$title'";
    }
    if ($description !== null) {
        $setParts[] = "description = '$description'";
    }
    if ($status) {
        $setParts[] = "status = '$status'";
    }
    $setParts[] = "updated_at = CURRENT_TIMESTAMP";
    
    if (empty($setParts)) {
        return error('No fields to update');
    }
    
    $query = "UPDATE tasks SET " . implode(', ', $setParts) . " WHERE id = $id";
    
    if ($db->exec($query)) {
        return success(['message' => 'Task updated successfully']);
    }
    return error('Failed to update task');
}

function deleteTask($db, $id) {
    if (!$id) {
        return error('Task ID is required');
    }
    
    $db->exec("DELETE FROM pomodoros WHERE task_id = $id");
    
    if ($db->exec("DELETE FROM tasks WHERE id = $id")) {
        return success(['message' => 'Task deleted successfully']);
    }
    return error('Failed to delete task');
}

function getStats($db, $params) {
    $period = isset($params['period']) ? $params['period'] : 'today';
    
    $today = date('Y-m-d');
    
    switch ($period) {
        case 'today':
            $result = $db->query("SELECT * FROM daily_stats WHERE date = '$today'");
            break;
        case 'week':
            $weekAgo = date('Y-m-d', strtotime('-7 days'));
            $result = $db->query("SELECT SUM(total_pomodoros) as total_pomodoros, SUM(work_minutes) as work_minutes, SUM(break_minutes) as break_minutes FROM daily_stats WHERE date >= '$weekAgo'");
            break;
        case 'month':
            $monthAgo = date('Y-m-d', strtotime('-30 days'));
            $result = $db->query("SELECT SUM(total_pomodoros) as total_pomodoros, SUM(work_minutes) as work_minutes, SUM(break_minutes) as break_minutes FROM daily_stats WHERE date >= '$monthAgo'");
            break;
        default:
            return error('Invalid period');
    }
    
    if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        return success($row);
    }
    return success(['total_pomodoros' => 0, 'work_minutes' => 0, 'break_minutes' => 0]);
}

function success($data) {
    return json_encode(['success' => true, 'data' => $data]);
}

function error($message) {
    return json_encode(['success' => false, 'error' => $message]);
}

$db = initDatabase();

$action = isset($_REQUEST['action']) ? $_REQUEST['action'] : '';

switch ($action) {
    case 'get_settings':
        echo getSettings($db);
        break;
    case 'save_settings':
        echo saveSettings($db, $_POST);
        break;
    case 'add_pomodoro':
        echo addPomodoro($db, $_POST);
        break;
    case 'get_pomodoros':
        echo getPomodoros($db, $_GET);
        break;
    case 'add_task':
        echo addTask($db, $_POST);
        break;
    case 'get_tasks':
        echo getTasks($db, $_GET);
        break;
    case 'update_task':
        echo updateTask($db, $_POST);
        break;
    case 'delete_task':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        echo deleteTask($db, $id);
        break;
    case 'get_stats':
        echo getStats($db, $_GET);
        break;
    default:
        echo error('Invalid action');
}

$db->close();
?>
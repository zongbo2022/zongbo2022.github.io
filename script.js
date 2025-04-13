// 设备状态和配置
let deviceStatus = {
    connected: false,
    currentWeight: 0,
    todayFed: 0,
    targetWeight: 0,
    feeding: false,
    schedules: [],
    history: []
};

// WebSocket连接
let socket;
const ESP8266_IP = "192.168.1.100"; // 替换为您的ESP8266 IP
const WEBSOCKET_PORT = 81;

// DOM元素
const elements = {
    currentWeight: document.getElementById('current-weight'),
    todayFed: document.getElementById('today-fed'),
    feedingProgress: document.getElementById('feeding-progress'),
    feedAmount: document.getElementById('feed-amount'),
    feedNowBtn: document.getElementById('feed-now-btn'),
    scheduleContainer: document.getElementById('schedule-container'),
    addScheduleBtn: document.getElementById('add-schedule-btn'),
    saveScheduleBtn: document.getElementById('save-schedule-btn'),
    feedingHistory: document.getElementById('feeding-history'),
    connectionStatus: document.getElementById('connection-status')
};

// 初始化WebSocket连接
function initWebSocket() {
    const wsUrl = `ws://${ESP8266_IP}:${WEBSOCKET_PORT}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = function(e) {
        console.log("WebSocket连接成功");
        updateConnectionStatus(true);
        sendCommand({ type: "get_status" });
    };

    socket.onmessage = function(event) {
        console.log("收到消息:", event.data);
        try {
            const data = JSON.parse(event.data);
            handleIncomingData(data);
        } catch (e) {
            console.error("解析消息错误:", e);
        }
    };

    socket.onclose = function(event) {
        console.log("WebSocket连接关闭");
        updateConnectionStatus(false);
        setTimeout(initWebSocket, 5000);
    };

    socket.onerror = function(error) {
        console.log("WebSocket错误:", error.message);
        updateConnectionStatus(false);
    };
}

// 更新连接状态显示
function updateConnectionStatus(connected) {
    deviceStatus.connected = connected;
    const indicator = elements.connectionStatus.querySelector('.status-indicator');
    const text = elements.connectionStatus.querySelector('span:last-child');
    
    if (connected) {
        indicator.classList.remove('offline');
        indicator.classList.add('online');
        text.textContent = '设备在线';
    } else {
        indicator.classList.remove('online');
        indicator.classList.add('offline');
        text.textContent = '设备离线';
    }
}

// 处理从ESP8266接收的数据
function handleIncomingData(data) {
    console.log("处理数据:", data);
    switch(data.type) {
        case "status_update":
            deviceStatus.currentWeight = data.currentWeight || 0;
            deviceStatus.todayFed = data.todayFed || 0;
            deviceStatus.feeding = data.feeding || false;
            deviceStatus.targetWeight = data.targetWeight || 0;
            updateRealTimeData();
            break;
            
        case "feeding_started":
            deviceStatus.feeding = true;
            deviceStatus.targetWeight = data.targetWeight || 0;
            addHistoryItem(new Date(), "手动喂食", 0, data.targetWeight);
            updateRealTimeData();
            break;
            
        case "feeding_progress":
            deviceStatus.currentWeight = data.currentWeight || 0;
            updateRealTimeData();
            break;
            
        case "feeding_completed":
            deviceStatus.feeding = false;
            deviceStatus.currentWeight = data.currentWeight || 0;
            deviceStatus.todayFed += data.amountFed || 0;
            updateHistoryItem(data.amountFed);
            updateRealTimeData();
            break;
            
        case "scheduled_feeding":
            addHistoryItem(new Date(), "定时喂食", data.amountFed || 0);
            deviceStatus.todayFed += data.amountFed || 0;
            updateRealTimeData();
            break;
            
        case "schedule_config":
            deviceStatus.schedules = data.schedules || [];
            renderScheduleSettings();
            break;
    }
}

// 更新实时数据显示
function updateRealTimeData() {
    elements.currentWeight.textContent = `${deviceStatus.currentWeight} g`;
    elements.todayFed.textContent = `${deviceStatus.todayFed} g`;
    
    if (deviceStatus.feeding) {
        const progress = Math.min(100, Math.round((deviceStatus.currentWeight / deviceStatus.targetWeight) * 100));
        elements.feedingProgress.style.width = `${progress}%`;
        elements.feedingProgress.textContent = `${progress}%`;
        elements.feedNowBtn.disabled = true;
        elements.feedNowBtn.textContent = "喂食中...";
    } else {
        elements.feedingProgress.style.width = "0%";
        elements.feedingProgress.textContent = "";
        elements.feedNowBtn.disabled = false;
        elements.feedNowBtn.textContent = "立即喂食";
    }
}

// 发送命令到ESP8266
function sendCommand(command) {
    if (deviceStatus.connected) {
        console.log("发送命令:", command);
        socket.send(JSON.stringify(command));
    } else {
        console.error("设备未连接，无法发送命令");
    }
}

// 添加新的定时喂食项
function addNewScheduleItem(time = "08:00", amount = 50, enabled = true) {
    const scheduleId = Date.now();
    
    const scheduleItem = document.createElement('div');
    scheduleItem.className = 'schedule-item mb-3 p-3 border rounded';
    scheduleItem.dataset.id = scheduleId;
    
    scheduleItem.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="form-check form-switch">
                <input class="form-check-input schedule-enabled" type="checkbox" 
                       id="schedule-enabled-${scheduleId}" ${enabled ? 'checked' : ''}>
                <label class="form-check-label" for="schedule-enabled-${scheduleId}">启用此定时</label>
            </div>
            <button class="btn btn-sm btn-outline-danger delete-schedule">
                <i class="bi bi-trash"></i> 删除
            </button>
        </div>
        <div class="row g-2">
            <div class="col-md-6">
                <label class="form-label">喂食时间</label>
                <input type="time" class="form-control schedule-time" value="${time}">
            </div>
            <div class="col-md-6">
                <label class="form-label">喂食量 (克)</label>
                <input type="number" class="form-control schedule-amount" 
                       value="${amount}" min="10" max="200">
            </div>
        </div>
    `;
    
    elements.scheduleContainer.appendChild(scheduleItem);
    
    // 添加删除按钮事件
    scheduleItem.querySelector('.delete-schedule').addEventListener('click', function() {
        console.log("删除定时:", scheduleId);
        scheduleItem.remove();
    });
    
    return scheduleId;
}

// 渲染所有定时设置
function renderScheduleSettings() {
    console.log("渲染定时设置:", deviceStatus.schedules);
    elements.scheduleContainer.innerHTML = '';
    deviceStatus.schedules.forEach(schedule => {
        addNewScheduleItem(schedule.time, schedule.amount, schedule.enabled);
    });
}

// 保存定时喂食设置
function saveScheduleSettings() {
    const scheduleElements = elements.scheduleContainer.querySelectorAll('.schedule-item');
    const newSchedules = [];
    
    scheduleElements.forEach(item => {
        newSchedules.push({
            id: item.dataset.id,
            time: item.querySelector('.schedule-time').value,
            amount: parseInt(item.querySelector('.schedule-amount').value),
            enabled: item.querySelector('.schedule-enabled').checked
        });
    });
    
    deviceStatus.schedules = newSchedules;
    sendCommand({
        type: "set_schedule",
        schedules: newSchedules
    });
    
    alert("定时设置已保存");
}

// 添加喂食记录
function addHistoryItem(date, type, amount, targetAmount = null) {
    const timeString = date.toLocaleTimeString();
    const dateString = date.toLocaleDateString();
    
    const historyItem = {
        id: Date.now(),
        date: dateString,
        time: timeString,
        type: type,
        amount: amount,
        targetAmount: targetAmount,
        completed: targetAmount ? false : true
    };
    
    deviceStatus.history.unshift(historyItem);
    renderHistoryItem(historyItem);
}

// 更新喂食记录
function updateHistoryItem(amountFed) {
    const incompleteItem = deviceStatus.history.find(item => !item.completed);
    if (incompleteItem) {
        incompleteItem.amount = amountFed;
        incompleteItem.completed = true;
        renderHistory();
    }
}

// 渲染单个喂食记录
function renderHistoryItem(item) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${item.date} ${item.time}</td>
        <td>${item.type}</td>
        <td>${item.completed ? `${item.amount} g` : `目标: ${item.targetAmount} g`}</td>
    `;
    elements.feedingHistory.prepend(row);
}

// 重新渲染整个喂食记录
function renderHistory() {
    elements.feedingHistory.innerHTML = '';
    deviceStatus.history.forEach(item => renderHistoryItem(item));
}

// 初始化页面
function initPage() {
    console.log("页面初始化开始");
    
    // 验证所有必需的DOM元素
    if (!elements.addScheduleBtn) {
        console.error("错误: 未找到添加按钮元素");
        elements.addScheduleBtn = document.getElementById('add-schedule-btn');
    }
    
    // 添加初始示例时间
    addNewScheduleItem("08:00", 50, true);
    addNewScheduleItem("12:00", 50, true);
    addNewScheduleItem("18:00", 50, true);
    
    // 绑定事件 - 添加详细的错误处理
    try {
        elements.feedNowBtn.addEventListener('click', () => {
            const amount = parseInt(elements.feedAmount.value);
            if (amount >= 10 && amount <= 200) {
                sendCommand({
                    type: "feed_now",
                    amount: amount
                });
            } else {
                alert("喂食量应在10-200克之间");
            }
        });
        
        elements.addScheduleBtn.addEventListener('click', () => {
            console.log("添加按钮被点击");
            addNewScheduleItem();
        });
        
        elements.saveScheduleBtn.addEventListener('click', () => {
            console.log("保存按钮被点击");
            saveScheduleSettings();
        });
    } catch (e) {
        console.error("事件绑定错误:", e);
    }
    
    // 初始化WebSocket连接
    initWebSocket();
    
    // 模拟一些历史数据
    const now = new Date();
    const earlier1 = new Date(now.getTime() - 2*60*60*1000);
    const earlier2 = new Date(now.getTime() - 5*60*60*1000);
    const earlier3 = new Date(now.getTime() - 24*60*60*1000);
    
    addHistoryItem(earlier3, "定时喂食", 50);
    addHistoryItem(earlier2, "手动喂食", 45);
    addHistoryItem(earlier1, "定时喂食", 50);
    
    console.log("页面初始化完成");
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM已加载");
    initPage();
});

// 添加全局错误处理
window.addEventListener('error', function(e) {
    console.error("全局错误:", e.message, "在", e.filename, "行:", e.lineno);
});
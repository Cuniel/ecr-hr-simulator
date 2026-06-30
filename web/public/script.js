class DaKaApp {
    constructor() {
        this.apiBase = '/api';
        this.init();
    }

    init() {
        this.bindEvents();
        this.updateTime();
        this.loadSystemStatus();
        this.loadLogs();
        
        // 每分钟更新时间
        setInterval(() => this.updateTime(), 1000);
        
        // 每30秒检查系统状态
        setInterval(() => this.loadSystemStatus(), 30000);
    }

    bindEvents() {
        // 表单按钮事件
        document.getElementById('validate-btn').addEventListener('click', () => this.validateAccount());
        document.getElementById('test-btn').addEventListener('click', () => this.testClockIn());
        document.getElementById('clockin-btn').addEventListener('click', () => this.showConfirmModal());
        document.getElementById('refresh-logs').addEventListener('click', () => this.loadLogs());
        
        // 密码显示/隐藏
        document.getElementById('toggle-password').addEventListener('click', () => this.togglePassword());
        
        // 获取位置
        document.getElementById('get-location').addEventListener('click', () => this.getCurrentLocation());
        
        // 确认模态框
        document.getElementById('confirm-checkbox').addEventListener('change', (e) => {
            document.getElementById('confirm-clockin-btn').disabled = !e.target.checked;
        });
        
        document.getElementById('confirm-clockin-btn').addEventListener('click', () => this.executeClockIn());
        
        // 表单验证
        const form = document.getElementById('clockin-form');
        form.addEventListener('input', () => this.validateForm());
    }

    // 更新当前时间
    updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('zh-CN');
        document.getElementById('current-time').textContent = timeString;
    }

    // 加载系统状态
    async loadSystemStatus() {
        try {
            const response = await fetch(`${this.apiBase}/status`);
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('server-status').textContent = '在线';
                document.getElementById('server-status').className = 'text-success';
            } else {
                document.getElementById('server-status').textContent = '异常';
                document.getElementById('server-status').className = 'text-danger';
            }
        } catch (error) {
            document.getElementById('server-status').textContent = '离线';
            document.getElementById('server-status').className = 'text-danger';
        }
    }

    // 验证表单
    validateForm() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        const isValid = username.length >= 3 && password.length >= 6;
        
        // 更新按钮状态
        document.getElementById('validate-btn').disabled = !isValid;
        document.getElementById('test-btn').disabled = !isValid;
        
        return isValid;
    }

    // 切换密码显示
    togglePassword() {
        const passwordInput = document.getElementById('password');
        const toggleBtn = document.getElementById('toggle-password');
        const icon = toggleBtn.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            passwordInput.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    // 获取当前位置
    getCurrentLocation() {
        if (!navigator.geolocation) {
            this.showAlert('您的浏览器不支持地理定位', 'warning');
            return;
        }

        const button = document.getElementById('get-location');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>获取中...';
        button.disabled = true;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                document.getElementById('latitude').value = position.coords.latitude.toFixed(6);
                document.getElementById('longitude').value = position.coords.longitude.toFixed(6);
                this.showAlert('位置获取成功', 'success');
                
                button.innerHTML = originalText;
                button.disabled = false;
            },
            (error) => {
                console.error('位置获取失败:', error);
                this.showAlert('位置获取失败，请手动输入或检查浏览器权限', 'warning');
                
                button.innerHTML = originalText;
                button.disabled = false;
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000
            }
        );
    }

    // 验证账号
    async validateAccount() {
        if (!this.validateForm()) return;
        
        const formData = this.getFormData();
        
        try {
            this.showLoading('验证账号信息', '正在验证用户名和密码格式...');
            
            const response = await fetch(`${this.apiBase}/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            this.hideLoading();
            
            if (data.success) {
                this.showAlert('✅ 账号验证通过', 'success');
                document.getElementById('test-btn').disabled = false;
            } else {
                this.showAlert(`❌ 验证失败: ${data.message}`, 'danger');
            }
            
        } catch (error) {
            this.hideLoading();
            this.showAlert('验证过程发生错误，请重试', 'danger');
        }
    }

    // 测试打卡
    async testClockIn() {
        if (!this.validateForm()) return;
        
        const formData = this.getFormData();
        
        try {
            this.showLoading('测试打卡', '正在模拟打卡流程，不会实际打卡...');
            
            const response = await fetch(`${this.apiBase}/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            this.hideLoading();
            
            if (data.success) {
                this.showAlert('✅ 测试成功！所有流程正常', 'success');
                this.showResult(data, 'test');
                document.getElementById('clockin-btn').disabled = false;
                this.loadLogs(); // 刷新日志
            } else {
                this.showAlert(`❌ 测试失败: ${data.message}`, 'danger');
                this.showResult(data, 'test');
            }
            
        } catch (error) {
            this.hideLoading();
            this.showAlert('测试过程发生错误，请重试', 'danger');
        }
    }

    // 显示确认模态框
    showConfirmModal() {
        const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
        modal.show();
        
        // 重置确认复选框
        document.getElementById('confirm-checkbox').checked = false;
        document.getElementById('confirm-clockin-btn').disabled = true;
    }

    // 执行真实打卡
    async executeClockIn() {
        const formData = this.getFormData();
        formData.confirm = true;
        
        // 隐藏确认模态框
        const confirmModal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
        confirmModal.hide();
        
        try {
            this.showLoading('执行打卡', '正在执行真实打卡，请稍候...');
            
            const response = await fetch(`${this.apiBase}/clockin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            this.hideLoading();
            
            if (data.success) {
                this.showAlert('🎉 打卡成功！', 'success');
                this.showResult(data, 'success');
            } else {
                this.showAlert(`❌ 打卡失败: ${data.message}`, 'danger');
                this.showResult(data, 'failure');
            }
            
            this.loadLogs(); // 刷新日志
            
        } catch (error) {
            this.hideLoading();
            this.showAlert('打卡过程发生错误，请重试', 'danger');
        }
    }

    // 获取表单数据
    getFormData() {
        return {
            username: document.getElementById('username').value.trim(),
            password: document.getElementById('password').value.trim(),
            location: {
                latitude: parseFloat(document.getElementById('latitude').value) || 31.24,
                longitude: parseFloat(document.getElementById('longitude').value) || 121.42
            }
        };
    }

    // 显示加载模态框
    showLoading(title, message) {
        document.getElementById('loading-title').textContent = title;
        document.getElementById('loading-message').textContent = message;
        const modal = new bootstrap.Modal(document.getElementById('loadingModal'));
        modal.show();
    }

    // 隐藏加载模态框
    hideLoading() {
        const modal = bootstrap.Modal.getInstance(document.getElementById('loadingModal'));
        if (modal) modal.hide();
    }

    // 显示提示信息
    showAlert(message, type = 'info') {
        // 移除现有的alert
        const existingAlert = document.querySelector('.alert');
        if (existingAlert) {
            existingAlert.remove();
        }

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        // 插入到表单上方
        const form = document.getElementById('clockin-form');
        form.parentNode.insertBefore(alertDiv, form);

        // 3秒后自动消失
        setTimeout(() => {
            if (alertDiv) {
                alertDiv.remove();
            }
        }, 3000);
    }

    // 显示执行结果
    showResult(data, type) {
        const resultCard = document.getElementById('result-card');
        const resultContent = document.getElementById('result-content');
        
        let statusClass = '';
        let statusIcon = '';
        let statusText = '';
        
        switch (type) {
            case 'test':
                statusClass = 'result-test';
                statusIcon = 'fas fa-flask';
                statusText = '测试结果';
                break;
            case 'success':
                statusClass = 'result-success';
                statusIcon = 'fas fa-check-circle';
                statusText = '打卡成功';
                break;
            case 'failure':
                statusClass = 'result-failure';
                statusIcon = 'fas fa-times-circle';
                statusText = '执行失败';
                break;
        }

        resultContent.innerHTML = `
            <div class="d-flex align-items-center mb-3">
                <i class="${statusIcon} fs-3 me-2"></i>
                <h5 class="mb-0">${statusText}</h5>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <strong>执行时间:</strong><br>
                    <small class="text-muted">${new Date(data.timestamp).toLocaleString('zh-CN')}</small>
                </div>
                <div class="col-md-6">
                    <strong>执行模式:</strong><br>
                    <small class="text-muted">${data.data?.mode || 'headless'} ${data.data?.dryRun ? '(测试模式)' : '(真实模式)'}</small>
                </div>
            </div>
            
            ${data.data?.results ? `
                <div class="mt-3">
                    <strong>详细结果:</strong>
                    <div class="row mt-2">
                        <div class="col-md-4">
                            <div class="text-center p-2 border rounded">
                                <i class="fas fa-sign-in-alt ${data.data.results.login ? 'text-success' : 'text-danger'}"></i>
                                <div><small>登录 ${data.data.results.login ? '成功' : '失败'}</small></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="text-center p-2 border rounded">
                                <i class="fas fa-clock ${data.data.results.clockin ? 'text-success' : 'text-danger'}"></i>
                                <div><small>打卡 ${data.data.results.clockin ? '成功' : '失败'}</small></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="text-center p-2 border rounded">
                                <i class="fas fa-stopwatch text-info"></i>
                                <div><small>耗时 ${this.calculateDuration(data.data.results.startTime, data.data.results.endTime)}</small></div>
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}
            
            ${data.data?.results?.errors && data.data.results.errors.length > 0 ? `
                <div class="mt-3">
                    <strong class="text-danger">错误信息:</strong>
                    <ul class="list-unstyled mt-2">
                        ${data.data.results.errors.map(error => `<li class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i>${error}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            <div class="mt-3">
                <small class="text-muted">
                    <i class="fas fa-info-circle me-1"></i>
                    详细日志已保存，可在下方"执行历史"中查看
                </small>
            </div>
        `;

        resultCard.className = `card shadow-sm mt-3 ${statusClass}`;
        resultCard.style.display = 'block';
        
        // 滚动到结果区域
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 计算执行时间
    calculateDuration(startTime, endTime) {
        if (!startTime || !endTime) return '未知';
        
        const start = new Date(startTime);
        const end = new Date(endTime);
        const diff = Math.abs(end - start) / 1000; // 秒
        
        if (diff < 60) return `${Math.round(diff)}秒`;
        return `${Math.round(diff / 60)}分${Math.round(diff % 60)}秒`;
    }

    // 加载执行日志
    async loadLogs() {
        const logsContent = document.getElementById('logs-content');
        
        try {
            const response = await fetch(`${this.apiBase}/logs/5`);
            const data = await response.json();
            
            if (data.success && data.data.length > 0) {
                // 更新统计信息
                this.updateStatistics(data.data);
                
                logsContent.innerHTML = data.data.map(log => this.formatLogItem(log)).join('');
            } else {
                logsContent.innerHTML = `
                    <div class="text-center text-muted py-4">
                        <i class="fas fa-inbox fs-1 mb-3"></i>
                        <p>暂无执行记录</p>
                        <small>执行打卡后将在此显示历史记录</small>
                    </div>
                `;
            }
        } catch (error) {
            logsContent.innerHTML = `
                <div class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-triangle fs-1 mb-3"></i>
                    <p>加载日志失败</p>
                    <button class="btn btn-outline-danger btn-sm" onclick="app.loadLogs()">
                        <i class="fas fa-retry me-1"></i>重试
                    </button>
                </div>
            `;
        }
    }

    // 更新统计信息
    updateStatistics(logs) {
        if (logs.length === 0) return;
        
        // 最近执行时间
        const latest = logs[0];
        const lastExecution = new Date(latest.timestamp).toLocaleString('zh-CN');
        document.getElementById('last-execution').textContent = lastExecution;
        
        // 成功率计算
        const realExecutions = logs.filter(log => !log.dryRun);
        if (realExecutions.length > 0) {
            const successCount = realExecutions.filter(log => log.success).length;
            const successRate = Math.round((successCount / realExecutions.length) * 100);
            document.getElementById('success-rate').textContent = `${successRate}%`;
            document.getElementById('success-rate').className = successRate >= 80 ? 'text-success' : successRate >= 60 ? 'text-warning' : 'text-danger';
        }
    }

    // 格式化日志条目
    formatLogItem(log) {
        const statusClass = log.dryRun ? 'log-test' : (log.success ? 'log-success' : 'log-failure');
        const statusIcon = log.dryRun ? 'fas fa-flask text-warning' : (log.success ? 'fas fa-check-circle text-success' : 'fas fa-times-circle text-danger');
        const statusText = log.dryRun ? '测试' : (log.success ? '成功' : '失败');
        
        return `
            <div class="log-item ${statusClass}">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <div class="d-flex align-items-center mb-2">
                            <i class="${statusIcon} me-2"></i>
                            <strong>${statusText}</strong>
                            <span class="badge bg-secondary ms-2">${log.mode}</span>
                            ${log.dryRun ? '<span class="badge bg-warning ms-1">测试</span>' : ''}
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <small class="text-muted">
                                    <i class="fas fa-clock me-1"></i>
                                    ${new Date(log.timestamp).toLocaleString('zh-CN')}
                                </small>
                            </div>
                            <div class="col-md-6">
                                <small class="text-muted">
                                    <i class="fas fa-stopwatch me-1"></i>
                                    耗时: ${this.calculateDuration(log.results?.startTime, log.results?.endTime)}
                                </small>
                            </div>
                        </div>
                        ${log.results?.errors && log.results.errors.length > 0 ? `
                            <div class="mt-2">
                                <small class="text-danger">
                                    <i class="fas fa-exclamation-triangle me-1"></i>
                                    ${log.results.errors.join(', ')}
                                </small>
                            </div>
                        ` : ''}
                    </div>
                    <div class="text-end">
                        <small class="text-muted">${Math.round(log.size / 1024)}KB</small>
                    </div>
                </div>
            </div>
        `;
    }
}

// 初始化应用
const app = new DaKaApp();

// 全局错误处理
window.addEventListener('error', (e) => {
    console.error('全局错误:', e.error);
    app.showAlert('页面发生错误，请刷新后重试', 'danger');
});

// 页面卸载时的提示
window.addEventListener('beforeunload', (e) => {
    const loadingModal = document.getElementById('loadingModal');
    if (loadingModal && loadingModal.style.display !== 'none') {
        e.preventDefault();
        e.returnValue = '操作正在进行中，确定要离开吗？';
    }
});
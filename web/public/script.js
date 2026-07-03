class ECRHRApp {
    constructor() {
        this.apiBase = '/api';
        this.accountStorageKey = 'ecr-hr-saved-accounts';
        this.locations = [];
        this.defaultLocation = { id: 'global-harbor', name: '我格广场', latitude: 31.24, longitude: 121.42, default: true };
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderSavedAccounts();
        this.loadAppConfig();
        this.validateForm();
        this.updateTime();
        this.loadCalendarStatus();
        
        // 每秒更新时间
        setInterval(() => this.updateTime(), 1000);
        setInterval(() => this.loadCalendarStatus(), 30 * 60 * 1000);
    }

    bindEvents() {
        const testBtn = document.getElementById('test-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testClockIn());
        }

        const clockinBtn = document.getElementById('clockin-btn');
        if (clockinBtn) {
            clockinBtn.addEventListener('click', () => this.showConfirmModal());
        }

        const toggleBtn = document.getElementById('toggle-password');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.togglePassword());
        }

        const accountSelect = document.getElementById('saved-account');
        if (accountSelect) {
            accountSelect.addEventListener('change', () => this.applySavedAccount());
        }

        const deleteAccountBtn = document.getElementById('delete-account');
        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', () => this.deleteSelectedAccount());
        }

        const credentialsToggle = document.getElementById('credentials-toggle');
        if (credentialsToggle) {
            credentialsToggle.addEventListener('click', () => this.toggleCredentials());
        }

        const locationSelect = document.getElementById('location-select');
        if (locationSelect) {
            locationSelect.addEventListener('change', () => this.applySelectedLocation());
        }

        ['latitude', 'longitude'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.addEventListener('input', () => this.applySelectedLocation());
        });
        
        const form = document.getElementById('clockin-form');
        if (form) {
            form.addEventListener('input', () => this.validateForm());
        }
        
        this.setupButtonStates();
    }

    // 添加按钮交互效果
    setupButtonStates() {
        const buttons = document.querySelectorAll('.action-row .btn');
        
        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                if (!this.disabled && !this.classList.contains('btn-loading')) {
                    // 点击反馈动画
                    this.style.transform = 'scale(0.98)';
                    setTimeout(() => {
                        this.style.transform = '';
                    }, 100);
                }
            });
        });
    }

    renderLocationOptions(defaultLocationId = '') {
        const locationSelect = document.getElementById('location-select');
        if (!locationSelect) return;

        locationSelect.innerHTML = '';
        this.locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.id;
            option.textContent = location.name;
            locationSelect.appendChild(option);
        });

        const customOption = document.createElement('option');
        customOption.value = 'custom';
        customOption.textContent = '自定义坐标';
        locationSelect.appendChild(customOption);

        const selectedId = defaultLocationId || this.locations.find(location => location.default)?.id || this.locations[0]?.id || 'custom';
        locationSelect.value = this.locations.some(location => location.id === selectedId) ? selectedId : 'custom';
        this.applySelectedLocation();
    }

    applySelectedLocation() {
        const locationSelect = document.getElementById('location-select');
        const customFields = document.getElementById('custom-location-fields');
        const latitudeInput = document.getElementById('latitude');
        const longitudeInput = document.getElementById('longitude');
        const selectedId = locationSelect?.value || 'custom';
        const selectedLocation = this.locations.find(location => location.id === selectedId);
        const isCustom = selectedId === 'custom' || !selectedLocation;

        if (customFields) customFields.hidden = !isCustom;

        if (selectedLocation) {
            if (latitudeInput) latitudeInput.value = selectedLocation.latitude;
            if (longitudeInput) longitudeInput.value = selectedLocation.longitude;
        }

    }

    toggleCredentials(forceExpanded = null) {
        const card = document.getElementById('credentials-card');
        const body = document.getElementById('credentials-body');
        const toggle = document.getElementById('credentials-toggle');
        if (!card || !body || !toggle) return;

        const shouldExpand = forceExpanded ?? card.classList.contains('is-collapsed');
        card.classList.toggle('is-collapsed', !shouldExpand);
        body.hidden = !shouldExpand;
        toggle.setAttribute('aria-expanded', String(shouldExpand));

        const icon = toggle.querySelector('.fa-chevron-up, .fa-chevron-down');
        if (icon) {
            icon.className = `fas ${shouldExpand ? 'fa-chevron-up' : 'fa-chevron-down'}`;
        }
    }

    async loadAppConfig() {
        try {
            const response = await fetch(`${this.apiBase}/config`);
            const data = await response.json();
            if (!data.success) throw new Error(data.message || '配置加载失败');

            this.locations = Array.isArray(data.data?.locations) && data.data.locations.length > 0
                ? data.data.locations
                : [this.defaultLocation];
            this.renderLocationOptions(data.data?.defaultLocationId);
        } catch (error) {
            console.error('配置加载失败:', error);
            this.locations = [this.defaultLocation];
            this.renderLocationOptions(this.defaultLocation.id);
        }
    }

    // 设置按钮加载状态
    setButtonLoading(buttonId, loading = true, loadingText = '处理中...') {
        const button = document.getElementById(buttonId);
        if (!button) return;

        if (loading) {
            button.dataset.originalContent = button.innerHTML;
            button.classList.add('btn-loading');
            button.innerHTML = `<i class="fas fa-spinner fa-spin me-1"></i>${loadingText}`;
            button.disabled = true;
        } else {
            button.classList.remove('btn-loading');
            button.innerHTML = button.dataset.originalContent || button.innerHTML;
            button.disabled = false;
            // 重新验证表单状态
            this.validateForm();
        }
    }

    // 测试操作
    async testClockIn() {
        if (!this.validateForm()) {
            this.showAlert('请先填写正确的手机号和密码', 'warning');
            return;
        }
        
        // 设置加载状态
        this.setButtonLoading('test-btn', true, '测试中...');
        
        const formData = this.getFormData();
        this.rememberCurrentAccountIfNeeded(formData);
        
        try {
            this.showAlert('正在执行操作流程测试，请稍候...', 'info');
            
            const response = await fetch(`${this.apiBase}/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showAlert('🎉 测试成功！登录和操作流程正常', 'success');
                // 显示测试结果
                this.showTestResult(data);
            } else {
                this.showAlert(`❌ 测试失败: ${data.message}`, 'danger');
                this.showTestResult(data);
            }
            
        } catch (error) {
            console.error('测试请求失败:', error);
            this.showAlert('测试请求失败，请检查网络连接后重试', 'danger');
        } finally {
            // 恢复按钮状态
            this.setButtonLoading('test-btn', false);
        }
    }

    // 显示测试结果
    showTestResult(data) {
        // 如果有结果面板，显示详细信息
        const resultCard = document.getElementById('result-card');
        if (resultCard) {
            const resultContent = document.getElementById('result-content');
            if (resultContent) {
                const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString('zh-CN') : '刚刚';
                const loginStatus = data.data?.results?.login ? '✅ 成功' : '❌ 失败';
                const clockinStatus = data.data?.results?.clockin ? '✅ 成功' : '❌ 失败';
                const screenshotMarkup = this.renderScreenshotPreview(data.data);
                
                resultContent.innerHTML = `
                    <div class="result-meta-grid">
                        <div class="result-meta-item ${data.data?.results?.login ? 'is-success' : 'is-failure'}">
                            <span>登录</span>
                            <strong>${loginStatus}</strong>
                        </div>
                        <div class="result-meta-item ${data.data?.results?.clockin ? 'is-success' : 'is-failure'}">
                            <span>页面访问</span>
                            <strong>${clockinStatus}</strong>
                        </div>
                        <div class="result-meta-item">
                            <span>模式</span>
                            <strong>无头测试</strong>
                        </div>
                    </div>
                    <div class="result-note mt-3">
                        <small class="text-muted">
                            <i class="fas fa-info-circle me-1"></i>${timestamp} · 测试不会实际操作
                        </small>
                    </div>
                    ${screenshotMarkup}
                `;
                
                resultCard.className = `panel result-panel fade-in ${data.success ? 'result-test' : 'result-failure'}`;
                resultCard.hidden = false;
                resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
        
    }

    renderScreenshotPreview(report) {
        const screenshotUrl = report?.screenshotDataUrl || report?.screenshotUrl;
        if (!screenshotUrl) return '';

        const filename = report?.latestScreenshot?.filename || '最后截图';
        const safeUrl = this.escapeHtml(screenshotUrl);
        const safeFilename = this.escapeHtml(filename);
        const openUrl = report?.screenshotUrl || screenshotUrl;
        const safeOpenUrl = this.escapeHtml(openUrl);

        return `
            <div class="screenshot-preview mt-3">
                <div class="screenshot-header">
                    <span><i class="fas fa-image me-2"></i>最后截图</span>
                    <small>${safeFilename}</small>
                </div>
                <a href="${safeOpenUrl}" target="_blank" rel="noopener" class="screenshot-link">
                    <img src="${safeUrl}" alt="最后截图：${safeFilename}" loading="lazy">
                </a>
            </div>
        `;
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 表单验证
    validateForm() {
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        
        if (!usernameInput || !passwordInput) return false;
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        const isValid = username.length >= 3 && password.length >= 6;
        
        const testBtn = document.getElementById('test-btn');
        if (testBtn && !testBtn.classList.contains('btn-loading')) {
            testBtn.disabled = !isValid;
        }

        const clockinBtn = document.getElementById('clockin-btn');
        if (clockinBtn && !clockinBtn.classList.contains('btn-loading')) {
            clockinBtn.disabled = !isValid;
        }
        
        return isValid;
    }

    // 获取表单数据
    getFormData() {
        const locationSelect = document.getElementById('location-select');
        const selectedLocation = this.locations.find(location => location.id === locationSelect?.value);
        const latitude = selectedLocation?.latitude ?? parseFloat(document.getElementById('latitude')?.value) ?? 31.24;
        const longitude = selectedLocation?.longitude ?? parseFloat(document.getElementById('longitude')?.value) ?? 121.42;

        return {
            username: document.getElementById('username')?.value.trim() || '',
            password: document.getElementById('password')?.value.trim() || '',
            location: {
                latitude,
                longitude
            }
        };
    }

    // 更新时间显示
    updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const dateString = `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            timeElement.textContent = timeString;
        }

        const dateElement = document.getElementById('current-date');
        if (dateElement) {
            dateElement.textContent = dateString;
        }
    }

    // 加载工作日状态
    async loadCalendarStatus() {
        try {
            const response = await fetch(`${this.apiBase}/calendar/today`);
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || '工作日判断失败');
            }

            this.renderCalendarStatus(data.data);
        } catch (error) {
            console.error('工作日状态加载失败:', error);
            const label = document.getElementById('workday-label');
            const statusText = document.getElementById('status-text');
            const statusDot = document.getElementById('system-status');

            if (label) label.textContent = '无法判断';
            if (statusText) statusText.textContent = '工作日状态获取失败';
            if (statusDot) statusDot.className = 'status-dot error';
        }
    }

    renderCalendarStatus(calendar) {
        const label = document.getElementById('workday-label');
        const detail = document.getElementById('workday-detail');
        const statusText = document.getElementById('status-text');
        const statusDot = document.getElementById('system-status');

        const dayLabel = calendar.isWorkday ? '工作日' : '休息日';
        const detailText = calendar.isWorkday ? dayLabel : (calendar.name ? `${dayLabel} · ${calendar.name}` : dayLabel);

        if (label) label.textContent = detailText;
        if (detail) {
            detail.classList.toggle('is-restday', !calendar.isWorkday);
            detail.classList.toggle('is-workday', calendar.isWorkday);
        }
        if (statusText) statusText.textContent = calendar.isWorkday ? '今日是工作日' : `今日是休息日${calendar.name ? `：${calendar.name}` : ''}`;
        if (statusDot) statusDot.className = calendar.isWorkday ? 'status-dot' : 'status-dot warning';
    }

    // 显示提示消息
    showAlert(message, type = 'info') {
        const existingAlert = document.querySelector('.alert');
        if (existingAlert) {
            existingAlert.remove();
        }

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show mt-3`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
        `;

        const form = document.getElementById('clockin-form');
        if (form && form.parentNode) {
            form.parentNode.insertBefore(alertDiv, form);
        }

        // 5秒后自动消失
        setTimeout(() => {
            if (alertDiv && alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    // 密码显示切换
    togglePassword() {
        const passwordInput = document.getElementById('password');
        const toggleBtn = document.getElementById('toggle-password');
        
        if (passwordInput && toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                if (icon) icon.className = 'fas fa-eye-slash';
            } else {
                passwordInput.type = 'password';
                if (icon) icon.className = 'fas fa-eye';
            }
        }
    }

    // 显示确认模态框
    showConfirmModal() {
        if (!this.validateForm()) {
            this.showAlert('请先填写正确的手机号和密码', 'warning');
            return;
        }

        // 检查是否有 Bootstrap 模态框
        const confirmModal = document.getElementById('confirmModal');
        if (confirmModal && typeof bootstrap !== 'undefined') {
            const modal = new bootstrap.Modal(confirmModal);
            modal.show();
            
            // 重置确认复选框
            const checkbox = document.getElementById('confirm-checkbox');
            const confirmBtn = document.getElementById('confirm-clockin-btn');
            
            if (checkbox) checkbox.checked = false;
            if (confirmBtn) confirmBtn.disabled = true;
            
            // 绑定确认按钮事件
            if (confirmBtn && !confirmBtn.hasEventListener) {
                confirmBtn.addEventListener('click', () => this.executeClockIn());
                confirmBtn.hasEventListener = true;
            }
            
            // 绑定复选框事件
            if (checkbox && !checkbox.hasEventListener) {
                checkbox.addEventListener('change', (e) => {
                    if (confirmBtn) confirmBtn.disabled = !e.target.checked;
                });
                checkbox.hasEventListener = true;
            }
        } else {
            // 简单确认对话框
            const confirmed = confirm('确定要执行真实操作吗？\n\n请确认：\n- 账号信息已正确填写\n- 坐标位置设置正确\n- 了解这是真实操作');
            
            if (confirmed) {
                this.executeClockIn();
            }
        }
    }

    // 执行真实操作
    async executeClockIn() {
        if (!this.validateForm()) {
            this.showAlert('请检查表单信息', 'warning');
            return;
        }

        // 隐藏确认模态框
        const confirmModal = document.getElementById('confirmModal');
        if (confirmModal && typeof bootstrap !== 'undefined') {
            const modal = bootstrap.Modal.getInstance(confirmModal);
            if (modal) modal.hide();
        }

        // 设置加载状态
        this.setButtonLoading('clockin-btn', true, '操作中...');
        
        const formData = this.getFormData();
        formData.confirm = true;
        this.rememberCurrentAccountIfNeeded(formData);
        
        try {
            this.showAlert('🚀 正在执行真实操作，请稍候...', 'info');
            
            const response = await fetch(`${this.apiBase}/clockin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showAlert('🎉 操作成功！', 'success');
                this.showClockInResult(data, true);
            } else {
                this.showAlert(`❌ 操作失败: ${data.message}`, 'danger');
                this.showClockInResult(data, false);
            }
            
        } catch (error) {
            console.error('操作请求失败:', error);
            this.showAlert('操作请求失败，请检查网络连接后重试', 'danger');
        } finally {
            // 恢复按钮状态
            this.setButtonLoading('clockin-btn', false);
        }
    }

    // 显示操作结果
    showClockInResult(data, success) {
        const resultCard = document.getElementById('result-card');
        if (resultCard) {
            const resultContent = document.getElementById('result-content');
            if (resultContent) {
                const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString('zh-CN') : '刚刚';
                const loginStatus = data.data?.results?.login ? '✅ 成功' : '❌ 失败';
                const clockinStatus = data.data?.results?.clockin ? '✅ 成功' : '❌ 失败';
                
                resultContent.innerHTML = `
                    <div class="result-meta-grid">
                        <div class="result-meta-item ${data.data?.results?.login ? 'is-success' : 'is-failure'}">
                            <span>登录</span>
                            <strong>${loginStatus}</strong>
                        </div>
                        <div class="result-meta-item ${data.data?.results?.clockin ? 'is-success' : 'is-failure'}">
                            <span>操作</span>
                            <strong>${clockinStatus}</strong>
                        </div>
                        <div class="result-meta-item">
                            <span>模式</span>
                            <strong>无头执行</strong>
                        </div>
                    </div>
                    <div class="result-note mt-3">
                        <small class="text-muted">
                            <i class="fas fa-clock me-1"></i>${timestamp}
                        </small>
                    </div>
                `;
                
                resultCard.className = `panel result-panel fade-in ${success ? 'result-success' : 'result-failure'}`;
                resultCard.hidden = false;
                resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
        
    }

    getSavedAccounts() {
        try {
            const raw = localStorage.getItem(this.accountStorageKey);
            const accounts = raw ? JSON.parse(raw) : [];
            return Array.isArray(accounts) ? accounts.filter(item => item && item.username) : [];
        } catch (error) {
            console.error('读取本地账号记录失败:', error);
            return [];
        }
    }

    saveAccounts(accounts) {
        try {
            localStorage.setItem(this.accountStorageKey, JSON.stringify(accounts));
            return true;
        } catch (error) {
            console.error('保存本地账号记录失败:', error);
            this.showAlert('本地记录保存失败，请检查浏览器存储权限', 'warning');
            return false;
        }
    }

    renderSavedAccounts(selectedUsername = '') {
        const savedAccountField = document.getElementById('saved-account-field');
        const accountSelect = document.getElementById('saved-account');
        const deleteAccountBtn = document.getElementById('delete-account');
        if (!accountSelect) return;

        const accounts = this.getSavedAccounts();
        if (savedAccountField) savedAccountField.hidden = accounts.length === 0;

        if (accounts.length === 0) {
            accountSelect.innerHTML = '<option value="">暂无本地记录</option>';
            if (deleteAccountBtn) deleteAccountBtn.disabled = true;
            this.toggleCredentials(true);
            return;
        }

        accountSelect.innerHTML = '<option value="">选择已保存手机号</option>';

        accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.username;
            option.textContent = this.maskPhone(account.username);
            accountSelect.appendChild(option);
        });

        accountSelect.value = selectedUsername || accounts[0]?.username || '';
        if (deleteAccountBtn) {
            deleteAccountBtn.disabled = !accountSelect.value;
        }
        this.applySavedAccount({ collapse: Boolean(accountSelect.value) });
    }

    applySavedAccount(options = {}) {
        const accountSelect = document.getElementById('saved-account');
        const deleteAccountBtn = document.getElementById('delete-account');
        if (!accountSelect) return;

        const selectedUsername = accountSelect.value;
        if (deleteAccountBtn) {
            deleteAccountBtn.disabled = !selectedUsername;
        }

        if (!selectedUsername) {
            this.toggleCredentials(true);
            return;
        }

        const account = this.getSavedAccounts().find(item => item.username === selectedUsername);
        if (!account) return;

        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const rememberAccount = document.getElementById('remember-account');

        if (usernameInput) usernameInput.value = account.username;
        if (passwordInput) passwordInput.value = account.password || '';
        if (rememberAccount) rememberAccount.checked = true;

        if (options.collapse !== false) {
            this.toggleCredentials(false);
        }

        this.validateForm();
    }

    deleteSelectedAccount() {
        const accountSelect = document.getElementById('saved-account');
        if (!accountSelect || !accountSelect.value) return;

        const selectedUsername = accountSelect.value;
        const accounts = this.getSavedAccounts().filter(account => account.username !== selectedUsername);
        if (!this.saveAccounts(accounts)) return;
        this.renderSavedAccounts();

        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        if (usernameInput?.value === selectedUsername) {
            usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';
        }

        this.validateForm();
        this.showAlert('已删除本地记录', 'success');
    }

    rememberCurrentAccountIfNeeded(formData) {
        const rememberAccount = document.getElementById('remember-account');
        if (!rememberAccount?.checked) return;

        const username = formData.username.trim();
        const password = formData.password;
        if (!username || !password) return;

        const accounts = this.getSavedAccounts().filter(account => account.username !== username);
        accounts.unshift({
            username,
            password,
            updatedAt: new Date().toISOString()
        });

        if (!this.saveAccounts(accounts.slice(0, 10))) return;
        this.renderSavedAccounts(username);
    }

    maskPhone(phone = '') {
        const value = String(phone);
        if (value.length <= 7) return value;
        return `${value.slice(0, 3)}****${value.slice(-4)}`;
    }
}

// 应用初始化
document.addEventListener('DOMContentLoaded', function() {
    try {
        window.app = new ECRHRApp();
        
        // 全局错误处理
        window.addEventListener('error', (e) => {
            console.error('全局错误:', e.error);
            if (window.app && window.app.showAlert) {
                window.app.showAlert('页面发生错误，请刷新后重试', 'danger');
            }
        });

        // 页面卸载提示
        window.addEventListener('beforeunload', (e) => {
            const loadingButtons = document.querySelectorAll('.btn-loading');
            if (loadingButtons.length > 0) {
                e.preventDefault();
                e.returnValue = '操作正在进行中，确定要离开吗？';
            }
        });
        
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
    }
});

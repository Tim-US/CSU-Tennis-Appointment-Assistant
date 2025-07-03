// 弹窗界面逻辑
class PopupController {
  constructor() {
    this.isMonitoring = false;
    this.stats = {};
    this.init();
  }

  async init() {
    // 获取DOM元素
    this.elements = {
      status: document.getElementById('status'),
      statusIndicator: document.getElementById('statusIndicator'),
      statusText: document.getElementById('statusText'),
      startBtn: document.getElementById('startBtn'),
      stopBtn: document.getElementById('stopBtn'),
      checkNowBtn: document.getElementById('checkNowBtn'),
      testNotificationBtn: document.getElementById('testNotificationBtn'),
      openPageBtn: document.getElementById('openPageBtn'),
      intervalInput: document.getElementById('intervalInput'),
      soundAlert: document.getElementById('soundAlert'),
      dateSelect: document.getElementById('dateSelect'), // 日期选择下拉框
      debugInfo: document.getElementById('debugInfo'),
      debugContent: document.getElementById('debugContent')
    };

    // 绑定事件
    this.bindEvents();

    // 加载设置
    await this.loadSettings();

    // 更新状态
    await this.updateStatus();
  }

  bindEvents() {
    // 按钮事件
    this.elements.startBtn.addEventListener('click', () => this.startMonitoring());
    this.elements.stopBtn.addEventListener('click', () => this.stopMonitoring());
    this.elements.checkNowBtn.addEventListener('click', () => this.checkNow());
    this.elements.testNotificationBtn.addEventListener('click', () => this.testNotification());
    this.elements.openPageBtn.addEventListener('click', () => this.openTargetPage());

    // 设置变化事件
    this.elements.intervalInput.addEventListener('change', () => this.saveSettings());
    this.elements.soundAlert.addEventListener('change', () => this.saveSettings());
    this.elements.dateSelect.addEventListener('change', () => this.saveSettings());
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        'checkInterval', 
        'soundAlert', 
        'monitorDate'  // 监控日期设置
      ]);

      // 恢复设置
      if (result.checkInterval) {
        this.elements.intervalInput.value = result.checkInterval / 1000; // 转换为秒显示
      } else {
        this.elements.intervalInput.value = 30; // 默认30秒
      }
      
      if (result.soundAlert !== undefined) {
        this.elements.soundAlert.checked = result.soundAlert;
      }
      
      // 加载监控日期设置
      if (result.monitorDate) {
        this.elements.dateSelect.value = result.monitorDate;
      }
      
      console.log('✅ 设置已加载:', result);
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  async saveSettings() {
    try {
      const interval = parseInt(this.elements.intervalInput.value);
      const monitorDate = this.elements.dateSelect.value;
      const settings = {
        checkInterval: interval * 1000, // 存储毫秒值
        soundAlert: this.elements.soundAlert.checked,
        monitorDate: monitorDate // 新增：保存监控日期设置
      };

      await chrome.storage.local.set(settings);
      console.log('✅ 设置已保存:', settings);
      
      // 通知background script更新检查间隔
      const intervalResponse = await chrome.runtime.sendMessage({
        type: 'SET_CHECK_INTERVAL',
        interval: interval // 发送秒值
      });
      
      if (intervalResponse.success) {
        console.log('✅ 检查间隔已更新为:', intervalResponse.interval + 'ms');
      } else {
        console.error('❌ 更新检查间隔失败');
      }
      
      // 通知background script更新监控日期
      const dateResponse = await chrome.runtime.sendMessage({
        type: 'SET_MONITOR_DATE',
        date: monitorDate
      });
      
      if (dateResponse.success) {
        console.log('✅ 监控日期已更新为:', dateResponse.monitorDate);
      } else {
        console.error('❌ 更新监控日期失败');
      }
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  }

  async updateStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      console.log('📊 状态更新:', response);

      if (response) {
        this.isMonitoring = response.isMonitoring;

        if (this.isMonitoring) {
          this.elements.status.className = 'status monitoring';
          this.elements.statusIndicator.className = 'status-indicator active';
          this.elements.statusText.textContent = '正在监控中...';
          this.elements.startBtn.style.display = 'none';
          this.elements.stopBtn.style.display = 'block';
        } else {
          this.elements.status.className = 'status stopped';
          this.elements.statusIndicator.className = 'status-indicator inactive';
          this.elements.statusText.textContent = '监控已停止';
          this.elements.startBtn.style.display = 'block';
          this.elements.stopBtn.style.display = 'none';
        }
      }

    } catch (error) {
      console.error('获取状态失败:', error);
      this.showStoppedStatus();
    }
  }

  showMonitoringStatus() {
    this.elements.status.className = 'status monitoring';
    this.elements.statusIndicator.className = 'status-indicator active';
    this.elements.statusText.textContent = '正在监控中...';
    this.elements.startBtn.style.display = 'none';
    this.elements.stopBtn.style.display = 'block';
  }

  showStoppedStatus() {
    this.elements.status.className = 'status stopped';
    this.elements.statusIndicator.className = 'status-indicator inactive';
    this.elements.statusText.textContent = '监控已停止';
    this.elements.startBtn.style.display = 'block';
    this.elements.stopBtn.style.display = 'none';
  }

  async startMonitoring() {
    try {
      console.log('🔄 开始启动监控...');
      
      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('📄 当前标签页:', tab.url);
      
      // 直接启动监控（不限制页面）
      console.log('✅ 启动监控...');
      const response = await chrome.runtime.sendMessage({
        type: 'START_MONITORING'
      });
      console.log('✅ 监控启动响应:', response);
      await this.updateStatus();
      
      // 关闭popup窗口以便观察页面
      window.close();
      
    } catch (error) {
      console.error('启动监控失败:', error);
      this.showError('启动监控失败，请重试');
    }
  }

  async stopMonitoring() {
    try {
      await chrome.runtime.sendMessage({
        type: 'STOP_MONITORING'
      });
      this.updateStatus();
    } catch (error) {
      console.error('停止监控失败:', error);
    }
  }

  async testNotification() {
    try {
      this.elements.testNotificationBtn.textContent = '诊断中...';
      this.elements.testNotificationBtn.disabled = true;

      // 详细诊断步骤
      const diagnostics = await this.performNotificationDiagnostics();
      
      if (diagnostics.canSendNotification) {
        // 发送测试通知消息给background script
        await chrome.runtime.sendMessage({
          type: 'TEST_NOTIFICATION'
        });
        
        this.showSuccess('测试通知已发送！如果仍未收到，请检查系统通知设置');
      } else {
        this.showError(`通知功能异常：${diagnostics.error}`);
        this.displayDiagnosticResults(diagnostics);
      }

    } catch (error) {
      console.error('测试通知失败:', error);
      this.showError('测试通知失败：' + error.message);
    } finally {
      this.elements.testNotificationBtn.textContent = '🔔 测试通知';
      this.elements.testNotificationBtn.disabled = false;
    }
  }

  async performNotificationDiagnostics() {
    const results = {
      canSendNotification: false,
      error: '',
      details: {}
    };

    try {
      // 1. 检查浏览器通知API支持
      if (!('Notification' in window)) {
        results.error = '浏览器不支持通知API';
        results.details.apiSupport = false;
        return results;
      }
      results.details.apiSupport = true;

      // 2. 检查Chrome扩展通知API
      if (!chrome.notifications) {
        results.error = 'Chrome扩展通知API不可用';
        results.details.chromeApiSupport = false;
        return results;
      }
      results.details.chromeApiSupport = true;

      // 3. 检查当前通知权限状态
      let permission = Notification.permission;
      results.details.currentPermission = permission;

      if (permission === 'denied') {
        results.error = '通知权限被拒绝，请在浏览器设置中手动开启';
        return results;
      }

      // 4. 如果权限是default，尝试请求权限
      if (permission === 'default') {
        console.log('请求通知权限...');
        permission = await Notification.requestPermission();
        results.details.requestedPermission = permission;
      }

      if (permission !== 'granted') {
        results.error = '无法获得通知权限';
        return results;
      }
      results.details.finalPermission = permission;

      // 5. 测试基础通知功能
      try {
        const testNotif = new Notification('测试通知', {
          body: '这是一个基础通知测试',
          tag: 'test',
          requireInteraction: false
        });
        
        // 3秒后关闭
        setTimeout(() => testNotif.close(), 3000);
        results.details.basicNotificationTest = true;
      } catch (basicError) {
        console.error('基础通知测试失败:', basicError);
        results.details.basicNotificationTest = false;
        results.details.basicNotificationError = basicError.message;
      }

      results.canSendNotification = true;

    } catch (error) {
      results.error = '诊断过程出错：' + error.message;
      results.details.diagnosticError = error.message;
    }

    return results;
  }

  displayDiagnosticResults(diagnostics) {
    console.log('通知诊断结果:', diagnostics);
    
    // 在弹窗中显示详细信息
    let diagnosticInfo = '诊断详情：\n';
    diagnosticInfo += `API支持: ${diagnostics.details.apiSupport ? '✓' : '✗'}\n`;
    diagnosticInfo += `Chrome API: ${diagnostics.details.chromeApiSupport ? '✓' : '✗'}\n`;
    diagnosticInfo += `权限状态: ${diagnostics.details.currentPermission}\n`;
    
    if (diagnostics.details.requestedPermission) {
      diagnosticInfo += `请求权限结果: ${diagnostics.details.requestedPermission}\n`;
    }
    
    if (diagnostics.details.basicNotificationTest !== undefined) {
      diagnosticInfo += `基础通知测试: ${diagnostics.details.basicNotificationTest ? '✓' : '✗'}\n`;
    }
    
    // 创建诊断信息显示区域
    const diagnosticDiv = document.createElement('div');
    diagnosticDiv.style.cssText = `
      background: rgba(255,255,255,0.1);
      padding: 10px;
      margin: 10px 0;
      border-radius: 5px;
      font-size: 11px;
      white-space: pre-line;
      max-height: 100px;
      overflow-y: auto;
    `;
    diagnosticDiv.textContent = diagnosticInfo;
    
    // 临时显示诊断信息
    this.elements.status.appendChild(diagnosticDiv);
    setTimeout(() => {
      if (diagnosticDiv.parentNode) {
        diagnosticDiv.parentNode.removeChild(diagnosticDiv);
      }
    }, 10000);
  }

  async runDiagnosis() {
    try {
      this.elements.diagnosisBtn.textContent = '诊断中...';
      this.elements.diagnosisBtn.disabled = true;
      this.elements.debugInfo.style.display = 'block';

      const diagnostics = await this.performComprehensiveDiagnosis();
      this.displayComprehensiveDiagnostics(diagnostics);

    } catch (error) {
      console.error('诊断失败:', error);
      this.elements.debugContent.textContent = '诊断失败: ' + error.message;
    } finally {
      this.elements.diagnosisBtn.textContent = '🔧 诊断问题';
      this.elements.diagnosisBtn.disabled = false;
    }
  }

  async performComprehensiveDiagnosis() {
    const results = {
      timestamp: new Date().toLocaleString(),
      browser: navigator.userAgent,
      chromeVersion: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || 'unknown',
      notifications: {},
      extension: {},
      permissions: {},
      errors: []
    };

    try {
      // 浏览器通知支持
      results.notifications.apiSupported = 'Notification' in window;
      results.notifications.permission = Notification.permission;
      
      // Chrome扩展API
      results.extension.notificationsApi = !!chrome.notifications;
      results.extension.storageApi = !!chrome.storage;
      results.extension.runtimeApi = !!chrome.runtime;
      
      // 尝试获取扩展权限
      if (chrome.permissions) {
        const permissions = await chrome.permissions.getAll();
        results.permissions.declared = permissions.permissions;
        results.permissions.origins = permissions.origins;
      }

      // 测试storage
      try {
        await chrome.storage.local.set({ test: 'value' });
        await chrome.storage.local.get('test');
        results.extension.storageWorking = true;
      } catch (storageError) {
        results.extension.storageWorking = false;
        results.errors.push('Storage API错误: ' + storageError.message);
      }

      // 测试runtime消息
      try {
        const response = await chrome.runtime.sendMessage({ type: 'PING' });
        results.extension.backgroundConnection = !!response;
      } catch (runtimeError) {
        results.extension.backgroundConnection = false;
        results.errors.push('Background连接错误: ' + runtimeError.message);
      }

      // 系统信息
      results.system = {
        platform: navigator.platform,
        language: navigator.language,
        onLine: navigator.onLine
      };

    } catch (error) {
      results.errors.push('诊断过程错误: ' + error.message);
    }

    return results;
  }

  displayComprehensiveDiagnostics(diagnostics) {
    let output = `=== 通知诊断报告 ===\n`;
    output += `时间: ${diagnostics.timestamp}\n`;
    output += `Chrome版本: ${diagnostics.chromeVersion}\n\n`;
    
    output += `🔔 通知功能:\n`;
    output += `  API支持: ${diagnostics.notifications.apiSupported ? '✓' : '✗'}\n`;
    output += `  权限状态: ${diagnostics.notifications.permission}\n\n`;
    
    output += `🔧 扩展API:\n`;
    output += `  通知API: ${diagnostics.extension.notificationsApi ? '✓' : '✗'}\n`;
    output += `  存储API: ${diagnostics.extension.storageApi ? '✓' : '✗'}\n`;
    output += `  运行时API: ${diagnostics.extension.runtimeApi ? '✓' : '✗'}\n`;
    output += `  存储功能: ${diagnostics.extension.storageWorking ? '✓' : '✗'}\n`;
    output += `  后台连接: ${diagnostics.extension.backgroundConnection ? '✓' : '✗'}\n\n`;
    
    if (diagnostics.permissions.declared) {
      output += `📋 声明权限: ${diagnostics.permissions.declared.join(', ')}\n\n`;
    }
    
    if (diagnostics.errors.length > 0) {
      output += `❌ 发现问题:\n`;
      diagnostics.errors.forEach(error => {
        output += `  • ${error}\n`;
      });
      output += `\n`;
    }
    
    output += `💡 建议解决方案:\n`;
    
    if (diagnostics.notifications.permission !== 'granted') {
      output += `  1. 在chrome://settings/content/notifications 中开启通知\n`;
      output += `  2. 确保扩展在chrome://extensions/ 中有通知权限\n`;
    }
    
    if (!diagnostics.extension.backgroundConnection) {
      output += `  3. 重新加载扩展程序\n`;
      output += `  4. 检查扩展是否正确安装\n`;
    }
    
    output += `  5. 重启浏览器\n`;
    output += `  6. 检查系统通知设置\n`;

    this.elements.debugContent.textContent = output;
    console.log('诊断结果:', diagnostics);
  }

  async testDetection() {
    try {
      this.elements.testDetectionBtn.textContent = '检测中...';
      this.elements.testDetectionBtn.disabled = true;
      this.elements.debugInfo.style.display = 'block';

      // 获取当前活跃标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('ehall.csu.edu.cn')) {
        this.elements.debugContent.textContent = '❌ 请先打开中南大学场馆预约页面';
        return;
      }

      console.log('🔍 开始测试检测功能，标签页ID:', tab.id);
      
      // 发送检测测试消息
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'TEST_DETECTION'
      });
      
      let output = '=== 检测测试结果 ===\n';
      output += `页面URL: ${tab.url}\n`;
      output += `页面标题: ${tab.title}\n\n`;
      
      if (response && response.results) {
        const results = response.results;
        output += `扫描元素总数: ${results.totalElements}\n`;
        output += `包含"可预约"的元素: ${results.keywordMatches}\n`;
        output += `有效时段数量: ${results.validSlots}\n`;
        output += `排除的误识别: ${results.excludedCount}\n\n`;
        
        if (results.validSlots > 0) {
          output += `✅ 检测成功！发现 ${results.validSlots} 个有效可预约时段\n`;
          output += `已触发通知流程\n\n`;
        } else if (results.keywordMatches > 0) {
          output += `⚠️ 发现 ${results.keywordMatches} 个"可预约"，但都被过滤掉了\n`;
          output += `可能是"学生个人预约"等无效文本\n\n`;
        } else {
          output += `❌ 未在页面中发现"可预约"关键词\n`;
          output += `页面可能还没有可预约的时段\n\n`;
        }
        
        if (results.excludedTexts && results.excludedTexts.length > 0) {
          output += `被排除的文本:\n`;
          results.excludedTexts.forEach(text => {
            output += `  • ${text}\n`;
          });
        }
        
        if (results.validTexts && results.validTexts.length > 0) {
          output += `\n有效的可预约文本:\n`;
          results.validTexts.slice(0, 5).forEach(text => {
            output += `  • ${text}\n`;
          });
          if (results.validTexts.length > 5) {
            output += `  ... 还有 ${results.validTexts.length - 5} 个时段\n`;
          }
        }
      } else {
        output += '❌ 无法获取检测结果，可能页面未正确加载或不支持检测';
      }

      this.elements.debugContent.textContent = output;

    } catch (error) {
      console.error('测试检测失败:', error);
      this.elements.debugContent.textContent = '❌ 测试检测失败: ' + error.message;
    } finally {
      this.elements.testDetectionBtn.textContent = '🔍 测试检测';
      this.elements.testDetectionBtn.disabled = false;
    }
  }

  async checkNotificationPermission() {
    // 检查通知权限状态
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        return 'granted';
      } else if (Notification.permission === 'denied') {
        return 'denied';
      } else {
        // 请求权限
        const permission = await Notification.requestPermission();
        return permission;
      }
    }
    return 'not-supported';
  }

  showSuccess(message) {
    // 显示成功信息
    const originalText = this.elements.statusText.textContent;
    const originalBackground = this.elements.status.style.background;
    
    this.elements.statusText.textContent = message;
    this.elements.status.style.background = 'rgba(76, 175, 80, 0.3)';
    
    setTimeout(() => {
      this.elements.statusText.textContent = originalText;
      this.elements.status.style.background = originalBackground;
    }, 3000);
  }

  async checkNow() {
    try {
      this.elements.checkNowBtn.textContent = '检查中...';
      this.elements.checkNowBtn.disabled = true;

      // 获取当前活跃标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab.url.includes('ehall.csu.edu.cn')) {
        console.log('🔍 开始立即检查，标签页ID:', tab.id);
        
        // 在目标页面，发送检查消息
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'CHECK_NOW'
        });
        
        console.log('✅ 检查消息发送成功:', response);
        
        // 检查完成后，更新状态以获取最新的页面信息（包括日期）
        await this.updateStatus();
        
        // 显示检查完成提示
        this.showSuccess('页面检查完成！如有可约时段会自动通知');
        
      } else {
        this.showError('请先打开网球场预约页面');
      }

    } catch (error) {
      console.error('立即检查失败:', error);
      if (error.message.includes('Could not establish connection')) {
        this.showError('页面连接失败，请刷新页面后重试');
      } else {
        this.showError('检查失败：' + error.message);
      }
    } finally {
      this.elements.checkNowBtn.textContent = '🔍 立即检查';
      this.elements.checkNowBtn.disabled = false;
    }
  }

  async openTargetPage() {
    try {
      // 打开多个常用的预约页面供用户选择
      const reservationUrls = [
        'https://ehall.csu.edu.cn/v2/reserve/reserveDetail?id=57', // 网球场
        'https://ehall.csu.edu.cn/v2/reserve/reserveDetail?id=56'  // 其他场地
      ];
      
      // 先打开主要的预约页面
      await chrome.tabs.create({ 
        url: reservationUrls[0]
      });
      
      // 关闭弹窗
      window.close();
    } catch (error) {
      console.error('打开页面失败:', error);
    }
  }

  formatTime(timeString) {
    try {
      const date = new Date(timeString);
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '未知';
    }
  }

  showError(message) {
    // 临时显示错误信息
    const originalText = this.elements.statusText.textContent;
    this.elements.statusText.textContent = message;
    this.elements.status.style.background = 'rgba(244, 67, 54, 0.3)';
    
    setTimeout(() => {
      this.elements.statusText.textContent = originalText;
      this.updateStatus();
    }, 3000);
  }

  // 监听来自background的消息
  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'STATUS_UPDATE':
        this.updateStatus();
        break;
      
      case 'SLOTS_FOUND':
        // 可预约时段已找到
        break;
    }
  }
}

// 初始化弹窗控制器
document.addEventListener('DOMContentLoaded', () => {
  window.popupController = new PopupController();
  
  // 监听来自background的消息
  if (chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      window.popupController.handleMessage(message, sender, sendResponse);
    });
  }
});

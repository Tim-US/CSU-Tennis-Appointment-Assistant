// 后台服务脚本 - 处理通知和数据存储
class TennisMonitor {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = 30000; // 30秒检查一次
    this.lastStatus = {};
    this.userLastActivity = Date.now(); // 用户最后活动时间
    this.minInactiveTime = 10000; // 用户无活动10秒后才刷新
    this.monitoringCount = 0; // 新增：监测次数
    this.monitorDate = 'tomorrow'; // 新增：默认监控明天的场地
    this.currentPageDate = null; // 新增：用于存储从页面读取的当前日期
    this.currentPageInfo = null; // 新增：存储当前页面信息
  }

  // 初始化扩展
  init() {
    console.log('🎾 网球场监控助手已启动');
    this.restoreMonitoringCount(); // 新增：恢复监测次数
    
    // 监听来自content script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // 保持消息通道开放
    });

    // 监听扩展图标点击
    chrome.action.onClicked.addListener((tab) => {
      this.toggleMonitoring(tab);
    });

    // 新增：监听通知点击
    chrome.notifications.onClicked.addListener((notificationId) => {
      this.handleNotificationClick(notificationId);
    });

    // 新增：监听通知按钮点击
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      this.handleNotificationButtonClick(notificationId, buttonIndex);
    });

    // 恢复监控状态
    this.restoreMonitoringState();
  }

  // 新增：从 session storage 恢复监测次数
  async restoreMonitoringCount() {
    try {
      let monitoringCount = 0;
      
      // 检查 chrome.storage.session 是否可用
      if (chrome.storage.session) {
        console.log('📊 使用 chrome.storage.session API');
        const result = await chrome.storage.session.get(['monitoringCount']);
        monitoringCount = result.monitoringCount || 0;
      } else {
        console.log('📊 chrome.storage.session 不可用，使用替代方案');
        // 替代方案：使用 local storage 加上启动时间标记
        const result = await chrome.storage.local.get(['monitoringCount', 'sessionStartTime']);
        const currentSessionId = Date.now();
        
        // 如果没有会话标记或会话标记不同，说明是新的浏览器会话
        if (!result.sessionStartTime) {
          // 新会话：重置计数
          await chrome.storage.local.set({ 
            sessionStartTime: currentSessionId,
            monitoringCount: 0
          });
          monitoringCount = 0;
        } else {
          // 现有会话：保留计数
          monitoringCount = result.monitoringCount || 0;
        }
      }
      
      this.monitoringCount = monitoringCount;
      console.log('📊 恢复监测次数:', this.monitoringCount);
    } catch (error) {
      console.error('❌ 加载监测次数失败:', error);
      this.monitoringCount = 0;
    }
  }

  // 新增：增加并保存监测次数
  async incrementMonitoringCount() {
    this.monitoringCount++;
    try {
      // 优先使用 session storage
      if (chrome.storage.session) {
        await chrome.storage.session.set({ monitoringCount: this.monitoringCount });
      } else {
        // 回退到使用 local storage
        await chrome.storage.local.set({ monitoringCount: this.monitoringCount });
      }
      console.log('📈 监测次数已更新:', this.monitoringCount);
    } catch (error) {
      console.error('❌ 保存监测次数失败:', error);
    }
  }

  // 处理消息
  async handleMessage(message, sender, sendResponse) {
    console.log('🔄 Background收到消息:', message.type, message);
    
    try {
      switch (message.type) {
        case 'AVAILABLE_SLOTS_FOUND':
          console.log('📅 收到可预约时段消息，准备发送通知...');
          this.sendNotification(message.data);
          sendResponse({ success: true, message: '通知已发送' });
          break;
        
        case 'START_MONITORING':
          console.log('🚀 收到开始监控指令');
          try {
            // 获取当前活跃的标签页
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];
            
            if (currentTab) {
              console.log('✅ 找到活跃标签页，开始启动监控:', currentTab.url);
              await this.startMonitoring(currentTab);
              sendResponse({ success: true, message: '监控已启动' });
            } else {
              console.error('❌ START_MONITORING: 无法获取当前活跃标签页');
              sendResponse({ success: false, error: 'No active tab found' });
            }
          } catch (error) {
            console.error('❌ START_MONITORING: 获取标签页失败', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
        
        case 'STOP_MONITORING':
          this.stopMonitoring();
          sendResponse({ success: true });
          break;
        
        case 'GET_STATUS':
          sendResponse({ 
            isMonitoring: this.isMonitoring,
            lastCheck: this.lastCheck,
            checkInterval: this.checkInterval,
            monitoringCount: this.monitoringCount, // 返回监测次数
            monitorDate: this.monitorDate, // 新增：返回监控日期设置
            currentPageDate: this.currentPageDate, // 新增：返回页面当前日期
            currentPageInfo: this.currentPageInfo // 发送页面信息
          });
          break;
          
        case 'SET_CHECK_INTERVAL':
          console.log('⏰ 设置检查间隔:', message.interval);
          this.checkInterval = message.interval * 1000; // 转换为毫秒
          
          // 如果正在监控，重新设置定时器
          if (this.isMonitoring && this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = setInterval(() => {
              this.checkPage(false); // 定期检查时刷新页面
            }, this.checkInterval);
            console.log('✅ 检查间隔已更新为:', this.checkInterval + 'ms');
          }
          
          sendResponse({ success: true, interval: this.checkInterval });
          break;
        
        case 'TEST_NOTIFICATION':
          console.log('🧪 开始发送测试通知...');
          this.sendTestNotification();
          sendResponse({ success: true });
          break;
        
        case 'PING':
          sendResponse({ pong: true, timestamp: Date.now() });
          break;
          
        case 'EMERGENCY_FIX':
          console.log('🚨 执行应急修复...');
          this.emergencyFix();
          sendResponse({ success: true });
          break;
          
        case 'TEST_BASIC_NOTIFICATION':
          console.log('🧪 执行基础通知测试...');
          this.testBasicNotification();
          sendResponse({ success: true });
          break;
          
        case 'CHECK_PERMISSIONS':
          console.log('🔒 执行权限检查...');
          this.checkAllPermissions();
          sendResponse({ success: true });
          break;
          
        case 'SET_MONITOR_DATE':
          console.log('📅 设置监控日期:', message.date);
          this.monitorDate = message.date; // 'today' 或 'tomorrow'
          
          // 如果正在监控，可能需要触发一次检查以应用新的日期设置
          if (this.isMonitoring) {
            console.log('🔄 监控日期已更改，将在下次检查时应用');
          }
          
          sendResponse({ success: true, monitorDate: this.monitorDate });
          break;
          
        case 'USER_ACTIVITY':
          // 更新用户最后活动时间
          this.userLastActivity = message.timestamp || Date.now();
          sendResponse({ success: true });
          break;
          
        default:
          console.log('⚠️ 未知消息类型:', message.type);
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('❌ 处理消息时出错:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // 开始监控
  async startMonitoring(tab) {
    console.log('🔧 startMonitoring被调用，参数:', tab);
    
    if (this.isMonitoring) {
      console.log('⚠️ 监控已在运行中，跳过启动');
      return;
    }
    
    // 验证tab参数
    if (!tab || !tab.id) {
      console.error('❌ startMonitoring: 无效的tab参数', tab);
      throw new Error('无效的标签页参数');
    }
    
    console.log('✅ 开始启动监控，Tab ID:', tab.id, 'URL:', tab.url);
    
    this.isMonitoring = true;
    this.currentTab = tab;
    
    // 保存监控状态
    try {
      await chrome.storage.local.set({ 
        isMonitoring: true,
        tabId: tab.id,
        url: tab.url 
      });
      console.log('💾 监控状态已保存到存储');
    } catch (error) {
      console.error('❌ 保存监控状态失败:', error);
    }

    // 立即执行第一次检查
    console.log('🚀 立即执行第一次页面检查...');
    await this.checkPage(true); // 传入 true 跳过刷新

    // 设置定期检查
    this.monitorInterval = setInterval(() => {
      this.checkPage(false); // 定期检查时刷新页面
    }, this.checkInterval);

    console.log('✅ 监控已启动，检查间隔:', this.checkInterval + 'ms');
    this.updateBadge('ON');
  }

  // 停止监控
  async stopMonitoring() {
    this.isMonitoring = false;
    this.currentPageDate = null; // 停止时重置
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    await chrome.storage.local.set({ isMonitoring: false });
    this.updateBadge('');
    console.log('停止监控');
  }

  // 简化的页面检查逻辑
  async checkPage(skipReload = false) {
    if (!this.isMonitoring || !this.currentTab) {
      return;
    }

    try {
      console.log('🔄 [1/5] 开始检查页面...');

      // 简化刷新逻辑
      if (!skipReload) {
        const now = Date.now();
        const timeSinceLastActivity = now - this.userLastActivity;
        
        if (timeSinceLastActivity >= this.minInactiveTime) {
          console.log('🔄 [2/5] 刷新页面...');
          await chrome.tabs.reload(this.currentTab.id);
          // --- 核心修复：增加稳定等待时间 ---
          // 等待5秒，让页面的Vue等框架充分加载，避免脚本冲突
          console.log('⏳ 等待5秒，确保页面完全加载...');
          await new Promise(resolve => setTimeout(resolve, 5000)); 
        } else {
          console.log('⚠️ 用户活跃，跳过刷新');
        }
      }

      // --- 新的检查流程 ---

      // 1. 读取页面信息（不点击）
      console.log('🔄 [3/5] 读取当前页面信息...');
      const pageInfo = await this.executeScript(readPageInfo);
      this.currentPageInfo = pageInfo; // 存储页面信息

      if (!pageInfo) {
        console.log('⚠️ 无法读取页面信息，跳过本次检查');
        return;
      }
      console.log('📊 页面信息:', pageInfo);

      // 2. 决策：是否需要点击“后一天”
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      
      let needsClick = false;
      if (this.monitorDate === 'tomorrow' && pageInfo.date !== tomorrow) {
        console.log(`🗓️ 需要监控明天 (${tomorrow})，但页面当前是 (${pageInfo.date})，需要点击“后一天”`);
        needsClick = true;
      }

      // 3. 执行点击（如果需要）
      if (needsClick) {
        console.log('🔄 [4/5] 执行点击“后一天”...');
        const clickSuccess = await this.executeScript(clickNextDayButton);
        if (clickSuccess) {
          console.log('✅ 点击成功，强制等待5秒让页面加载...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // 点击后，再次读取信息
          console.log('🔄 [4.1/5] 再次读取页面信息...');
          const newPageInfo = await this.executeScript(readPageInfo);
          this.currentPageInfo = newPageInfo; // 更新页面信息
          console.log('📊 点击后新页面信息:', newPageInfo);
          
          // 检查是否有可预约时段
          if (newPageInfo && newPageInfo.slots.length > 0) {
            this.sendNotification({ slots: newPageInfo.slots, url: this.currentTab.url });
          }
        } else {
          console.log('⚠️ 点击“后一天”失败，检查当前页面的可预约时段');
          if (pageInfo.slots.length > 0) {
            this.sendNotification({ slots: pageInfo.slots, url: this.currentTab.url });
          }
        }
      } else {
        // 4. 不需要点击，直接检查当前页面的时段
        console.log('🔄 [4/5] 无需点击，直接检查当前页面时段');
        if (pageInfo.slots.length > 0) {
          this.sendNotification({ slots: pageInfo.slots, url: this.currentTab.url });
        }
      }

      // 5. 更新统计
      console.log('🔄 [5/5] 更新统计并完成检查');
      if (!skipReload) {
        await this.incrementMonitoringCount();
      }
      this.lastCheck = new Date().toLocaleString();

    } catch (error) {
      console.error('❌ 检查失败:', error.message);
      if (error.message.includes('No tab with id')) {
        console.log('🔴 标签页已关闭，停止监控');
        this.stopMonitoring();
      }
    }
  }

  // 辅助函数：执行脚本并返回结果
  async executeScript(func, args = []) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        func: func,
        args: args
      });
      return results?.[0]?.result;
    } catch (error) {
      console.error(`❌ 脚本执行失败 (${func.name}):`, error.message);
      if (error.message.includes('Cannot access a chrome-extension:// URL') || error.message.includes('chrome-extension://')) {
        console.log('🔄 检测到扩展页面，跳过');
      }
      return null;
    }
  }

  // 简化的用户活动监听器
  injectActivityListener() {
    if (window.tennisMonitorActivityListener) return;
    
    window.tennisMonitorActivityListener = true;
    
    const updateActivity = () => {
      try {
        chrome.runtime.sendMessage({
          type: 'USER_ACTIVITY',
          timestamp: Date.now()
        });
      } catch (e) {
        // 忽略错误
      }
    };
    
    // 只监听关键活动
    ['click', 'keydown'].forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
  }

  // 简化的通知逻辑
  sendNotification(data) {
    if (!data?.slots || data.slots.length === 0) {
      return;
    }

    const title = `🎾 网球场监控助手`;
    const message = `发现可用场地，快来预约吧！`;

    const options = {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: title,
      message: message,
      priority: 2,
      requireInteraction: true
    };

    const notificationId = 'tennis-' + Date.now();
    
    chrome.notifications.create(notificationId, options, (createdId) => {
      if (chrome.runtime.lastError) {
        console.log('⚠️ 通知创建失败');
      } else {
        console.log('✅ 通知已发送');
        // 保存URL用于点击处理
        chrome.storage.local.set({ [notificationId]: data.url });
      }
    });
  }

  // 发送测试通知
  sendTestNotification() {
    console.log('🔔 正在发送测试通知...');
    const testNotificationOptions = {
      type: 'basic',
      iconUrl: 'icons/icon128.png', // 修正：使用 .png 文件
      title: '✅ 测试通知',
      message: '如果您看到此消息，说明通知功能正常！',
      priority: 2
    };
    chrome.notifications.create('test_notification_' + Date.now(), testNotificationOptions, function(notificationId) {
      if (chrome.runtime.lastError) {
        console.error('❌ 测试通知创建失败:', chrome.runtime.lastError.message);
      } else {
        console.log('✅ 测试通知发送成功, ID:', notificationId);
      }
    });
  }

  // 简化通知点击处理
  async handleNotificationClick(notificationId) {
    chrome.notifications.clear(notificationId);
    
    if (notificationId.startsWith('tennis-')) {
      try {
        const result = await chrome.storage.local.get(notificationId);
        const url = result[notificationId];
        if (url) {
          await chrome.tabs.create({ url: url, active: true });
          await chrome.storage.local.remove(notificationId);
        }
      } catch (error) {
        console.log('⚠️ 处理通知点击失败');
      }
    }
  }

  // 新增：处理通知按钮点击
  async handleNotificationButtonClick(notificationId, buttonIndex) {
    console.log(`🔘 通知按钮被点击: ${notificationId}, 按钮索引: ${buttonIndex}`);
    if (notificationId.startsWith('tennis-slot-')) {
        if (buttonIndex === 0) { // "立即查看"
            await this.handleNotificationClick(notificationId); // 复用点击逻辑
        } else if (buttonIndex === 1) { // "停止监控"
            console.log('🛑 通过通知按钮停止监控');
            this.stopMonitoring();
            chrome.notifications.clear(notificationId);
        }
    }
  }

  // 检查通知权限
  async checkNotificationPermission() {
    if (typeof Notification !== 'undefined') {
      return Notification.permission;
    }
    return 'unknown';
  }

  // 更新扩展图标徽章
  updateBadge(text) {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ 
      color: text === 'ON' ? '#4CAF50' : '#FF5722' 
    });
  }

  // 彻底禁用状态恢复，强制停止状态
  async restoreMonitoringState() {
    try {
      // 只恢复用户配置，绝不恢复运行状态
      const result = await chrome.storage.local.get(['checkInterval', 'monitorDate']);
      
      if (result.checkInterval > 0) {
        this.checkInterval = result.checkInterval;
        console.log('⚙️ 恢复检查间隔设置:', this.checkInterval);
      }
      if (result.monitorDate) {
        this.monitorDate = result.monitorDate;
        console.log('⚙️ 恢复监控日期设置:', this.monitorDate);
      }
      
      // 强制停止所有监控活动
      this.isMonitoring = false;
      this.monitorInterval = null;
      this.currentTab = null;
      this.currentPageInfo = null;
      this.lastCheck = 'N/A';
      
      // 清理存储中的运行状态
      await chrome.storage.local.set({ 
        isMonitoring: false, 
        tabId: null 
      });
      
      this.updateBadge('');
      console.log('✅ 插件强制停止，等待手动启动');
      
    } catch (error) {
      console.error('❌ 状态重置失败:', error);
      // 即使出错也要确保停止状态
      this.isMonitoring = false;
      this.updateBadge('');
    }
  }

  // 切换监控状态
  async toggleMonitoring(tab) {
    if (this.isMonitoring) {
      this.stopMonitoring();
    } else {
      this.startMonitoring(tab);
    }
  }

  // 简化的应急修复
  emergencyFix() {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '应急修复',
      message: '正在测试通知系统...'
    });
  }
}

// ----------------------------------------------------------------------------------
// 注入页面的独立函数 (必须无外部依赖)
// ----------------------------------------------------------------------------------

/**
 * 函数1：只读取页面信息，不执行任何点击操作
 */
function readPageInfo() {
  // 内部辅助函数：获取页面当前显示的日期
  const getCurrentPageDate = () => {
    // 优先策略：查找包含 "yyyy-mm-dd" 格式的 input 或 value
    const dateElements = document.querySelectorAll('input[value*="-"], [data-date]');
    for (const el of dateElements) {
      const dateStr = el.value || el.dataset.date || '';
      const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    
    // 备用策略：在整个页面文本中模糊匹配日期格式
    const textMatch = (document.body.textContent || '').match(/(\d{4}-\d{2}-\d{2})/);
    if (textMatch) return textMatch[1];
    
    return null;
  };

  // 内部辅助函数：查找可预约时段
  const findAvailableSlots = () => {
    const slots = [];
    const elements = document.querySelectorAll('div, td, span, a, li');
    
    for (const el of elements) {
      const text = (el.textContent || '').trim();
      if (text.includes('可预约') && 
          !text.includes('不可预约') && 
          !text.includes('已选择') &&
          !text.includes('请选择') &&
          text.length > 5 && text.length < 100) {
        
        if (/\d{1,2}:\d{2}/.test(text) || /[场馆厅]\d*/.test(text)) {
          slots.push({ text: text });
        }
      }
    }
    return slots;
  };

  try {
    if (document.readyState !== 'complete') {
      return null;
    }
    const date = getCurrentPageDate();
    const slots = findAvailableSlots();
    
    return {
      date: date,
      slots: slots,
      url: location.href,
      title: document.title
    };
  } catch (e) {
    console.error('❌ readPageInfo 执行失败:', e);
    return null;
  }
}

/**
 * 函数2：只负责查找并点击“后一天”按钮
 */
function clickNextDayButton() {
  try {
    let nextDayButton = null;
    const buttons = document.querySelectorAll('button, span, div, a');

    // 查找策略
    const strategies = [
      (el) => (el.textContent || '').trim() === '后一天',
      (el) => (el.textContent || '').includes('后') && (el.textContent || '').includes('天'),
      (el) => (el.getAttribute('aria-label') || '').includes('后一天'),
    ];

    for (const strategy of strategies) {
      for (const btn of buttons) {
        if (strategy(btn)) {
          nextDayButton = btn;
          break;
        }
      }
      if (nextDayButton) break;
    }

    if (nextDayButton) {
      console.log('✅ 找到“后一天”按钮，准备点击:', nextDayButton);
      nextDayButton.click();
      return true;
    } else {
      console.log('⚠️ 未找到“后一天”按钮');
      return false;
    }
  } catch (e) {
    console.error('❌ clickNextDayButton 执行失败:', e);
    return false;
  }
}


// ----------------------------------------------------------------------------------
// (原有的 inJectedFunction 已被上面的两个新函数替代，可以删除)
// ----------------------------------------------------------------------------------

// 初始化监控器
const monitor = new TennisMonitor();
monitor.init();

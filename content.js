// 内容脚本 - 在目标网页中运行
class PageMonitor {
  constructor() {
    this.observer = null;
    this.lastCheck = 0;
    this.checkThrottle = 2000; // 2秒防抖
  }

  // 初始化
  init() {
    console.log('🎾 网球场监控内容脚本已加载，当前页面:', window.location.href);
    
    // 检查是否为预约相关页面
    if (this.isReservationPage()) {
      console.log('✅ 确认为预约页面，启动监控功能');
      
      // 首先处理可能存在的弹窗
      this.handleInitialPopups();
      
      // 延迟启动主要功能，确保弹窗处理完成
      setTimeout(() => {
        // 立即检查一次
        this.checkAvailability();
        
        // 设置页面变化监听
        this.setupMutationObserver();
        
        // 添加页面标识
        this.addPageIndicator();
      }, 2000);
      
      // 监听来自background的消息
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true;
      });
    } else {
      console.log('⚠️ 非预约页面，跳过监控功能');
    }
  }

  // 检查是否为预约页面
  isReservationPage() {
    const url = window.location.href;
    const keywords = ['reserve', '预约', 'booking'];
    return keywords.some(keyword => url.includes(keyword)) || 
           document.title.includes('预约') ||
           document.body.textContent.includes('可预约');
  }

  // 设置DOM变化监听器
  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      
      mutations.forEach((mutation) => {
        // 检查是否有文本内容变化
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          shouldCheck = true;
        }
      });

      if (shouldCheck) {
        this.throttledCheck();
      }
    });

    // 开始观察整个文档的变化
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // 防抖检查
  throttledCheck() {
    const now = Date.now();
    if (now - this.lastCheck > this.checkThrottle) {
      this.lastCheck = now;
      setTimeout(() => this.checkAvailability(), 100);
    }
  }

  // 检查可用性
  async checkAvailability() {
    console.log('开始检查页面可用性...');
    const availableSlots = this.findAvailableSlots();
    
    console.log(`检查完成，发现 ${availableSlots.length} 个可预约时段:`, availableSlots);
    
    if (availableSlots.length > 0) {
      console.log('🎾 发现可预约时段，准备发送系统通知:', availableSlots);
      
      // 构建消息数据
      const messageData = {
        type: 'AVAILABLE_SLOTS_FOUND',
        data: {
          slots: availableSlots,
          url: window.location.href,
          timestamp: new Date().toLocaleString(),
          pageTitle: document.title
        }
      };
      
      console.log('📤 发送消息给background script:', messageData);
      
      // 发送消息给background script，触发系统通知
      try {
        const response = await chrome.runtime.sendMessage(messageData);
        console.log('✅ 消息发送成功，background响应:', response);
        
        if (response && response.success) {
          console.log('🔔 系统通知将由后台脚本处理');
        } else {
          console.warn('⚠️ Background script响应异常:', response);
        }
      } catch (error) {
        console.error('❌ 发送消息失败:', error);
        
        // 重试机制
        console.log('🔄 尝试重新发送消息...');
        setTimeout(async () => {
          try {
            const retryResponse = await chrome.runtime.sendMessage(messageData);
            console.log('✅ 重试消息发送成功:', retryResponse);
          } catch (retryError) {
            console.error('❌ 重试也失败:', retryError);
          }
        }, 2000);
      }

      // 高亮显示可约时段
      this.highlightAvailableSlots(availableSlots);
      
    } else {
      console.log('未发现"可预约"关键词');
    }
  }

  // 查找可约时段
  findAvailableSlots() {
    const slots = [];
    const keywords = ['可预约']; // 只检测有效关键词
    
    // 需要排除的误识别文本
    const excludeTexts = [
      '学生个人预约',
      '可预约人数',
      '预约说明',
      '预约须知',
      '预约规则',
      '可预约时间',
      '如何预约'
    ];
    
    console.log('开始查找关键词:', keywords);
    console.log('排除误识别文本:', excludeTexts);

    // 查找所有可能包含预约信息的元素
    const selectors = [
      'td', 'div', 'span', 'button', 'a', 'p',
      '.time-slot', '.slot', '.available',
      '[class*="time"]', '[class*="slot"]', '[class*="book"]'
    ];

    let totalElements = 0;
    let keywordMatches = 0;
    let validSlots = 0;

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      totalElements += elements.length;
      
      elements.forEach(element => {
        const text = element.textContent.trim();
        
        // 检查是否包含"可预约"
        if (text.includes('可预约') && text.length < 200) {
          keywordMatches++;
          
          // 检查是否为误识别文本
          const isExcluded = excludeTexts.some(excludeText => text.includes(excludeText));
          
          if (!isExcluded) {
            validSlots++;
            console.log(`✅ 找到有效"可预约"时段: "${text}"`);
            
            // 尝试获取时间信息
            const timeInfo = this.extractTimeInfo(element);
            
            slots.push({
              text: text,
              timeInfo: timeInfo,
              element: element,
              position: this.getElementPosition(element),
              selector: selector
            });
          } else {
            console.log(`⚠️ 排除误识别文本: "${text}"`);
          }
        }
      });
    });

    console.log(`扫描了 ${totalElements} 个元素，找到 ${keywordMatches} 个"可预约"匹配，其中 ${validSlots} 个有效时段`);
    
    const uniqueSlots = this.deduplicateSlots(slots);
    console.log(`去重后剩余 ${uniqueSlots.length} 个有效时段`);
    
    return uniqueSlots;
  }

  // 提取时间信息
  extractTimeInfo(element) {
    const timePatterns = [
      /(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/g,
      /(\d{1,2})点(\d{2})分?-(\d{1,2})点(\d{2})分?/g,
      /(\d{1,2}):(\d{2})/g
    ];

    let timeInfo = null;
    const parentElement = element.closest('tr, .row, .time-container') || element.parentElement;
    const searchText = parentElement ? parentElement.textContent : element.textContent;

    timePatterns.forEach(pattern => {
      const matches = [...searchText.matchAll(pattern)];
      if (matches.length > 0 && !timeInfo) {
        timeInfo = matches[0][0];
      }
    });

    return timeInfo;
  }

  // 获取元素位置
  getElementPosition(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  // 去重
  deduplicateSlots(slots) {
    const unique = [];
    const seen = new Set();

    slots.forEach(slot => {
      const key = slot.text + (slot.timeInfo || '');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(slot);
      }
    });

    return unique;
  }

  // 高亮显示可约时段
  highlightAvailableSlots(slots) {
    // 移除之前的高亮
    document.querySelectorAll('.tennis-monitor-highlight').forEach(el => {
      el.classList.remove('tennis-monitor-highlight');
    });

    // 添加样式
    if (!document.getElementById('tennis-monitor-styles')) {
      const style = document.createElement('style');
      style.id = 'tennis-monitor-styles';
      style.textContent = `
        .tennis-monitor-highlight {
          background-color: #ffeb3b !important;
          border: 2px solid #ff5722 !important;
          border-radius: 4px !important;
          animation: tennis-monitor-pulse 2s infinite;
        }
        
        @keyframes tennis-monitor-pulse {
          0% { box-shadow: 0 0 0 0 rgba(255, 87, 34, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(255, 87, 34, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 87, 34, 0); }
        }
        
        .tennis-monitor-indicator {
          position: fixed;
          top: 10px;
          right: 10px;
          background: linear-gradient(135deg, #4CAF50, #2196F3);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: bold;
          z-index: 10000;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          border: 2px solid white;
          animation: tennis-monitor-badge-pulse 3s ease-in-out;
        }
        
        @keyframes tennis-monitor-badge-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `;
      document.head.appendChild(style);
    }

    // 高亮每个找到的时段
    slots.forEach(slot => {
      if (slot.element) {
        slot.element.classList.add('tennis-monitor-highlight');
      }
    });

    console.log(`已高亮显示 ${slots.length} 个可约时段`);
  }

  // 添加页面指示器
  addPageIndicator() {
    // 移除已存在的指示器
    const existing = document.getElementById('tennis-monitor-indicator');
    if (existing) {
      existing.remove();
    }

    const indicator = document.createElement('div');
    indicator.id = 'tennis-monitor-indicator';
    indicator.className = 'tennis-monitor-indicator';
    indicator.innerHTML = '🎾 监控中';
    indicator.title = '网球场监控助手正在监控此页面';
    
    document.body.appendChild(indicator);

    // 3秒后自动隐藏
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.style.opacity = '0.3';
      }
    }, 3000);
  }

  // 处理消息
  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'CHECK_NOW':
        this.checkAvailability().catch(error => {
          console.error('手动检查失败:', error);
        });
        sendResponse({ success: true });
        break;
      
      case 'TEST_DETECTION':
        const results = this.performDetectionTest();
        sendResponse({ success: true, results: results });
        break;
      
      case 'GET_PAGE_INFO':
        sendResponse({
          url: window.location.href,
          title: document.title,
          availableSlots: this.findAvailableSlots().length
        });
        break;
    }
  }

  // 执行检测测试
  performDetectionTest() {
    console.log('开始执行检测测试...');
    
    const testResults = {
      timestamp: new Date().toLocaleString(),
      url: window.location.href,
      pageTitle: document.title,
      isReservationPage: this.isReservationPage()
    };

    // 查找关键词
    const slots = this.findAvailableSlots();
    testResults.detectionResults = {
      totalSlots: slots.length,
      slots: slots.map(slot => ({
        text: slot.text,
        timeInfo: slot.timeInfo,
        position: slot.position
      }))
    };

    // 页面元素统计
    const allElements = document.querySelectorAll('*');
    const textElements = Array.from(allElements).filter(el => 
      el.textContent && el.textContent.trim().length > 0
    );
    
    testResults.pageStats = {
      totalElements: allElements.length,
      textElements: textElements.length,
      hasAvailableKeyword: textElements.some(el => el.textContent.includes('可预约'))
    };

    console.log('检测测试完成:', testResults);
    return testResults;
  }

  // 处理页面初始加载时的弹窗
  handleInitialPopups() {
    console.log('🔍 检查页面初始弹窗...');
    
    const handlePopup = () => {
      let buttonClicked = false;
      
      // 查找各种可能的弹窗
      const popupSelectors = [
        '.modal', '.popup', '.dialog', '.overlay', '.mask',
        '.ant-modal', '.el-dialog', '[role="dialog"]', '.layui-layer'
      ];
      
      let hasPopup = false;
      popupSelectors.forEach(selector => {
        const popup = document.querySelector(selector);
        if (popup && popup.offsetParent !== null) {
          hasPopup = true;
          console.log('🎯 检测到弹窗:', selector);
        }
      });
      
      // 查找确认按钮
      const allButtons = document.querySelectorAll('button, .btn, input[type="button"], input[type="submit"], a[role="button"]');
      
      allButtons.forEach(button => {
        if (buttonClicked) return;
        
        const text = (button.textContent || button.value || button.innerText || '').trim();
        const isVisible = button.offsetParent !== null && 
                         getComputedStyle(button).display !== 'none' && 
                         getComputedStyle(button).visibility !== 'hidden';
        
        const confirmTexts = ['确认', '确定', '同意', '开始', '继续', '好的', 'OK', '是'];
        const shouldClick = confirmTexts.some(confirmText => text.includes(confirmText));
        
        if (shouldClick && isVisible) {
          console.log('🖱️ content.js找到确认按钮，准备点击:', text);
          try {
            const event = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            button.dispatchEvent(event);
            button.click();
            buttonClicked = true;
            console.log('✅ content.js成功点击确认按钮:', text);
          } catch (e) {
            console.error('❌ content.js点击按钮时出错:', e);
          }
        }
      });
      
      if (!buttonClicked && !hasPopup) {
        console.log('ℹ️ content.js未发现需要处理的弹窗');
      }
    };
    
    // 多次尝试处理弹窗，确保稳定性
    setTimeout(handlePopup, 500);
    setTimeout(handlePopup, 1500);
    setTimeout(handlePopup, 3000);
  }
}

// 初始化监控器
const pageMonitor = new PageMonitor();

// 页面加载完成后启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    pageMonitor.init();
  });
} else {
  pageMonitor.init();
}

// 全局暴露，便于调试
window.tennisMonitor = pageMonitor;

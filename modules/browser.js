const { chromium } = require('playwright');
const Utils = require('./utils');

class BrowserManager {
  constructor() {
    this.browser = null;
    this.page = null;
    this.config = Utils.loadConfig();
  }

  async init(headless = false) {
    Utils.log('info', `🚀 启动浏览器 (${headless ? '无头模式' : '可见模式'})...`);
    
    this.browser = await chromium.launch({
      headless: headless,
      slowMo: headless ? 0 : 200
    });

    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      geolocation: {
        latitude: this.config.location.latitude,
        longitude: this.config.location.longitude
      },
      permissions: ['geolocation']
    });

    this.page = await context.newPage();
    this.page.setDefaultTimeout(30000);

    // 监听请求
    this.page.on('request', request => {
      if (request.url().includes('check4CheckBtn')) {
        Utils.log('warning', '🚨 检测到打卡请求:', request.url());
      }
    });

    // 监听控制台日志（可选）
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        Utils.log('debug', '浏览器错误:', msg.text());
      }
    });

    Utils.log('success', '浏览器初始化完成');
    return this.page;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      Utils.log('info', '🔒 浏览器已关闭');
    }
  }

  getPage() {
    return this.page;
  }
}

module.exports = BrowserManager;
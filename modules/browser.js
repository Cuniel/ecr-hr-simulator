const { chromium } = require('playwright');
const fs = require('fs');
const Utils = require('./utils');

class BrowserManager {
  constructor() {
    this.browser = null;
    this.page = null;
    this.config = Utils.loadConfig();
  }

  async init(headless = false) {
    Utils.log('info', `🚀 启动浏览器 (${headless ? '无头模式' : '可见模式'})...`);

    const executablePath = this.getChromiumExecutablePath();
    if (executablePath) {
      Utils.log('info', `🌐 使用 Chromium: ${executablePath}`);
    }

    this.browser = await chromium.launch({
      headless: headless,
      slowMo: headless ? 0 : 200,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-features=site-per-process'
      ]
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
        Utils.log('warning', '🚨 检测到操作请求:', request.url());
      }
    });

    // 监听浏览器控制台日志，统一写入执行 trace
    this.page.on('console', async msg => {
      const level = msg.type() === 'error' ? 'error' : msg.type() === 'warning' ? 'warning' : 'debug';
      const values = [];
      for (const arg of msg.args()) {
        try {
          values.push(await arg.jsonValue());
        } catch {
          values.push(String(arg));
        }
      }
      Utils.log(level, `浏览器Console[${msg.type()}]: ${msg.text()}`, ...values);
    });

    this.page.on('pageerror', error => {
      Utils.log('error', '浏览器页面异常:', error);
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

  getChromiumExecutablePath() {
    const candidates = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      process.env.CHROME_BIN,
      process.env.CHROME_PATH,
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ].filter(Boolean);

    return candidates.find(candidate => fs.existsSync(candidate));
  }
}

module.exports = BrowserManager;

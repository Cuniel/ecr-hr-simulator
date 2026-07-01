const { chromium } = require('playwright');
const fs = require('fs');
const Utils = require('./utils');

class BrowserManager {
  constructor(config = Utils.loadConfig()) {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.config = config;
    this.profileDir = null;
  }

  async init(headless = false, config = this.config) {
    this.config = config;
    const location = this.getLocation();
    Utils.log('info', `🚀 启动浏览器 (${headless ? '无头模式' : '可见模式'})...`);

    const executablePath = this.getChromiumExecutablePath();
    if (executablePath) {
      Utils.log('info', `🌐 使用 Chromium: ${executablePath}`);
    }

    this.profileDir = this.prepareChromiumRuntime();

    this.context = await chromium.launchPersistentContext(this.profileDir, {
      headless: headless,
      slowMo: headless ? 0 : 200,
      executablePath,
      chromiumSandbox: false,
      timeout: 60000,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      geolocation: {
        latitude: location.latitude,
        longitude: location.longitude
      },
      permissions: ['geolocation'],
      env: {
        ...process.env,
        HOME: process.env.HOME || '/tmp',
        XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || '/tmp/.cache',
        XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || '/tmp/.config',
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '/tmp/runtime'
      },
      args: this.getChromiumArgs()
    });

    this.browser = this.context.browser();
    await this.context.setGeolocation({
      latitude: location.latitude,
      longitude: location.longitude
    });
    await this.context.grantPermissions(['geolocation']);

    this.page = this.context.pages()[0] || await this.context.newPage();
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
      if (level === 'debug' && process.env.DEBUG_BROWSER_CONSOLE !== '1') return;
      const values = [];
      for (const arg of msg.args()) {
        try {
          values.push(await arg.jsonValue());
        } catch {
          values.push(String(arg));
        }
      }
      Utils.log(level, `浏览器Console[${msg.type()}]: ${msg.text()}`, ...values.filter(value => value !== msg.text()));
    });

    this.page.on('pageerror', error => {
      Utils.log('error', '浏览器页面异常:', error);
    });

    Utils.log('success', '浏览器初始化完成');
    return this.page;
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.browser = null;
      Utils.log('info', '🔒 浏览器已关闭');
    } else if (this.browser) {
      await this.browser.close();
      this.browser = null;
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

  getLocation() {
    const location = this.config?.location || {};
    return {
      latitude: Number(location.latitude) || 31.24,
      longitude: Number(location.longitude) || 121.42
    };
  }

  prepareChromiumRuntime() {
    const profileDir = `/tmp/ecr-hr-simulator/chromium-profile-${process.pid}-${Date.now()}`;
    const dirs = [
      profileDir,
      '/tmp/ecr-hr-simulator/chromium-cache',
      '/tmp/ecr-hr-simulator/chromium-data',
      process.env.XDG_CACHE_HOME || '/tmp/.cache',
      process.env.XDG_CONFIG_HOME || '/tmp/.config',
      process.env.XDG_RUNTIME_DIR || '/tmp/runtime'
    ];

    for (const dir of dirs) {
      try {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.chmodSync(dir, 0o700);
      } catch (error) {
        Utils.log('warning', `创建 Chromium 运行目录失败: ${dir}`, error.message);
      }
    }

    return profileDir;
  }

  getChromiumArgs() {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-zygote',
      '--disable-features=site-per-process,Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
      '--data-path=/tmp/ecr-hr-simulator/chromium-data',
      '--disk-cache-dir=/tmp/ecr-hr-simulator/chromium-cache'
    ];

    if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV) {
      args.push('--single-process');
      Utils.log('info', '☁️ 检测到 Lambda 环境，启用 Lambda Chromium 参数');
    }

    return args;
  }
}

module.exports = BrowserManager;

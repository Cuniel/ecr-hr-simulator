const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const Utils = require('./utils');

class BrowserManager {
  constructor(config = Utils.loadConfig()) {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.config = config;
    this.profileDir = null;
    this.usesPersistentContext = false;
    this.chromiumProcess = null;
  }

  async init(headless = false, config = this.config) {
    this.config = config;
    const location = this.getLocation();
    const isLambda = this.isLambdaRuntime();
    const useHeadless = isLambda ? true : headless;
    Utils.log('info', `🚀 启动浏览器 (${useHeadless ? '无头模式' : '可见模式'})...`);

    this.profileDir = this.prepareChromiumRuntime();
    const env = {
      ...process.env,
      HOME: process.env.HOME || '/tmp',
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || '/tmp/.cache',
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || '/tmp/.config',
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '/tmp/runtime'
    };
    if (isLambda) {
      delete env.DBUS_SESSION_BUS_ADDRESS;
      delete env.DISPLAY;
    }
    const launchOptions = {
      headless: useHeadless,
      slowMo: useHeadless ? 0 : 200,
      chromiumSandbox: false,
      timeout: isLambda ? 60000 : 60000,
      env,
      args: this.getChromiumArgs({ isLambda })
    };
    const contextOptions = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      geolocation: {
        latitude: location.latitude,
        longitude: location.longitude
      },
      permissions: ['geolocation']
    };

    if (isLambda) {
      Utils.log('info', '检测到 Lambda 环境，使用 CDP 方式连接 Chromium');
      this.usesPersistentContext = false;
      launchOptions.executablePath = this.getLambdaChromiumExecutablePath();
      Utils.log('info', `Lambda Chromium executablePath: ${launchOptions.executablePath}`);
      this.browser = await this.launchChromiumOverCDP(launchOptions);
      this.context = await this.browser.newContext(contextOptions);
    } else {
      this.usesPersistentContext = true;
      this.context = await chromium.launchPersistentContext(this.profileDir, {
        ...launchOptions,
        ...contextOptions
      });
      this.browser = this.context.browser();
    }

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
      if (this.browser && !this.usesPersistentContext) {
        await this.browser.close();
      }
      this.browser = null;
      this.usesPersistentContext = false;
      this.closeChromiumProcess();
      Utils.log('info', '🔒 浏览器已关闭');
    } else if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.usesPersistentContext = false;
      this.closeChromiumProcess();
      Utils.log('info', '🔒 浏览器已关闭');
    } else {
      this.closeChromiumProcess();
    }
  }

  getPage() {
    return this.page;
  }

  isLambdaRuntime() {
    return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);
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

  getLambdaChromiumExecutablePath() {
    const headlessCandidates = [];
    const chromeCandidates = [];
    const explicitCandidates = [
      process.env.ECR_CHROMIUM_EXECUTABLE_PATH,
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      process.env.CHROME_BIN,
      process.env.CHROME_PATH
    ].filter(Boolean);

    try {
      if (fs.existsSync('/ms-playwright')) {
        const msPlaywrightDirs = fs.readdirSync('/ms-playwright').sort().reverse();
        const headlessDirs = msPlaywrightDirs.filter(name => name.startsWith('chromium_headless_shell-'));
        const browserDirs = msPlaywrightDirs.filter(name => name.startsWith('chromium-'));

        // Lambda 环境优先使用 headless_shell，避免完整 Chrome 尝试连接 DBus 导致启动卡住。
        for (const browserDir of headlessDirs) {
          headlessCandidates.push(`/ms-playwright/${browserDir}/chrome-linux/headless_shell`);
        }

        for (const browserDir of browserDirs) {
          headlessCandidates.push(`/ms-playwright/${browserDir}/chrome-linux/headless_shell`);
        }

        for (const browserDir of browserDirs) {
          chromeCandidates.push(`/ms-playwright/${browserDir}/chrome-linux/chrome`);
        }
      }
    } catch (error) {
      Utils.log('warning', '扫描 /ms-playwright Chromium 目录失败', error.message);
    }

    const candidates = [
      ...headlessCandidates,
      ...explicitCandidates,
      ...chromeCandidates
    ];

    candidates.push(
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome'
    );

    for (const executablePath of candidates) {
      try {
        if (fs.existsSync(executablePath)) {
          return executablePath;
        }
      } catch (error) {
        Utils.log('warning', `检查 Chromium 可执行文件失败: ${executablePath}`, error.message);
      }
    }

    Utils.log('warning', '未找到显式 Chromium 可执行文件，回退到 Playwright 默认查找逻辑');
    return undefined;
  }

  async launchChromiumOverCDP(launchOptions) {
    const executablePath = launchOptions.executablePath;
    if (!executablePath) {
      throw new Error('未找到 Lambda Chromium 可执行文件');
    }

    const port = Number(process.env.CHROMIUM_REMOTE_DEBUGGING_PORT) || (9222 + (process.pid % 300));
    const endpoint = `http://127.0.0.1:${port}`;
    const args = [
      ...launchOptions.args,
      '--headless',
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${this.profileDir}`,
      'about:blank'
    ];

    Utils.log('info', `Lambda CDP 启动 Chromium: 127.0.0.1:${port}`);
    this.chromiumProcess = spawn(executablePath, args, {
      env: launchOptions.env,
      stdio: ['ignore', 'ignore', 'pipe']
    });

    let stderrBuffer = '';
    this.chromiumProcess.stderr.on('data', chunk => {
      const text = chunk.toString();
      stderrBuffer = (stderrBuffer + text).slice(-4000);
      if (process.env.DEBUG_BROWSER_CONSOLE === '1') {
        Utils.log('debug', `Chromium stderr: ${text.trim()}`);
      }
    });

    this.chromiumProcess.on('exit', (code, signal) => {
      if (this.chromiumProcess) {
        Utils.log('warning', `Chromium 进程已退出: code=${code} signal=${signal}`, stderrBuffer.trim());
      }
    });

    await this.waitForCDP(endpoint, launchOptions.timeout || 60000, () => stderrBuffer);
    return chromium.connectOverCDP(endpoint, { timeout: launchOptions.timeout || 60000 });
  }

  async waitForCDP(endpoint, timeout, getStderr) {
    const startedAt = Date.now();
    const url = `${endpoint}/json/version`;

    while (Date.now() - startedAt < timeout) {
      if (this.chromiumProcess?.exitCode !== null) {
        throw new Error(`Chromium 启动失败，进程已退出: ${getStderr() || '无 stderr'}`);
      }

      if (await this.canReach(url)) {
        return;
      }

      await Utils.sleep(250);
    }

    throw new Error(`等待 Chromium CDP 端口超时: ${endpoint}. ${getStderr() || ''}`.trim());
  }

  canReach(url) {
    return new Promise(resolve => {
      const req = http.get(url, res => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
      req.on('error', () => resolve(false));
    });
  }

  closeChromiumProcess() {
    if (!this.chromiumProcess) return;

    const processRef = this.chromiumProcess;
    this.chromiumProcess = null;
    if (processRef.exitCode === null) {
      processRef.kill('SIGTERM');
    }
  }

  getChromiumArgs({ isLambda = false } = {}) {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--disable-crash-reporter',
      '--disable-crashpad',
      '--disable-in-process-stack-traces',
      '--disable-features=VizDisplayCompositor',
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
      '--disable-software-rasterizer',
      '--data-path=/tmp/playwright-data',
      '--disk-cache-dir=/tmp/playwright-cache'
    ];

    if (!isLambda) {
      args.push('--single-process');
    }

    return args;
  }
}

module.exports = BrowserManager;

const fs = require('fs');
const path = require('path');

class Utils {
  static trace = [];
  static logsDir = null;
  static screenshots = [];

  static loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.error('❌ 配置文件读取失败:', error);
      process.exit(1);
    }
  }

  static getCurrentTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  static async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static log(level, message, ...args) {
    const timestamp = new Date().toLocaleString('zh-CN');
    const prefix = {
      'info': 'ℹ️ ',
      'success': '✅',
      'warning': '⚠️ ',
      'error': '❌',
      'debug': '🔍'
    }[level] || 'ℹ️ ';
    
    // 在无头模式下提供更详细的日志
    const isHeadless = process.argv.includes('--headless');
    if (isHeadless) {
      console.log(`[${timestamp}] ${prefix} ${message}`, ...args);
    } else {
      console.log(`${prefix} ${message}`, ...args);
    }

    Utils.trace.push({
      timestamp: new Date().toISOString(),
      level,
      message: String(message),
      args: args.map(arg => Utils.serializeTraceArg(arg))
    });
  }

  static resetTrace() {
    Utils.trace = [];
    Utils.screenshots = [];
  }

  static getTrace() {
    return Utils.trace.slice();
  }

  static serializeTraceArg(value) {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }

    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
    if (typeof value === 'undefined') return null;

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }

  static maskUsername(username = '') {
    const value = String(username);
    if (!value) return '';
    if (value.length <= 3) return `${value[0] || ''}***`;
    if (value.length <= 7) return `${value.slice(0, 2)}***${value.slice(-1)}`;
    return `${value.slice(0, 3)}****${value.slice(-4)}`;
  }

  static getLogsDir() {
    if (Utils.logsDir) return Utils.logsDir;

    const candidates = [
      process.env.LOGS_DIR,
      path.join(__dirname, '../logs'),
      '/tmp/ecr-hr-simulator/logs'
    ].filter(Boolean);

    for (const dir of candidates) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        const probe = path.join(dir, `.write-test-${process.pid}-${Date.now()}`);
        fs.writeFileSync(probe, 'ok');
        fs.unlinkSync(probe);
        Utils.logsDir = dir;
        return dir;
      } catch (error) {
        console.warn(`⚠️ 日志目录不可写，尝试下一个: ${dir} (${error.message})`);
      }
    }

    throw new Error('没有可写日志目录');
  }

  static async saveScreenshot(page, filename) {
    try {
      const logsDir = Utils.getLogsDir();
      
      const filepath = path.join(logsDir, filename);
      await page.screenshot({ path: filepath, fullPage: true });
      Utils.screenshots.push({
        filename,
        path: filepath,
        timestamp: new Date().toISOString()
      });
      Utils.log('info', `📸 截图已保存: ${filepath}`);
      return filepath;
    } catch (error) {
      Utils.log('error', '截图保存失败:', error.message);
    }
  }

  // 新增：无头模式状态检查
  static isHeadless() {
    return process.argv.includes('--headless');
  }

  // 新增：创建详细的执行报告
  static async createReport(results, options = {}) {
    try {
      const logsDir = Utils.getLogsDir();
      const reportPath = path.join(logsDir, `report-${Utils.getCurrentTimestamp()}.json`);
      const testMode = options.dryRun ?? process.argv.includes('--test');
      const headless = options.headless ?? Utils.isHeadless();
      const config = options.config || {};
      const report = {
        timestamp: new Date().toISOString(),
        mode: headless ? 'headless' : 'visible',
        testMode,
        dryRun: testMode,
        account: {
          username: Utils.maskUsername(config.username),
          passwordProvided: Boolean(config.password),
          passwordLength: config.password ? String(config.password).length : 0
        },
        results: results,
        screenshots: Utils.screenshots.slice(),
        latestScreenshot: Utils.screenshots[Utils.screenshots.length - 1] || null,
        trace: Utils.getTrace(),
        success: results.login && results.clockin
      };
      
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      Utils.log('info', `📄 执行报告已保存: ${reportPath}`);
      
      return reportPath;
    } catch (error) {
      Utils.log('error', '创建报告失败:', error.message);
    }
  }
}

module.exports = Utils;

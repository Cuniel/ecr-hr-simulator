const fs = require('fs');
const path = require('path');
const util = require('util');

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
      Utils.writeConsole('error', '配置文件读取失败', error);
      process.exit(1);
    }
  }

  static getCurrentTimestamp() {
    return Utils.getCurrentDateTime().replace(/[:.]/g, '-');
  }

  static getTimeZone() {
    return process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Shanghai';
  }

  static getCurrentDateTime() {
    return Utils.formatDateTime(new Date());
  }

  static formatDateTime(dateInput = new Date(), timeZone = Utils.getTimeZone()) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    const offsetMinutes = Utils.getTimeZoneOffsetMinutes(date, timeZone);
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absoluteOffset = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
    const offsetRemainder = String(absoluteOffset % 60).padStart(2, '0');

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}${sign}${offsetHours}:${offsetRemainder}`;
  }

  static getTimeZoneOffsetMinutes(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    const zonedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    return Math.round((zonedAsUtc - date.getTime()) / 60000);
  }

  static async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static log(level, message, ...args) {
    const normalizedLevel = Utils.normalizeLogLevel(level);
    const timestamp = Utils.getCurrentDateTime();
    const cleanMessage = Utils.cleanLogText(message);
    const cleanArgs = args.map(arg => Utils.serializeTraceArg(arg));

    Utils.writeConsole(normalizedLevel, cleanMessage, ...cleanArgs);

    Utils.trace.push({
      timestamp,
      level: normalizedLevel,
      message: cleanMessage,
      args: cleanArgs
    });
  }

  static normalizeLogLevel(level) {
    const normalized = String(level || 'info').toLowerCase();
    if (normalized === 'warn') return 'warning';
    if (normalized === 'success') return 'info';
    return ['debug', 'info', 'warning', 'error'].includes(normalized) ? normalized : 'info';
  }

  static writeConsole(level, message, ...args) {
    const normalizedLevel = Utils.normalizeLogLevel(level);
    if (!Utils.shouldPrintLog(normalizedLevel)) return;

    const timestamp = Utils.getCurrentDateTime();
    const label = {
      debug: 'DEBUG',
      info: 'INFO',
      warning: 'WARN',
      error: 'ERROR'
    }[normalizedLevel];
    const formattedArgs = args
      .filter(arg => arg !== undefined)
      .map(arg => typeof arg === 'string' ? Utils.cleanLogText(arg) : util.inspect(arg, { depth: 4, colors: false, breakLength: 120 }));
    const line = [timestamp, label, Utils.cleanLogText(message), ...formattedArgs].filter(Boolean).join(' ');

    if (normalizedLevel === 'error') {
      console.error(line);
    } else if (normalizedLevel === 'warning') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  static shouldPrintLog(level) {
    const order = { debug: 10, info: 20, warning: 30, error: 40 };
    const configured = Utils.normalizeLogLevel(process.env.LOG_LEVEL || 'info');
    return order[level] >= order[configured];
  }

  static cleanLogText(value) {
    return String(value ?? '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{203C}-\u{3299}\uFE0E\uFE0F\u200D]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
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
        Utils.writeConsole('warning', `日志目录不可写，尝试下一个: ${dir} (${error.message})`);
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
        timestamp: Utils.getCurrentDateTime()
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
        timestamp: Utils.getCurrentDateTime(),
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

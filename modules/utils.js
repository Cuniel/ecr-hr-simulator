const fs = require('fs');
const path = require('path');

class Utils {
  static trace = [];

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

  static async saveScreenshot(page, filename) {
    try {
      const logsDir = path.join(__dirname, '../logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      const filepath = path.join(logsDir, filename);
      await page.screenshot({ path: filepath, fullPage: true });
      Utils.log('info', `📸 截图已保存: ${filename}`);
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
      const reportPath = path.join(__dirname, '../logs', `report-${Utils.getCurrentTimestamp()}.json`);
      const dryRun = options.dryRun ?? process.argv.includes('--dry-run');
      const headless = options.headless ?? Utils.isHeadless();
      const config = options.config || {};
      const report = {
        timestamp: new Date().toISOString(),
        mode: headless ? 'headless' : 'visible',
        dryRun,
        account: {
          username: Utils.maskUsername(config.username),
          passwordProvided: Boolean(config.password),
          passwordLength: config.password ? String(config.password).length : 0
        },
        results: results,
        trace: Utils.getTrace(),
        success: results.login && results.clockin
      };
      
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      Utils.log('info', `📄 执行报告已保存: ${path.basename(reportPath)}`);
      
      return reportPath;
    } catch (error) {
      Utils.log('error', '创建报告失败:', error.message);
    }
  }
}

module.exports = Utils;

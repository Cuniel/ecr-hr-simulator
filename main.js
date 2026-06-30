const BrowserManager = require('./modules/browser');
const Login = require('./modules/login');
const ClockIn = require('./modules/clockin');
const Utils = require('./modules/utils');

class AutoClockInApp {
  constructor() {
    this.browserManager = new BrowserManager();
    this.config = Utils.loadConfig();
    this.results = {
      login: false,
      clockin: false,
      startTime: null,
      endTime: null,
      errors: []
    };
  }

  async run(options = {}) {
    const { headless = false, dryRun = false } = options;
    
    this.results.startTime = new Date().toISOString();
    
    try {
      Utils.log('info', '🚀 启动自动打卡应用...');
      Utils.log('info', `📱 运行模式: ${headless ? '无头模式' : '可见模式'}`);
      Utils.log('info', `🧪 测试模式: ${dryRun ? '启用' : '关闭'}`);
      
      // 设置 DRY RUN 模式
      if (dryRun) {
        this.config.dryRun = true;
        Utils.log('info', '🚫 DRY RUN 模式已启用 - 不会实际打卡');
      }

      // 初始化浏览器
      const page = await this.browserManager.init(headless);

      // 执行登录
      Utils.log('info', '🔐 开始登录阶段...');
      const login = new Login(page);
      const loginSuccess = await login.perform();
      
      this.results.login = loginSuccess;
      
      if (!loginSuccess) {
        Utils.log('error', '登录失败，程序终止');
        this.results.errors.push('登录失败');
        return false;
      }

      // 执行打卡
      Utils.log('info', '⏰ 开始打卡阶段...');
      const clockIn = new ClockIn(page);
      const clockInSuccess = await clockIn.perform();

      this.results.clockin = clockInSuccess;

      if (clockInSuccess) {
        Utils.log('success', '🎉 自动打卡流程完成！');
        
        // 无头模式下输出详细结果
        if (headless) {
          Utils.log('info', '📊 执行结果汇总:');
          Utils.log('success', `  ✅ 登录: ${loginSuccess ? '成功' : '失败'}`);
          Utils.log('success', `  ✅ 打卡: ${clockInSuccess ? '成功' : '失败'}`);
          Utils.log('info', `  📁 日志文件保存在: ./logs/`);
        }
        
        return true;
      } else {
        Utils.log('error', '打卡失败');
        this.results.errors.push('打卡失败');
        return false;
      }

    } catch (error) {
      Utils.log('error', '应用运行异常:', error);
      this.results.errors.push(error.message);
      return false;
    } finally {
      this.results.endTime = new Date().toISOString();
      
      // 生成执行报告（特别适用于无头模式）
      await Utils.createReport(this.results);
      
      // 清理资源
      await this.cleanup();
    }
  }

  async cleanup() {
    try {
      await this.browserManager.close();
      Utils.log('info', '🧹 资源清理完成');
    } catch (error) {
      Utils.log('error', '资源清理失败:', error.message);
    }
  }

  // 静态方法供外部调用
  static async start(options = {}) {
    const app = new AutoClockInApp();
    return await app.run(options);
  }
}

// 命令行运行支持
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    headless: args.includes('--headless'),
    dryRun: args.includes('--dry-run')
  };

  // 无头模式启动提示
  if (options.headless) {
    console.log('🤖 无头模式启动中...');
    console.log('📊 执行过程将通过日志输出，截图和报告将保存在 ./logs/ 目录');
    console.log('⏳ 请耐心等待...\n');
  }

  AutoClockInApp.start(options)
    .then(success => {
      if (options.headless) {
        console.log('\n🏁 无头模式执行完成');
        console.log(`📊 最终结果: ${success ? '✅ 成功' : '❌ 失败'}`);
        console.log('📁 详细日志请查看 ./logs/ 目录');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      Utils.log('error', '程序异常退出:', error);
      process.exit(1);
    });
}

module.exports = AutoClockInApp;
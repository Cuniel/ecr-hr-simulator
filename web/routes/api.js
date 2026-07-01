const express = require('express');
const AutoClockInApp = require('../../main');
const ChineseCalendar = require('../../modules/chineseCalendar');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// API 文档
router.get('/docs', (req, res) => {
  res.json({
    name: 'ECR HR Simulator API',
    version: '2.0.0',
    endpoints: {
      'POST /api/clockin': '执行操作',
      'POST /api/test': '测试操作 (DRY RUN)',
      'GET /api/status': '获取系统状态',
      'GET /api/calendar/today': '获取今日工作日状态',
      'GET /api/logs': '获取执行日志',
      'GET /api/logs/:limit': '获取指定数量的执行日志'
    }
  });
});

// 今日工作日状态
router.get('/calendar/today', (req, res) => {
  try {
    const date = req.query.date || ChineseCalendar.formatDate(new Date());
    const calendar = ChineseCalendar.getDayType(date);

    res.json({
      success: true,
      data: calendar,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// 系统状态
router.get('/status', (req, res) => {
  try {
    const stats = {
      status: 'online',
      timestamp: new Date().toISOString(),
      version: require('../../package.json').version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: process.platform,
      nodeVersion: process.version
    };
    
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 验证账号信息 (不实际登录)
router.post('/validate', async (req, res) => {
  try {
    const { username, password, location } = req.body;
    
    // 基本验证
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '用户名至少3位，密码至少6位'
      });
    }

    // TODO: 这里可以添加更复杂的验证逻辑
    // 比如检查用户名格式、密码强度等

    res.json({
      success: true,
      message: '账号信息格式正确',
      data: {
        username: username.replace(/^(.{3}).*(.{2})$/, '$1***$2'), // 脱敏显示
        location: location || { latitude: 31.24, longitude: 121.42 }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: '验证过程发生错误'
    });
  }
});

// 测试操作 (DRY RUN)
router.post('/test', async (req, res) => {
  try {
    const { username, password, location } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    // 执行测试
    const app = new AutoClockInApp();
    app.config = buildRunConfig({ username, password, location, dryRun: true });
    
    const result = await app.run({ headless: true, dryRun: true });

    // 获取最新的执行报告
    const latestReport = getLatestReport();

    res.json({
      success: result,
      message: result ? '测试成功！流程正常' : '测试失败，请检查账号信息',
      data: latestReport,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('测试操作错误:', error);
    res.status(500).json({
      success: false,
      message: '测试过程发生错误: ' + error.message
    });
  }
});

// 执行真实操作
router.post('/clockin', async (req, res) => {
  try {
    const { username, password, location, confirm } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    if (!confirm) {
      return res.status(400).json({
        success: false,
        message: '请确认执行真实操作操作'
      });
    }

    // 执行真实操作
    const app = new AutoClockInApp();
    app.config = buildRunConfig({ username, password, location, dryRun: false });
    
    const result = await app.run({ headless: true, dryRun: false });

    // 获取最新的执行报告
    const latestReport = getLatestReport();

    res.json({
      success: result,
      message: result ? '🎉 操作成功！' : '❌ 操作失败，请查看详细日志',
      data: latestReport,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('执行操作错误:', error);
    res.status(500).json({
      success: false,
      message: '操作过程发生错误: ' + error.message
    });
  }
});

// 修复：分别处理有参数和无参数的日志路由
router.get('/logs', (req, res) => {
  handleLogsRequest(req, res, 10); // 默认返回10条
});

router.get('/logs/:limit', (req, res) => {
  const limit = parseInt(req.params.limit) || 10;
  handleLogsRequest(req, res, limit);
});

// 处理日志请求的公共函数
function handleLogsRequest(req, res, limit) {
  try {
    const logsDir = path.join(__dirname, '../../logs');
    
    if (!fs.existsSync(logsDir)) {
      return res.json({ success: true, data: [] });
    }
    
    const logFiles = fs.readdirSync(logsDir)
      .filter(file => file.startsWith('report-') && file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          return {
            filename: file,
            timestamp: content.timestamp,
            success: content.success,
            mode: content.mode,
            dryRun: content.dryRun,
            account: content.account,
            results: content.results,
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        } catch (parseError) {
          // 如果文件解析失败，跳过该文件
          console.error(`解析日志文件 ${file} 失败:`, parseError);
          return null;
        }
      })
      .filter(log => log !== null) // 过滤掉解析失败的文件
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, Math.min(limit, 100)); // 最多返回100条
    
    res.json({ success: true, data: logFiles });
  } catch (error) {
    console.error('获取日志失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '获取日志失败: ' + error.message 
    });
  }
}

function buildRunConfig({ username, password, location, dryRun }) {
  return {
    username,
    password,
    location: location || { latitude: 31.24, longitude: 121.42 },
    dryRun
  };
}

// 获取最新报告的辅助函数
function getLatestReport() {
  try {
    const logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logsDir)) return null;
    
    const reportFiles = fs.readdirSync(logsDir)
      .filter(file => file.startsWith('report-') && file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        return { file, mtime: stats.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
    
    if (reportFiles.length === 0) return null;
    
    const latestFile = path.join(logsDir, reportFiles[0].file);
    return JSON.parse(fs.readFileSync(latestFile, 'utf8'));
  } catch (error) {
    console.error('获取最新报告失败:', error);
    return null;
  }
}

module.exports = router;

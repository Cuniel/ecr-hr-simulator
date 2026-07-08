const express = require('express');
const AutoClockInApp = require('../../main');
const ChineseCalendar = require('../../modules/chineseCalendar');
const Utils = require('../../modules/utils');
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
      'POST /api/test': '测试操作',
      'GET /api/status': '获取系统状态',
      'GET /api/config': '获取前端配置',
      'GET /api/calendar/today': '获取今日工作日状态',
      'GET /api/screenshots/:filename': '查看执行截图',
      'GET /api/logs': '获取执行日志',
      'GET /api/logs/:limit': '获取指定数量的执行日志'
    }
  });
});

// 前端配置，不返回账号密码等敏感字段
router.get('/config', (req, res) => {
  try {
    const config = Utils.loadConfig();
    const locations = normalizeLocations(config);

    res.json({
      success: true,
      data: {
        locations,
        defaultLocationId: locations.find(location => location.default)?.id || locations[0]?.id || 'custom'
      },
      timestamp: Utils.getCurrentDateTime()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '读取配置失败: ' + error.message });
  }
});

// 今日工作日状态
router.get('/calendar/today', (req, res) => {
  try {
    const date = req.query.date || ChineseCalendar.formatDate(new Date());
    const calendar = ChineseCalendar.getDayType(date);

    res.json({
      success: true,
      data: calendar,
      timestamp: Utils.getCurrentDateTime()
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
      timestamp: Utils.getCurrentDateTime(),
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

// 测试操作
router.post('/test', async (req, res) => {
  return runWorkflow(req, res, {
    dryRun: true,
    successMessage: '测试成功！流程正常',
    failureMessage: '测试失败，请检查账号信息',
    errorPrefix: '测试过程发生错误'
  });
});

// 执行真实操作
router.post('/clockin', async (req, res) => {
  return runWorkflow(req, res, {
    dryRun: false,
    requireConfirm: true,
    successMessage: '🎉 操作成功！',
    failureMessage: '❌ 操作失败，请查看详细日志',
    errorPrefix: '操作过程发生错误'
  });
});

async function runWorkflow(req, res, options) {
  try {
    const { username, password, location, confirm } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    if (options.requireConfirm && !confirm) {
      return res.status(400).json({
        success: false,
        message: '请确认执行真实操作'
      });
    }

    const app = new AutoClockInApp();
    app.config = buildRunConfig({ username, password, location, dryRun: options.dryRun });
    
    const result = await app.run({ headless: true, dryRun: options.dryRun });
    const latestReport = getLatestReport();

    res.json({
      success: result,
      message: result ? options.successMessage : options.failureMessage,
      data: latestReport,
      timestamp: Utils.getCurrentDateTime()
    });

  } catch (error) {
    Utils.writeConsole('error', options.dryRun ? '测试操作错误' : '执行操作错误', error);
    res.status(500).json({
      success: false,
      message: `${options.errorPrefix}: ${error.message}`
    });
  }
}

// 查看执行截图
router.get('/screenshots/:filename', (req, res) => {
  try {
    const logsDir = Utils.getLogsDir();
    const filename = path.basename(req.params.filename);

    if (!/\.png$/i.test(filename)) {
      return res.status(400).json({ success: false, message: '截图文件格式不正确' });
    }

    const filePath = path.join(logsDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '截图不存在' });
    }

    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ success: false, message: '读取截图失败: ' + error.message });
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
    const logsDir = Utils.getLogsDir();
    
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
          
          const decorated = decorateReport(content);
          return {
            filename: file,
            timestamp: decorated.timestamp,
            success: decorated.success,
            mode: decorated.mode,
            testMode: decorated.testMode ?? decorated.dryRun,
            dryRun: decorated.dryRun,
            account: decorated.account,
            results: decorated.results,
            latestScreenshot: decorated.latestScreenshot,
            screenshotUrl: decorated.screenshotUrl,
            size: stats.size,
            modified: Utils.formatDateTime(stats.mtime)
          };
        } catch (parseError) {
          // 如果文件解析失败，跳过该文件
          Utils.writeConsole('error', `解析日志文件 ${file} 失败`, parseError);
          return null;
        }
      })
      .filter(log => log !== null) // 过滤掉解析失败的文件
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, Math.min(limit, 100)); // 最多返回100条
    
    res.json({ success: true, data: logFiles });
  } catch (error) {
    Utils.writeConsole('error', '获取日志失败', error);
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
    location: normalizeRunLocation(location),
    dryRun
  };
}

function normalizeRunLocation(location) {
  return {
    latitude: Number(location?.latitude) || 31.24,
    longitude: Number(location?.longitude) || 121.42
  };
}

function normalizeLocations(config = {}) {
  const configured = Array.isArray(config.locations) ? config.locations : [];
  const locations = configured
    .map((location, index) => ({
      id: location.id || `location-${index + 1}`,
      name: location.name || `地点 ${index + 1}`,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      default: Boolean(location.default)
    }))
    .filter(location => Number.isFinite(location.latitude) && Number.isFinite(location.longitude));

  if (locations.length > 0) return locations;

  return [{
    id: 'global-harbor',
    name: '我格广场',
    latitude: 31.24,
    longitude: 121.42,
    default: true
  }];
}

// 获取最新报告的辅助函数
function getLatestReport() {
  try {
    const logsDir = Utils.getLogsDir();
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
    return decorateReport(JSON.parse(fs.readFileSync(latestFile, 'utf8')), { includeScreenshotData: true });
  } catch (error) {
    Utils.writeConsole('error', '获取最新报告失败', error);
    return null;
  }
}

function decorateReport(report, options = {}) {
  const latestScreenshot = report.latestScreenshot || findLatestScreenshot();
  const filename = latestScreenshot?.filename ? path.basename(latestScreenshot.filename) : null;
  const screenshotDataUrl = options.includeScreenshotData && filename
    ? readScreenshotDataUrl(filename)
    : null;

  return {
    ...report,
    latestScreenshot: latestScreenshot
      ? {
          ...latestScreenshot,
          filename
        }
      : null,
    screenshotUrl: filename ? `/api/screenshots/${encodeURIComponent(filename)}` : null,
    screenshotDataUrl
  };
}

function readScreenshotDataUrl(filename) {
  try {
    const filePath = path.join(Utils.getLogsDir(), path.basename(filename));
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function findLatestScreenshot() {
  try {
    const logsDir = Utils.getLogsDir();
    if (!fs.existsSync(logsDir)) return null;

    const screenshots = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.png'))
      .map(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          path: filePath,
          timestamp: Utils.formatDateTime(stats.mtime)
        };
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return screenshots[0] || null;
  } catch {
    return null;
  }
}

module.exports = router;

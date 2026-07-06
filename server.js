const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const Utils = require('./modules/utils');
const apiRoutes = require('./web/routes/api');

class WebServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    //this.setupSecurity();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupSecurity() {
    // 安全中间件
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "data:"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"]
        }
      }
    }));

    // CORS 配置
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-domain.com'] // 生产环境域名
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true
    }));

    // 速率限制
    const rateLimiter = new RateLimiterMemory({
      keyName: 'ip',
      points: 100, // 10 次请求
      duration: 60, // 每分钟
    });

    this.app.use(async (req, res, next) => {
      try {
        await rateLimiter.consume(req.ip);
        next();
      } catch {
        res.status(429).json({ 
          success: false, 
          message: '请求过于频繁，请稍后再试' 
        });
      }
    });
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // API Gateway Stage / 路由前缀兼容：
    // 中国区 API Gateway HTTP API 会把 stage 名（例如 /default）带到 Lambda Web Adapter。
    // 如果通过 /default 或 /default/ecr-hr 访问，这里先把前缀剥掉，再交给 Express 原有路由处理。
    this.app.use((req, res, next) => {
      const prefixes = (process.env.BASE_PATHS || '/default/ecr-hr,/default,/ecr-hr')
        .split(',')
        .map(prefix => prefix.trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

      for (const prefix of prefixes) {
        if (req.url === prefix) {
          req.url = '/';
          break;
        }

        if (req.url.startsWith(`${prefix}/`)) {
          req.url = req.url.slice(prefix.length) || '/';
          break;
        }
      }

      next();
    });

    this.app.use(express.static(path.join(__dirname, 'web/public'), {
      etag: false,
      lastModified: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      }
    }));

    // 日志中间件
    this.app.use((req, res, next) => {
      Utils.writeConsole('info', `${req.method} ${req.path}`, { ip: req.ip });
      next();
    });
  }

  setupRoutes() {
    // API 路由
    this.app.use('/api', apiRoutes);

    // 主页面
    this.app.get('/', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.sendFile(path.join(__dirname, 'web/public/index.html'));
    });

    // 兼容 API Gateway 带前缀访问首页
    this.app.get(['/default', '/default/', '/ecr-hr', '/ecr-hr/', '/default/ecr-hr', '/default/ecr-hr/'], (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.sendFile(path.join(__dirname, 'web/public/index.html'));
    });

    // 健康检查 (AWS ALB / Lambda Web Adapter 需要)
    this.app.get(['/health', '/default/health', '/ecr-hr/health', '/default/ecr-hr/health'], (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: Utils.getCurrentDateTime(),
        version: require('./package.json').version
      });
    });

    // 日志查看 (管理员功能)
    this.app.get('/logs', this.requireAuth, (req, res) => {
      try {
        const logsDir = Utils.getLogsDir();
        if (!fs.existsSync(logsDir)) {
          return res.json({ logs: [] });
        }
        
        const files = fs.readdirSync(logsDir)
          .filter(file => file.endsWith('.json'))
          .map(file => {
            const filePath = path.join(logsDir, file);
            const stats = fs.statSync(filePath);
            return {
              name: file,
              size: stats.size,
              modified: Utils.formatDateTime(stats.mtime)
            };
          })
          .sort((a, b) => new Date(b.modified) - new Date(a.modified));
        
        res.json({ logs: files });
      } catch (error) {
        res.status(500).json({ success: false, message: '获取日志失败' });
      }
    });

    // 下载日志
    this.app.get('/logs/:filename', this.requireAuth, (req, res) => {
      try {
        const filename = req.params.filename;
        const filePath = path.join(Utils.getLogsDir(), filename);
        
        if (!fs.existsSync(filePath) || !filename.endsWith('.json')) {
          return res.status(404).json({ success: false, message: '文件不存在' });
        }
        
        res.download(filePath);
      } catch (error) {
        res.status(500).json({ success: false, message: '下载失败' });
      }
    });
  }

  setupErrorHandling() {
    // 404 处理
    this.app.use((req, res) => {
      res.status(404).json({ 
        success: false, 
        message: '页面不存在' 
      });
    });

    // 全局错误处理
    this.app.use((err, req, res, next) => {
      Utils.writeConsole('error', '服务器错误', err);
      res.status(500).json({ 
        success: false, 
        message: process.env.NODE_ENV === 'production' 
          ? '服务器内部错误' 
          : err.message 
      });
    });
  }

  // 简单的认证中间件 (可以后续改为 JWT)
  requireAuth(req, res, next) {
    const auth = req.headers.authorization;
    const adminKey = process.env.ADMIN_KEY || 'admin123';
    
    if (!auth || auth !== `Bearer ${adminKey}`) {
      return res.status(401).json({ 
        success: false, 
        message: '未授权访问' 
      });
    }
    
    next();
  }

  async start() {
    try {
      // 确保必要目录存在
      const dirs = [Utils.getLogsDir(), path.join(__dirname, 'web/public')];
      dirs.forEach(dir => {
        const fullPath = path.isAbsolute(dir) ? dir : path.join(__dirname, dir);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
      });

      this.app.listen(this.port, '0.0.0.0', () => {
        Utils.writeConsole('info', 'ECR 工作台服务已启动');
        Utils.writeConsole('info', `Web界面: http://localhost:${this.port}`);
        Utils.writeConsole('info', `API文档: http://localhost:${this.port}/api/docs`);
        Utils.writeConsole('info', `健康检查: http://localhost:${this.port}/health`);
        
        if (process.env.NODE_ENV !== 'production') {
          Utils.writeConsole('info', '开发模式已启用');
        }
      });
    } catch (error) {
      Utils.writeConsole('error', '服务器启动失败', error);
      process.exit(1);
    }
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const server = new WebServer();
  server.start();
}

module.exports = WebServer;

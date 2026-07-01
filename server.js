const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const AutoClockInApp = require('./main');
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
    this.app.use(express.static(path.join(__dirname, 'web/public')));

    // 日志中间件
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // API 路由
    this.app.use('/api', apiRoutes);

    // 主页面
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'web/public/index.html'));
    });

    // 健康检查 (AWS ALB 需要)
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: require('./package.json').version
      });
    });

    // 日志查看 (管理员功能)
    this.app.get('/logs', this.requireAuth, (req, res) => {
      try {
        const logsDir = path.join(__dirname, 'logs');
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
              modified: stats.mtime.toISOString()
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
        const filePath = path.join(__dirname, 'logs', filename);
        
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
      console.error('服务器错误:', err);
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
      const dirs = ['logs', 'web/public'];
      dirs.forEach(dir => {
        const fullPath = path.join(__dirname, dir);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
      });

      this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`🚀 ECR 工作台服务已启动！`);
        console.log(`📱 Web界面: http://localhost:${this.port}`);
        console.log(`🔗 API文档: http://localhost:${this.port}/api/docs`);
        console.log(`💓 健康检查: http://localhost:${this.port}/health`);
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🔧 开发模式已启用`);
        }
      });
    } catch (error) {
      console.error('❌ 服务器启动失败:', error);
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

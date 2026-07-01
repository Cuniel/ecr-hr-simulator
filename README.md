# ECR 工作台

用于本地验证 ECR 自动流程的 Web 工作台。当前界面包含两个独立操作：

- 测试操作：走 dry run，用于验证登录和页面访问流程。
- 执行操作：走真实流程，需要二次确认。

页面会通过 Node.js 内置的中国节假日/调休表判断当天是否为工作日，并在时间卡片中展示状态。

## 环境要求

- Node.js 22+
- npm
- Docker / Docker Compose，可选

首次安装依赖：

```bash
npm install
```

## 本地调试

启动 Web 服务：

```bash
npm start
```

或使用开发模式：

```bash
npm run dev
```

打开页面：

```text
http://localhost:3000
```

常用接口：

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/status
curl http://localhost:3000/api/calendar/today
curl 'http://localhost:3000/api/calendar/today?date=2026-10-10'
curl http://localhost:3000/api/logs/5
```

本地 dry run 命令：

```bash
npm run test-headless
```

本地真实流程命令：

```bash
npm run clockin-headless
```

## 工作日判断

工作日判断逻辑在 `modules/chineseCalendar.js`：

1. 命中调休上班日时，返回工作日。
2. 命中法定节假日/调休休息日时，返回休息日。
3. 其他日期按周一到周五为工作日、周六周日为休息日判断。

验证示例：

```bash
node -e "const c=require('./modules/chineseCalendar'); console.log(c.getDayType('2026-06-30'))"
node -e "const c=require('./modules/chineseCalendar'); console.log(c.getDayType('2026-06-19'))"
node -e "const c=require('./modules/chineseCalendar'); console.log(c.getDayType('2026-10-10'))"
```

## Docker 构建

构建镜像：

```bash
npm run docker:build
```

等价命令：

```bash
docker build -f docker/Dockerfile -t ecr-hr-simulator .
```

多平台构建：

```bash
npm run docker:build-multi
```

## Docker 运行

使用 compose 后台启动：

```bash
npm run docker:run
```

查看日志：

```bash
npm run docker:logs
```

停止服务：

```bash
npm run docker:stop
```

服务启动后访问：

```text
http://localhost:3000
```

compose 会挂载本地目录：

- `./logs:/app/logs`
- `./temp:/app/temp`

因此容器内生成的报告、截图和临时文件可以直接在本地查看。

## Docker 调试

前台启动并重新构建：

```bash
npm run docker:dev
```

进入容器：

```bash
npm run docker:shell
```

容器内检查服务：

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/calendar/today
```

容器内查看日志文件：

```bash
ls -lah logs
cat logs/report-*.json
```

容器内运行 dry run：

```bash
npm run test-headless
```

如果 Chromium/Playwright 相关流程失败，优先看：

```bash
echo $PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
which chromium-browser
ls -lah logs
```

## 日志和报告

执行流程会在 `logs/` 目录生成：

- `report-*.json`：执行报告
- `login-page-*.png`：登录页截图
- `login-success-*.png`：登录成功截图
- `clockin-page-*.png`：操作页截图
- `clockin-error-*.png`：异常截图

查看最新日志：

```bash
ls -lt logs | head
```

清理本地日志前请确认不再需要排查：

```bash
rm -f logs/*
```

## 常见问题

### 本地端口被占用

使用其他端口启动：

```bash
PORT=3001 npm start
```

### Docker 端口被占用

修改 `docker/docker-compose.yml`：

```yaml
ports:
  - "3001:3000"
```

### 页面能打开但图标或样式异常

确认网络可以访问 Bootstrap 和 Font Awesome CDN。也可以后续把这些静态资源改为本地依赖。

### 测试操作后生成了很多截图

这是预期行为，截图用于排查自动化流程。确认不需要后可以清理 `logs/`。

## 重要提醒

测试操作不会点击真实操作按钮；执行操作会走真实流程。执行前请确认账号、坐标和当天工作日状态。

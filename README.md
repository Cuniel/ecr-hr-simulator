# ECR 工作台

用于本地验证 ECR 自动流程的 Web 工作台。页面提供两个独立操作：

- 测试：验证登录和页面访问流程，不点击真实操作按钮。
- 执行：走真实流程，需要二次确认。

账号、密码由用户在页面输入；浏览器可选择是否记住到本机 `localStorage`。仓库配置文件不再保存账号密码。

## 环境要求

- Node.js 22+
- npm
- Docker / Docker Compose，可选

安装依赖：

```bash
npm install
```

## 配置

`config.json` 只保存地点列表：

```json
{
  "locations": [
    {
      "id": "global-harbor",
      "name": "我格广场",
      "latitude": 31.24,
      "longitude": 121.42,
      "default": true
    }
  ]
}
```

新增地点时，在 `locations` 数组里追加一项即可。页面会默认选中 `default: true` 的地点；用户也可以选择“自定义坐标”临时输入经纬度。

## 本地调试

启动 Web 服务：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

常用接口：

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/status
curl http://localhost:3000/api/config
curl http://localhost:3000/api/calendar/today
curl http://localhost:3000/api/logs/5
```

CLI 模式不再读取 `config.json` 里的账号密码；如需使用，传环境变量：

```bash
ECR_USERNAME=手机号 ECR_PASSWORD=密码 npm run test-headless
ECR_USERNAME=手机号 ECR_PASSWORD=密码 npm run clockin-headless
```

## 工作日判断

工作日判断逻辑在 `modules/chineseCalendar.js`：

1. 命中调休上班日时，返回工作日。
2. 命中法定节假日/调休休息日时，返回休息日。
3. 其他日期按周一到周五为工作日、周六周日为休息日判断。

验证示例：

```bash
node -e "const c=require('./modules/chineseCalendar'); console.log(c.getDayType('2026-06-30'))"
node -e "const c=require('./modules/chineseCalendar'); console.log(c.getDayType('2026-10-10'))"
```

## Docker

构建镜像：

```bash
npm run docker:build
```

后台启动：

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

进入容器：

```bash
npm run docker:shell
```

Compose 会挂载：

- `./logs:/app/logs`
- `./temp:/app/temp`

因此本地 Docker 运行时，报告和截图可以在宿主机 `logs/` 中查看。

## AWS Lambda

镜像内置 Lambda Web Adapter，可作为 Lambda Container Image 运行普通 HTTP 服务。

Lambda 根文件系统只读，因此运行时报告和截图会自动写到：

```text
/tmp/ecr-hr-simulator/logs
```

注意：`/tmp` 是单个 Lambda 实例的临时盘，不适合长期保存。当前接口会在测试/执行响应里直接返回最后截图的 `screenshotDataUrl`，页面展示不依赖后续再次读取 `/tmp` 文件。

Lambda 环境下浏览器会手动启动 Chromium 并通过 CDP 连接，避免 Playwright launch pipe 在 Lambda 里握手卡住。本地运行仍使用持久上下文，便于调试。

建议 Lambda 配置：

- 内存：至少 `2048 MB`
- 超时：先给 `5-10 分钟`
- Function URL 或 API Gateway 均可

## 日志和报告

日志统一格式：

```text
2026-07-01T09:16:42.830Z INFO 启动浏览器 (无头模式)...
2026-07-01T09:16:43.275Z INFO 浏览器初始化完成
```

默认控制台输出 `INFO/WARN/ERROR`。如果需要看更详细调试日志：

```bash
LOG_LEVEL=debug npm run dev
```

如果需要记录浏览器页面的 `console.log`：

```bash
DEBUG_BROWSER_CONSOLE=1 npm run dev
```

执行流程会生成：

- `report-*.json`：执行报告，包含 `trace`、账号脱敏信息、截图列表和最后截图
- `login-page-*.png`：登录页截图
- `login-success-*.png`：登录成功截图
- `clockin-page-*.png`：操作页截图
- `before-click-*.png` / `after-click-*.png`：操作前后截图
- `*-error-*.png`：异常截图

本地查看：

```bash
ls -lt logs | head
cat logs/report-*.json
```

清理本地日志前请确认不再需要排查：

```bash
rm -f logs/*
```

## 常见问题

### 本地端口被占用

```bash
PORT=3001 npm start
```

### Docker 端口被占用

修改 `docker/docker-compose.yml`：

```yaml
ports:
  - "3001:3000"
```

### Chromium / Playwright 启动失败

优先检查：

```bash
echo $PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
test -x /usr/lib/chromium/chromium
ls -lah logs
```

如果 Lambda 日志出现 `launchPersistentContext`、`browserType.launch` 或 `--single-process`，说明镜像还不是新版代码；重新构建并推送镜像后再更新 Lambda。新版 Lambda 日志应出现“使用 CDP 方式连接浏览器”，Chromium 路径应优先为 `/usr/lib/chromium/chromium`。

本地 macOS 在某些受限沙箱内启动 Chromium 可能失败；直接在终端运行 `npm run dev` 或 Docker 运行即可。

## 重要提醒

测试不会点击真实操作按钮；执行会走真实流程。执行前请确认账号、地点和当天工作日状态。

aws sso login --profile GLB-1033
## 检索身份验证令牌并向注册表验证 Docker 客户端身份。使用 Amazon Web Services CLI：
aws ecr get-login-password --region us-east-1 --profile GLB-1033 | docker login --username AWS --password-stdin 103339360083.dkr.ecr.us-east-1.amazonaws.com
## 使用以下命令生成 Docker 映像。有关从头生成 Docker 文件的信息，请参阅说明 此处 。如果您已生成映像，则可跳过此步骤:
docker build -f docker/Dockerfile -t ecr-hr .
## 生成完成后，标记您的映像，以便将映像推送到此存储库:
docker tag ecr-hr:latest 103339360083.dkr.ecr.us-east-1.amazonaws.com/ecr-hr:latest
## 运行以下命令将此映像推送到您新创建的 Amazon Web Services 存储库:
docker push 103339360083.dkr.ecr.us-east-1.amazonaws.com/ecr-hr:latest

## push 成功后，更新 Lambda
aws lambda update-function-code \
  --function-name ecr-hr \
  --image-uri 103339360083.dkr.ecr.us-east-1.amazonaws.com/ecr-hr:latest \
  --region us-east-1 \
  --profile GLB-1033

## 建议等待部署完成
aws lambda wait function-updated \
  --function-name ecr-hr \
  --region us-east-1 \
  --profile GLB-1033

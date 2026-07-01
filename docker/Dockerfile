FROM public.ecr.aws/docker/library/node:22-alpine

WORKDIR /app

RUN apk upgrade --no-cache && apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-cjk \
    wqy-zenhei \
    dbus \
    xvfb \
    curl

# AWS Lambda Web Adapter：让普通 HTTP Web 服务可以作为 Lambda Container Image 运行
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 /lambda-adapter /opt/extensions/lambda-adapter

# 设置 Playwright/Chromium 环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/bin/chromium-browser \
    PORT=3000 \
    AWS_LWA_PORT=3000 \
    AWS_LWA_READINESS_CHECK_PATH=/health \
    AWS_LWA_READINESS_CHECK_PROTOCOL=http \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    XDG_CONFIG_HOME=/tmp/.config \
    XDG_RUNTIME_DIR=/tmp/runtime \
    DISPLAY=:99 \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048"

# 复制 package 文件
COPY package*.json ./

# 安装依赖。浏览器使用 Alpine 系统 Chromium，不下载 Playwright 内置浏览器。
RUN npm ci --omit=dev --no-audit --no-fund

# 复制应用代码
COPY . .

# 创建必要目录
RUN mkdir -p logs web/public temp screenshots reports \
    /tmp/ecr-hr-simulator/logs \
    /tmp/ecr-hr-simulator/chromium-profile \
    /tmp/ecr-hr-simulator/chromium-cache \
    /tmp/ecr-hr-simulator/chromium-data \
    /tmp/.cache \
    /tmp/.config \
    /tmp/runtime

# 创建非 root 用户 (安全考虑)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ecr-hr -u 1001 -G nodejs

# 设置目录权限
RUN chown -R ecr-hr:nodejs /app && \
    chown -R ecr-hr:nodejs /tmp/ecr-hr-simulator /tmp/.cache /tmp/.config /tmp/runtime && \
    chmod -R 755 /app && \
    chmod 700 /tmp/runtime

# 切换到非 root 用户
USER ecr-hr

# Lambda 不使用 Docker HEALTHCHECK；本地 docker run 时可手动访问 /health 检查

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]

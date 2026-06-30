FROM node:22.22.3-alpine

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖
RUN apk add --no-cache \
    # Chromium 和基础依赖
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    # 额外的字体支持
    font-noto-cjk \
    wqy-zenhei \
    # 其他必要依赖
    dbus \
    xvfb \
    # 调试工具 (可选)
    curl \
    wget

# 设置 Playwright/Chromium 环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PLAYWRIGHT_BROWSERS_PATH=/usr/bin \
    # Chromium 运行参数
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/bin/chromium-browser \
    # 无头模式优化
    DISPLAY=:99 \
    # Node.js 优化
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048"

# 复制 package 文件
COPY package*.json ./

# 安装依赖 (使用与本地相同的 Node.js 版本)
RUN npm ci --only=production --no-audit --no-fund

# 复制应用代码
COPY . .

# 创建必要目录
RUN mkdir -p logs web/public temp

# 创建非 root 用户 (安全考虑)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S daka -u 1001 -G nodejs

# 设置目录权限
RUN chown -R daka:nodejs /app && \
    chmod -R 755 /app

# 切换到非 root 用户
USER daka

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]
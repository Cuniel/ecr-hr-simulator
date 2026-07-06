FROM mcr.microsoft.com/playwright:v1.61.1-noble
WORKDIR /app
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 /lambda-adapter /opt/extensions/lambda-adapter
ENV PORT=3000 \
    AWS_LWA_PORT=3000 \
    AWS_LWA_READINESS_CHECK_PATH=/health \
    AWS_LWA_READINESS_CHECK_PROTOCOL=http \
    TZ=Asia/Shanghai \
    APP_TIMEZONE=Asia/Shanghai \
    HOME=/tmp \
    TMPDIR=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    XDG_CONFIG_HOME=/tmp/.config \
    XDG_RUNTIME_DIR=/tmp/runtime \
    DBUS_SESSION_BUS_ADDRESS=/dev/null \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048"
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p logs web/public temp screenshots reports \
    /tmp/ecr-hr-simulator/logs \
    /tmp/.cache \
    /tmp/.config \
    /tmp/runtime
RUN chmod -R 755 /app && \
    chmod -R 777 /tmp/ecr-hr-simulator /tmp/.cache /tmp/.config /tmp/runtime && \
    chmod 700 /tmp/runtime
EXPOSE 3000
CMD ["node", "server.js"]

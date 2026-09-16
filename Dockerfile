# ============================================================
# 龙猫工作统计台（WorkDashboard）- Docker 镜像
# 构建: docker build -t work-dashboard .
# 运行: docker run -d -p 8000:8000 -v work-data:/data work-dashboard
# 或用 compose: docker compose up -d
# 数据卷: /data（SQLite 数据库 works.db 持久化于此）
# ============================================================

FROM python:3.11-slim

# 元信息
LABEL org.opencontainers.image.title="龙猫工作统计台 WorkDashboard" \
      org.opencontainers.image.description="本地优先的个人工作管理工作台：日程看板 · 工时收入统计 · 日薪/月薪双模式 · 数据对接" \
      org.opencontainers.image.version="0.2.1" \
      org.opencontainers.image.licenses="MIT"

# 时区与运行环境
ENV TZ=Asia/Shanghai \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # 关键：容器内必须监听 0.0.0.0，端口映射到宿主机后外部才能访问
    HOST=0.0.0.0 \
    PORT=8000 \
    WORK_DB_PATH=/data/works.db

# 时区：slim 基础镜像默认不含 tzdata，仅设 TZ 会退回 UTC，
# 导致凌晨"今天/逾期"判定与 created_at 时间戳错一天 → 显式安装并链接本地时区
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
 && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先安装依赖，利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝项目代码（前端零依赖，无需构建）
COPY backend ./backend
COPY frontend ./frontend

# 非 root 用户运行，提升安全性；确保数据目录存在且可写
# 不在镜像内声明 VOLUME：持久化改由 compose / docker run -v 显式挂载命名卷，避免匿名卷与路径覆盖问题
RUN useradd --create-home --shell /bin/bash appuser && \
    mkdir -p /data && chown -R appuser:appuser /app /data
USER appuser

# 对外端口
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1

# 启动服务
CMD ["python", "-m", "backend.main"]

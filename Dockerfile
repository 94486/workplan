# ============================================================
# 个人工作管理工作台 - Docker 镜像
# 构建: docker build -t work-dashboard .
# 运行: docker run -d -p 8000:8000 -v work-data:/data work-dashboard
# ============================================================

FROM python:3.11-slim

# 时区与基础工具
ENV TZ=Asia/Shanghai \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 先安装依赖，利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝项目代码
COPY backend ./backend
COPY frontend ./frontend

# 数据卷：SQLite 文件持久化到 /data/works.db
ENV WORK_DB_PATH=/data/works.db
VOLUME ["/data"]

# 对外端口
EXPOSE 8000

# 启动服务
CMD ["python", "-m", "backend.main"]

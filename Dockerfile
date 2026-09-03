# Builder: resolve + install all wheels into an isolated venv.
FROM python:3.12-slim-bookworm AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /src
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    # pip/setuptools are build-time only; nothing imports them at runtime.
    && rm -rf /opt/venv/lib/python3.12/site-packages/pip* \
    && rm -rf /opt/venv/lib/python3.12/site-packages/setuptools* \
    && rm -rf /opt/venv/lib/python3.12/site-packages/pkg_resources* \
    && find /opt/venv -name '__pycache__' -type d -prune -exec rm -rf {} +

# Runtime: same base so the venv's python symlinks resolve; no pip, no caches.
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY app ./app
COPY tests ./tests
COPY alembic.ini .
COPY migrations ./migrations

RUN mkdir -p /app/data \
    && useradd --create-home --uid 1001 appuser \
    && chown -R appuser:appuser /app/data

USER appuser

EXPOSE 8000

CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

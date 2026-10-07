FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt psycopg2-binary
COPY . .
EXPOSE 8000
CMD ["sh", "-c", "[ -f data/lines.geojson ] || python -m app.seed; uvicorn app.main:app --host 0.0.0.0 --port 8000"]

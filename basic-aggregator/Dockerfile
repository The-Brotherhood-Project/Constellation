FROM python:3.11-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy aggregator application and configs
COPY . .

# Build the static site once immediately upon startup
RUN python builder.py

# Expose default HTTP port for static hosting
EXPOSE 8080

# Environment variables
ENV DAEMON_MODE=1
ENV PYTHONUNBUFFERED=1

# Start script: starts Python static http.server on dist/ and runs the builder daemon in background
CMD ["/bin/sh", "entrypoint.sh"]

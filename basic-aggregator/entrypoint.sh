#!/bin/sh
# Entrypoint for Basic Aggregator Container
# Runs periodic static aggregator daemon in the background and serves dist/ via HTTP

echo "=== Basic Aggregator Service ==="

if [ -d "$SECRET_DIR" ]; then
    # Copy all secret YAML files into /app/config before starting the app
    WHITELIST="service.yaml documents.yaml digital.yaml physical.yaml"
    for file in $WHITELIST; do
        if [ -f "$SECRET_DIR/$file" ]; then
            cp "$SECRET_DIR/$file" /app/config/
        fi
    done
fi

# Start periodic builder daemon in background (including initial build)
echo "[*] Launching background re-builder daemon (interval from config/service.yaml)..."
python -u builder.py --daemon &
DAEMON_PID=$!

# Start static HTTP server serving the dist directory on port 3000
echo "[*] Serving static website from dist/ on port 3000..."
exec python -u -m http.server 3000 --bind 0.0.0.0 --directory dist

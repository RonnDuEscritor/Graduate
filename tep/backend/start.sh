#!/bin/sh
set -e

# Internal DOCX generation service (Node) -- bound to 127.0.0.1 only,
# never exposed publicly. PocketBase proxies to it internally.
cd /docx-service
DOCX_SERVICE_PORT=8091 PORT=${PORT:-8090} node server.js &
DOCX_PID=$!

# Start PocketBase (the public-facing process)
/pb/pocketbase serve --http=0.0.0.0:${PORT:-8090} --dir=/pb/pb_data &
PB_PID=$!

# Wait for PocketBase to be ready
sleep 3

# Import collections if not already imported
/pb/pocketbase migrate up --dir=/pb/pb_data 2>/dev/null || true

# If the docx-service dies, take PocketBase down with it so the platform restarts the container
( wait $DOCX_PID; echo "docx-service exited unexpectedly"; kill $PB_PID 2>/dev/null ) &

wait $PB_PID

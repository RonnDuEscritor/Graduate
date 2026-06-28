#!/bin/sh
set -e

# Start PocketBase
/pb/pocketbase serve --http=0.0.0.0:${PORT:-8090} --dir=/pb/pb_data &
PB_PID=$!

# Wait for PocketBase to be ready
sleep 3

# Import collections if not already imported
/pb/pocketbase migrate up --dir=/pb/pb_data 2>/dev/null || true

wait $PB_PID

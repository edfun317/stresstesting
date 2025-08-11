#!/bin/bash

# Default test parameters
VUS=${1:-5}            # Number of concurrent connections, default 5
QPS=${2:-10}           # Target QPS (new connections per second), default 10
CONN_TIME=${3:-60}     # Connection lifetime in seconds, default 60s
DURATION=${4:-5m}      # Test duration, default 5m
RAMP=${5:-30s}         # Ramp-up duration, default 30s
SID=${6:-test_session} # Session ID for login, default test_session

# Print test configuration
echo "Test Configuration:"
echo "- Concurrent Connections: $VUS"
echo "- Target QPS: $QPS"
echo "- Connection Lifetime: ${CONN_TIME}s"
echo "- Test Duration: $DURATION"
echo "- Ramp-up: $RAMP"
echo "- Session ID: $SID"
echo ""

# Run k6 test with parameters
k6 run \
  websocket-basic-test.js \
  --vus $VUS \
  --duration $DURATION \
  -e VUS=$VUS \
  -e TARGET_QPS=$QPS \
  -e CONN_TIME=$CONN_TIME \
  -e TEST_DURATION=$DURATION \
  -e RAMP_DURATION=$RAMP \
  -e SID=$SID

# Usage instructions
if [ $# -eq 0 ]; then
  echo "
Usage: ./run-websocket-test.sh [VUs] [QPS] [CONN_TIME] [DURATION] [RAMP] [SID]
Example: ./run-websocket-test.sh 10 100 60 5m 30s my_session

Parameters:
  VUs        : Number of concurrent connections (default: 5)
  QPS        : Target new connections per second (default: 10)
  CONN_TIME  : Connection lifetime in seconds (default: 60)
  DURATION   : Test duration (default: 5m)
  RAMP       : Ramp-up duration (default: 30s)
  SID        : Session ID for login (default: test_session)
"
fi

# WebSocket and PubSub Testing Scripts

This repository contains scripts for load testing WebSocket connections and PubSub operations using k6.

## Quick Start

Use the main test script with the following syntax:
```bash
./run-soak-tests.sh [test_type] [scenario]
```

### Test Types
- `websocket` - Run WebSocket soak test
- `pubsub` - Run PubSub soak test

### Scenarios
- `small` - Small load test (50 VUs)
- `medium` - Medium load test (200 VUs)
- `large` - Large load test (1000 VUs)

### Examples
```bash
# Run WebSocket test with small load
./run-soak-tests.sh websocket small

# Run PubSub test with large load
./run-soak-tests.sh pubsub large
```

## Test Scenarios Details

### WebSocket Test Configurations

1. **Small Load Test**
   - VUs: 50
   - Connections per VU: 2
   - Duration: 30m
   - Ramp up: 5m

2. **Medium Load Test**
   - VUs: 200
   - Connections per VU: 5
   - Duration: 1h
   - Ramp up: 15m

3. **Large Load Test**
   - VUs: 1000
   - Connections per VU: 5
   - Duration: 2h
   - Ramp up: 20m

### PubSub Test Configurations

1. **Small Load Test**
   - VUs: 50
   - Target RPS: 1,000
   - Duration: 30m
   - Batch Size: 10

2. **Medium Load Test**
   - VUs: 200
   - Target RPS: 5,000
   - Duration: 1h
   - Batch Size: 50

3. **Large Load Test**
   - VUs: 1000
   - Target RPS: 15,000
   - Duration: 2h
   - Batch Size: 100

## WebSocket Protocol Details

### Target Environment
- WebSocket URL: `wss://pnc.inspire888.net/pnc-client-push-execute-task/pigeon/ws`
- Protocol: WebSocket (wss://)
- Authentication: Login message required after connection

### Login Message Format
```json
{
  "status": "",
  "code": "",
  "message": "",
  "operation_code": "C2S_Login",
  "data": {
    "sid": "your_session_id",  // Required
    "ingress": 1               // Required, fixed value
  }
}
```

### Expected Login Response
```json
{
  "status": "Y",
  "code": "",
  "message": "登入成功！",
  "data": null,
  "operation_code": "S2C_Login"
}
```

## Test Output Metrics

Both WebSocket and PubSub tests provide metrics including:
- Number of active connections/operations
- Success/failure rates
- Operation durations
- Error counts

## Notes

- WebSocket tests automatically handle connection establishment and login messages
- PubSub tests require valid GCP authentication (handled automatically via gcloud)
- All scenarios include appropriate warm-up and ramp-up periods
- Test durations and load parameters are pre-configured for each scenario
- Adjust the shell script parameters if different test configurations are needed

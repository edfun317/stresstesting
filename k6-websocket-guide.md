# k6 WebSocket Testing Guide

## Introduction
This guide explains how to perform WebSocket load testing using k6, with practical examples and best practices based on real implementation.

## Basic WebSocket Test Structure

```javascript
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
    vus: 10,
    duration: '1m',
};

export default function () {
    const url = 'ws://example.com/ws';
    const response = ws.connect(url, function(socket) {
        socket.on('open', () => console.log('Connected'));
        socket.on('message', (data) => console.log('Message received'));
        socket.on('close', () => console.log('Disconnected'));
    });

    check(response, {
        'status is 101': (r) => r && r.status === 101,
    });
}
```

## Advanced WebSocket Testing

### Custom Metrics
```javascript
import { Counter, Gauge, Trend } from 'k6/metrics';

// Define custom metrics
const activeConnections = new Gauge('active_connections');
const connectionSuccess = new Counter('connection_success');
const connectionErrors = new Counter('connection_errors');
const connectionDuration = new Trend('connection_duration');
const messagesSent = new Counter('messages_sent');
const messagesReceived = new Counter('messages_received');
```

### Connection Management
```javascript
export default function () {
    const startTime = new Date().getTime();
    
    const conn = ws.connect(url, function (socket) {
        // Track successful connection
        connectionSuccess.add(1);
        activeConnections.add(1);
        
        socket.on('error', (e) => {
            console.error(`WebSocket error: ${e}`);
            connectionErrors.add(1);
        });

        socket.on('close', () => {
            const duration = (new Date().getTime() - startTime) / 1000;
            connectionDuration.add(duration);
            activeConnections.add(-1);
        });
    });

    // Keep connection alive
    while (conn.connected) {
        exec.sleep(0.1);
    }
}
```

### Authentication and Session Management
```javascript
const loginMessage = {
    type: 'login',
    data: {
        sid: 'session_id',
        credentials: 'auth_token'
    }
};

socket.on('open', () => {
    socket.send(JSON.stringify(loginMessage));
});

socket.on('message', (msg) => {
    const response = JSON.parse(msg);
    if (response.type === 'login_success') {
        // Start sending actual test messages
        startTestSequence(socket);
    }
});
```

## Configuration Options

### Basic Configuration
```javascript
export const options = {
    scenarios: {
        ws_test: {
            executor: 'constant-vus',
            vus: 100,
            duration: '5m',
        },
    },
};
```

### Advanced Configuration
```javascript
export const options = {
    scenarios: {
        ws_connections: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 100 },  // Ramp up
                { duration: '5m', target: 100 },  // Hold
                { duration: '2m', target: 0 },    // Ramp down
            ],
        },
    },
    thresholds: {
        'active_connections': ['max>=100'],
        'connection_errors': ['count<10'],
        'connection_duration': ['p(95)<3000'],
    },
};
```

## Environment Variables
```javascript
const TARGET_VUS = parseInt(__ENV.VUS) || 10;
const TEST_DURATION = __ENV.DURATION || '5m';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8080/ws';
```

## Metrics and Reporting

### Custom Metrics Setup
```javascript
// Connection metrics
const activeConnections = new Gauge('active_connections');
const connectionSuccess = new Counter('connection_success');
const connectionErrors = new Counter('connection_errors');

// Message metrics
const messageLatency = new Trend('message_latency');
const messagesProcessed = new Counter('messages_processed');
```

### Results Summary
```javascript
export function handleSummary(data) {
    return {
        stdout: `
Test Results
-----------
Active Connections: ${activeConnections.value}
Total Successful Connections: ${connectionSuccess.value}
Connection Errors: ${connectionErrors.value}
Average Message Latency: ${messageLatency.avg.toFixed(2)}ms
Total Messages Processed: ${messagesProcessed.value}
        `,
        'summary.json': JSON.stringify(data),
    };
}
```

## Best Practices

1. **Connection Management**
   - Always track active connections
   - Implement proper error handling
   - Clean up resources on connection close
   - Use appropriate timeouts

2. **Performance Optimization**
   - Batch messages when possible
   - Implement graceful reconnection logic
   - Monitor memory usage
   - Use appropriate sleep intervals

3. **Metrics Collection**
   - Track key metrics:
     * Connection success/failure rates
     * Message latency
     * Active connections
     * Error rates
   - Use custom metrics for specific needs
   - Implement proper logging

4. **Test Configuration**
   - Start with small VU numbers
   - Include proper ramp-up periods
   - Set realistic thresholds
   - Use environment variables for flexibility

## Common Issues and Solutions

1. **Connection Limits**
```javascript
// System-level connection limits
export const options = {
    systemTags: ['group', 'url'],
    noConnectionReuse: true,
    maxRedirects: 0,
};
```

2. **Memory Management**
```javascript
// Clear message handlers when not needed
socket.off('message');
socket.close();
```

3. **Error Handling**
```javascript
socket.on('error', (e) => {
    console.error(`WebSocket error: ${e}`);
    connectionErrors.add(1);
    // Implement retry logic if needed
});
```

## Running Tests

### Basic Test Run
```bash
k6 run websocket-test.js
```

### With Environment Variables
```bash
k6 run -e VUS=50 -e DURATION=10m -e WS_URL=ws://test.example.com/ws websocket-test.js
```

### With Output
```bash
k6 run --out json=test-results.json websocket-test.js
```

## Monitoring Tips

1. Watch for:
   - Connection establishment times
   - Message processing latency
   - Error rates
   - Memory usage
   - Network bandwidth

2. Key Metrics to Monitor:
   - Active connections
   - Connection success rate
   - Message throughput
   - Error rates
   - Response times

3. Performance Indicators:
   - Connection stability
   - Message delivery reliability
   - System resource usage
   - Error patterns

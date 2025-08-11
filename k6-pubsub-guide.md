# k6 Google Cloud Pub/Sub Testing Guide

## Introduction
This guide explains how to perform load testing of Google Cloud Pub/Sub using k6, with practical examples and best practices based on real implementation.

## Basic Setup

### Required Imports
```javascript
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import encoding from 'k6/encoding';
```

### Custom Metrics Setup
```javascript
// Success rate tracking
const pubSuccessRate = new Rate('pubsub_publish_success_rate');

// Latency monitoring
const pubLatency = new Trend('pubsub_publish_latency');

// Error tracking
const failedPublishes = new Counter('pubsub_failed_publishes');

// Throughput monitoring
const messagesSent = new Counter('pubsub_messages_sent');
const messageBytes = new Trend('pubsub_message_bytes');

// RPS tracking
const currentRPS = new Rate('pubsub_current_rps');
```

## Configuration

### Environment Variables
```javascript
// Essential configuration parameters
const PROJECT_ID = __ENV.PROJECT_ID || 'your-project-id';
const TOPIC_NAME = __ENV.TOPIC_NAME || 'your-topic-name';
const TARGET_RPS = parseInt(__ENV.TARGET_RPS) || 15000;
const BATCH_SIZE = parseInt(__ENV.BATCH_SIZE) || 10;
const MIN_VUS = parseInt(__ENV.MIN_VUS) || 500;
const TEST_DURATION = __ENV.TEST_DURATION || '1h';
const GCLOUD_AUTH_TOKEN = __ENV.GCLOUD_AUTH_TOKEN;

// Validate auth token
if (!GCLOUD_AUTH_TOKEN) {
    console.error('ERROR: GCLOUD_AUTH_TOKEN must be set');
    exec.test.abort();
}
```

### Test Options
```javascript
export const options = {
    scenarios: {
        pubsub_test: {
            executor: 'constant-arrival-rate',
            rate: TARGET_RPS,
            timeUnit: '1s',
            duration: TEST_DURATION,
            // Optimize VU allocation based on workload
            preAllocatedVUs: Math.max(MIN_VUS, Math.ceil(TARGET_RPS / (BATCH_SIZE * 2))),
            maxVUs: Math.max(MIN_VUS * 2, Math.ceil(TARGET_RPS / BATCH_SIZE)),
        },
    },
    thresholds: {
        'pubsub_publish_success_rate': ['rate>0.95'],
        'pubsub_publish_latency': ['p(95)<2000'],
        'pubsub_current_rps': [`rate>=${TARGET_RPS * 0.95}`],
    },
};
```

## Message Publishing

### Message Generation
```javascript
function generateMessage() {
    const now = new Date();
    const expiredTime = new Date(now.getTime() + (30 * 60 * 1000));
    
    return {
        event_id: "unique-event-id",
        id: "message-id",
        category: randomIntBetween(1, 5),
        timestamp: expiredTime.toISOString(),
        // Add other required fields
    };
}
```

### Publishing Function
```javascript
function publishToPubSub(message) {
    const url = `https://pubsub.googleapis.com/v1/projects/${PROJECT_ID}/topics/${TOPIC_NAME}:publish`;
    
    // Convert and encode message
    const messageJson = JSON.stringify(message);
    const messageData = encoding.b64encode(messageJson);
    messageBytes.add(messageJson.length);
    
    // Create message batch
    const messages = Array(BATCH_SIZE).fill(null).map(() => ({
        data: messageData,
        attributes: { test_type: "load_test" },
    }));
    
    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GCLOUD_AUTH_TOKEN}`,
        },
    };
    
    // Measure publishing latency
    const startTime = new Date().getTime();
    const response = http.post(url, JSON.stringify({ messages }), params);
    const endTime = new Date().getTime();
    
    pubLatency.add(endTime - startTime);
    
    // Validate response
    const success = check(response, {
        'status is 200': (r) => r.status === 200,
        'message published successfully': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.messageIds && body.messageIds.length > 0;
            } catch (e) {
                return false;
            }
        },
    });
    
    // Update metrics
    pubSuccessRate.add(success);
    
    if (success) {
        messagesSent.add(BATCH_SIZE);
        currentRPS.add(BATCH_SIZE);
    } else {
        failedPublishes.add(1);
        console.log(`Failed to publish: ${response.status} ${response.body}`);
    }
}
```

## Test Lifecycle Management

### Setup Function
```javascript
export function setup() {
    console.log('Starting Pub/Sub test...');
    
    // Verify topic accessibility
    const url = `https://pubsub.googleapis.com/v1/projects/${PROJECT_ID}/topics/${TOPIC_NAME}`;
    const response = http.get(url, {
        headers: {
            'Authorization': `Bearer ${GCLOUD_AUTH_TOKEN}`,
        },
    });
    
    return { connectionSuccessful: response.status === 200 };
}
```

### Main Test Function
```javascript
export default function() {
    const message = generateMessage();
    publishToPubSub(message);
}
```

### Teardown Function
```javascript
export function teardown(data) {
    if (data.connectionSuccessful) {
        console.log(`
        Test Summary
        ------------
        Messages/Batch: ${BATCH_SIZE}
        Target RPS: ${TARGET_RPS}
        Actual RPS: ${(currentRPS.value * 1000).toFixed(2)}
        Total Messages: ${messagesSent.value}
        Failed Publishes: ${failedPublishes.value}
        Success Rate: ${(pubSuccessRate.value * 100).toFixed(2)}%
        Avg Latency: ${pubLatency.avg.toFixed(2)}ms
        P95 Latency: ${pubLatency.p(95).toFixed(2)}ms
        `);
    }
}
```

## Best Practices

1. **Authentication and Authorization**
   - Always use secure token-based authentication
   - Rotate tokens periodically for long-running tests
   - Use appropriate IAM roles

2. **Message Batching**
   - Use batching to optimize throughput
   - Balance batch size with latency requirements
   - Monitor batch success rates

3. **Performance Optimization**
   - Calculate VUs based on target RPS and batch size
   - Implement proper error handling and retries
   - Monitor and adjust based on quotas

4. **Monitoring and Metrics**
   - Track key metrics:
     * Publish success rate
     * Message latency
     * Throughput (RPS)
     * Error rates
   - Use custom metrics for specific needs
   - Monitor resource usage

## Running Tests

### Basic Test Run
```bash
k6 run pubsub-test.js
```

### With Environment Variables
```bash
k6 run \
  -e PROJECT_ID=your-project \
  -e TOPIC_NAME=your-topic \
  -e TARGET_RPS=1000 \
  -e BATCH_SIZE=10 \
  -e GCLOUD_AUTH_TOKEN=$(gcloud auth print-access-token) \
  pubsub-test.js
```

## Common Issues and Solutions

1. **Rate Limiting**
```javascript
// Implement backoff when hitting quota limits
if (response.status === 429) {
    console.log('Rate limit hit, backing off...');
    sleep(1);
}
```

2. **Authentication Issues**
```javascript
// Regular token refresh
function getAccessToken() {
    // Implement token refresh logic
    return exec.scenario.iterationInTest % 100 === 0
        ? refreshToken()
        : GCLOUD_AUTH_TOKEN;
}
```

3. **Error Handling**
```javascript
// Implement retries for transient failures
function publishWithRetry(message, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        const result = publishToPubSub(message);
        if (result.success) return result;
        sleep(1);
    }
    return { success: false };
}
```

## Performance Tuning Tips

1. **Batch Size Optimization**
   - Start with small batches (10-50 messages)
   - Increase gradually while monitoring latency
   - Find optimal balance between throughput and reliability

2. **VU Calculation**
   - Base VUs = TARGET_RPS / (BATCH_SIZE * ITERATIONS_PER_SECOND)
   - Add buffer for handling latency spikes
   - Monitor VU utilization

3. **Resource Management**
   - Monitor memory usage
   - Track network bandwidth
   - Watch for CPU bottlenecks

4. **Quota Management**
   - Stay within Pub/Sub quotas
   - Implement graceful handling of quota errors
   - Use appropriate project settings

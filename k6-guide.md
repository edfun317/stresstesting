# Comprehensive k6 Options Guide

## Basic Options Configuration

```javascript
export const options = {
    // Virtual Users (VUs) configuration
    vus: 10,              // Number of virtual users
    duration: '30s',      // Test duration

    // OR use stages for ramping up/down
    stages: [
        { duration: '2m', target: 100 },  // Ramp up
        { duration: '5m', target: 100 },  // Stay at peak
        { duration: '2m', target: 0 }     // Ramp down
    ],
};
```

## Detailed Options Reference

### Load Testing Scenarios

```javascript
export const options = {
    scenarios: {
        // Constant load scenario
        constant_load: {
            executor: 'constant-vus',
            vus: 50,
            duration: '5m',
        },

        // Ramping load scenario
        ramping_load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '5m', target: 100 },
                { duration: '10m', target: 100 },
                { duration: '5m', target: 0 },
            ],
        },

        // Constant RPS (Requests Per Second) scenario
        constant_rps: {
            executor: 'constant-arrival-rate',
            rate: 1000,              // 1000 iterations per second
            timeUnit: '1s',          // Per second
            duration: '10m',         // Test duration
            preAllocatedVUs: 100,    // Initial VUs to allocate
            maxVUs: 200,            // Maximum VUs to allow
        }
    }
};
```

### Performance Thresholds

```javascript
export const options = {
    thresholds: {
        // HTTP request duration thresholds
        http_req_duration: [
            'p(95)<500',    // 95% of requests must complete below 500ms
            'p(99)<1000',   // 99% of requests must complete below 1s
            'avg<250',      // Average request duration should be below 250ms
        ],

        // HTTP request failure thresholds
        http_req_failed: ['rate<0.01'],   // Less than 1% can fail

        // Custom metric thresholds
        'my_custom_metric': ['avg<100'],

        // Multiple conditions for the same metric
        checks: [
            'rate>0.9',    // 90% of checks must pass
            'count>100',   // At least 100 checks must be conducted
        ],

        // WebSocket specific metrics
        ws_connecting: ['p(95)<1000'],    // 95% of WS connections under 1s
        ws_msgs_received: ['count>1000'],  // Must receive at least 1000 messages
    },
};
```

### Resource Allocation

```javascript
export const options = {
    // System resource limits
    maxRedirects: 4,          // Maximum number of redirects to follow
    noConnectionReuse: false, // Whether to reuse TCP connections
    noVUConnectionReuse: false, // Whether to reuse connections between VUs
    userAgent: 'MyK6UserAgent/1.0', // Custom User-Agent

    // DNS configuration
    dns: {
        ttl: '1m',          // DNS records time-to-live
        select: 'first',    // IP selection strategy
        policy: 'preferIPv4', // IP version preference
    },

    // TCP connection settings
    discardResponseBodies: true, // Don't save response bodies
    timeout: '10s',            // Request timeout
};
```

### Batch Configuration

```javascript
export const options = {
    batch: {
        // Batch request settings
        maxBatchSize: 100,     // Maximum batch size
        batchPerHost: true,    // Batch requests per host
        timeout: '3s',         // Batch timeout
    }
};
```

### Advanced Testing Patterns

```javascript
export const options = {
    scenarios: {
        // Soak testing
        soak_test: {
            executor: 'constant-vus',
            vus: 50,
            duration: '12h',
        },

        // Spike testing
        spike_test: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 2000 },  // Fast ramp-up
                { duration: '1m', target: 2000 },  // Hold at peak
                { duration: '2m', target: 0 },     // Fast ramp-down
            ],
        },

        // Stress testing
        stress_test: {
            executor: 'ramping-arrival-rate',
            startRate: 50,
            timeUnit: '1s',
            preAllocatedVUs: 50,
            maxVUs: 500,
            stages: [
                { duration: '2m', target: 200 },   // Ramp up load
                { duration: '3h', target: 200 },   // Maintain load
                { duration: '2m', target: 0 },     // Ramp down
            ],
        }
    },

    // Metric tagging
    tags: {
        testid: 'perf_test_001',
        environment: 'staging'
    },
};
```

## Environment-Specific Configuration

```javascript
// Load environment variables
const environment = __ENV.environment || 'staging';
const baseUrl = __ENV.BASE_URL || 'https://staging-api.example.com';

export const options = {
    // Configure based on environment
    scenarios: {
        default: {
            executor: environment === 'production' ? 'constant-vus' : 'ramping-vus',
            vus: environment === 'production' ? 50 : 10,
            duration: environment === 'production' ? '1h' : '5m',
        }
    },

    // Environment-specific thresholds
    thresholds: {
        http_req_duration: [
            environment === 'production' 
                ? 'p(99)<1000' 
                : 'p(99)<2000'
        ],
    }
};
```

## Running Tests with Different Options

```bash
# Basic run
k6 run script.js

# Override options via command line
k6 run --vus 10 --duration 30s script.js

# Use environment variables
k6 run -e BASE_URL=https://test.example.com -e environment=staging script.js

# Run with JSON output
k6 run --out json=results.json script.js

# Run with specific scenario
k6 run --scenario stress_test script.js
```

## Best Practices for Options Configuration

1. **Start Small**: Begin with lower VU counts and gradually increase
2. **Use Stages**: Implement proper ramp-up and ramp-down periods
3. **Set Realistic Thresholds**: Base thresholds on actual SLA requirements
4. **Monitor Resources**: Configure options to prevent resource exhaustion
5. **Environment Awareness**: Use different configurations for different environments
6. **Proper Error Handling**: Set appropriate timeouts and failure thresholds
7. **Documentation**: Comment complex configurations for better maintainability

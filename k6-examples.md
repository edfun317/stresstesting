# k6 Common Script Patterns and Examples

## Basic HTTP Request Test

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    vus: 10,
    duration: '30s',
};

export default function () {
    const response = http.get('https://api.example.com/users');
    
    check(response, {
        'is status 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });

    sleep(1);
}
```

## Authentication and Session Management

```javascript
import http from 'k6/http';
import { check } from 'k6';

export default function () {
    // Login request
    const loginData = {
        username: 'user@example.com',
        password: 'password123'
    };
    
    const loginResponse = http.post('https://api.example.com/login', JSON.stringify(loginData), {
        headers: { 'Content-Type': 'application/json' },
    });
    
    // Extract auth token
    const authToken = loginResponse.json('token');
    
    // Use token in subsequent requests
    const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
    };
    
    // Protected API call
    const userResponse = http.get('https://api.example.com/profile', { headers });
    
    check(userResponse, {
        'profile loaded': (r) => r.status === 200,
    });
}
```

## WebSocket Testing

```javascript
import ws from 'k6/ws';
import { check } from 'k6';

export default function () {
    const url = 'wss://ws.example.com';
    const params = {
        headers: {
            'Authorization': 'Bearer token123',
        },
    };

    const response = ws.connect(url, params, function (socket) {
        socket.on('open', () => {
            console.log('Connected');
            
            // Send message
            socket.send(JSON.stringify({
                type: 'subscribe',
                channel: 'updates'
            }));
        });

        socket.on('message', (data) => {
            console.log('Message received');
            check(data, {
                'is valid message': (d) => d.length > 0,
            });
        });

        socket.on('close', () => console.log('disconnected'));
        
        // Stay connected for 10 seconds
        socket.setTimeout(() => {
            socket.close();
        }, 10000);
    });

    check(response, {
        'connection successful': (r) => r && r.status === 101,
    });
}
```

## Data-Driven Testing

```javascript
import http from 'k6/http';
import { SharedArray } from 'k6/data';
import { check, sleep } from 'k6';

// Load test data from JSON file
const testData = new SharedArray('users', function () {
    return JSON.parse(open('./test-data.json')).users;
});

export default function () {
    const user = testData[__VU % testData.length];
    
    const response = http.post('https://api.example.com/users', JSON.stringify({
        name: user.name,
        email: user.email,
        role: user.role
    }), {
        headers: { 'Content-Type': 'application/json' },
    });
    
    check(response, {
        'user created': (r) => r.status === 201,
    });
    
    sleep(1);
}
```

## Custom Metrics and Trends

```javascript
import http from 'k6/http';
import { Trend, Counter, Rate } from 'k6/metrics';
import { check } from 'k6';

// Custom metrics
const userLoadTime = new Trend('user_load_time');
const failedRequests = new Counter('failed_requests');
const successRate = new Rate('success_rate');

export default function () {
    const response = http.get('https://api.example.com/users');
    
    // Record metrics
    userLoadTime.add(response.timings.duration);
    successRate.add(response.status === 200);
    
    if (response.status !== 200) {
        failedRequests.add(1);
    }
    
    check(response, {
        'is status 200': (r) => r.status === 200,
    });
}
```

## Rate-Limited API Testing

```javascript
import http from 'k6/http';
import { sleep } from 'k6';
import exec from 'k6/execution';

export const options = {
    scenarios: {
        rate_limited_api: {
            executor: 'constant-arrival-rate',
            rate: 100,        // 100 requests per timeUnit
            timeUnit: '1s',   // 1 second
            duration: '1m',   // Run for 1 minute
            preAllocatedVUs: 10,
            maxVUs: 20,
        },
    },
};

export default function () {
    const params = {
        headers: {
            'X-Client-ID': `client-${exec.vu.idInTest}`,
        },
    };
    
    const response = http.get('https://api.example.com/rate-limited', params);
    
    if (response.status === 429) { // Too Many Requests
        console.log('Rate limit hit, backing off...');
        sleep(1);
    }
}
```

## Batch Requests

```javascript
import http from 'k6/http';
import { check } from 'k6';

export default function () {
    const requests = [
        {
            method: 'GET',
            url: 'https://api.example.com/users',
            params: {
                tags: { type: 'users' },
            },
        },
        {
            method: 'GET',
            url: 'https://api.example.com/products',
            params: {
                tags: { type: 'products' },
            },
        },
    ];
    
    const responses = http.batch(requests);
    
    check(responses[0], {
        'users loaded': (r) => r.status === 200,
    });
    
    check(responses[1], {
        'products loaded': (r) => r.status === 200,
    });
}
```

## Error Handling and Retries

```javascript
import http from 'k6/http';
import { sleep } from 'k6';

function makeRequestWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        const response = http.get(url);
        
        if (response.status !== 500) { // Not a server error
            return response;
        }
        
        console.log(`Attempt ${i + 1} failed, retrying...`);
        sleep(1); // Wait before retry
    }
    
    throw new Error(`Failed after ${maxRetries} retries`);
}

export default function () {
    try {
        const response = makeRequestWithRetry('https://api.example.com/flaky-endpoint');
        // Process response
    } catch (error) {
        console.error(`Request failed: ${error.message}`);
    }
}
```

## Setup and Teardown

```javascript
import http from 'k6/http';

export function setup() {
    // Create test data
    const response = http.post('https://api.example.com/test-data', {
        data: 'test setup',
    });
    
    return { testDataId: response.json('id') };
}

export default function (data) {
    // Use test data in main test
    http.get(`https://api.example.com/test-data/${data.testDataId}`);
}

export function teardown(data) {
    // Cleanup test data
    http.del(`https://api.example.com/test-data/${data.testDataId}`);
}

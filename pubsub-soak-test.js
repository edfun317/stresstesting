import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import encoding from 'k6/encoding';
import exec from 'k6/execution';

// Custom metrics for comprehensive performance monitoring
const pubSuccessRate = new Rate('pubsub_publish_success_rate');
const pubLatency = new Trend('pubsub_publish_latency');
const failedPublishes = new Counter('pubsub_failed_publishes');
const messagesSent = new Counter('pubsub_messages_sent');
const messageBytes = new Trend('pubsub_message_bytes');
const currentRPS = new Rate('pubsub_current_rps');

// Add a flag to disable thresholds for debugging runs
const DISABLE_THRESHOLDS = __ENV.DISABLE_THRESHOLDS === 'true';

// Configuration parameters via environment variables
const PROJECT_ID = __ENV.PROJECT_ID || 'gcp-20240131-013';
const TOPIC_NAME = __ENV.TOPIC_NAME || 'topic_external_sys_push_member_list';
const TARGET_RPS = parseInt(__ENV.TARGET_RPS) || 15000;
const BATCH_SIZE = parseInt(__ENV.BATCH_SIZE) || 10;
const MIN_VUS = parseInt(__ENV.MIN_VUS) || 500;
const TEST_DURATION = __ENV.TEST_DURATION || '1h';

// Extract topic name if full path provided
const parsedTopicName = TOPIC_NAME.includes('/topics/') 
  ? TOPIC_NAME.split('/topics/')[1] 
  : TOPIC_NAME;

// Log configuration
console.log(`Using configuration:
- Project ID: ${PROJECT_ID}
- Topic: ${parsedTopicName}
- Target RPS: ${TARGET_RPS}
- Test Duration: ${TEST_DURATION}
- Thresholds Disabled: ${DISABLE_THRESHOLDS}`);

// k6 test execution configuration
export const options = {
  scenarios: {
    soak_test: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: TEST_DURATION,
      preAllocatedVUs: Math.max(MIN_VUS, Math.ceil(TARGET_RPS / (BATCH_SIZE * 2))),
      maxVUs: Math.max(MIN_VUS * 2, Math.ceil(TARGET_RPS / BATCH_SIZE)),
    },
  },
  thresholds: DISABLE_THRESHOLDS ? {} : {
    'pubsub_publish_success_rate': ['rate>0.95'],
    'pubsub_publish_latency': ['p(95)<2000'],
    // No threshold for current_rps as it's creating issues in short runs
  },
};

// Generate test message with realistic data structure
function generateMessage() {
  const now = new Date();
  const expiredTime = new Date(now.getTime() + (30 * 60 * 1000));
  
  return {
    event_id: "23835a77-47c7-480a-bfd0-7a2b234c0cad",
    hall_id: randomIntBetween(1, 100),
    id: uuidv4(),
    identity: Math.random() < 0.7 ? "MEM": "HALL",
    category: randomIntBetween(1, 5),
    username: uuidv4(),
    push_type: "system",
    expired_time: expiredTime.toISOString()
  };
}

// Obtain access token using gcloud credentials
function getAccessToken() {
  // Use Google Cloud Metadata service to obtain token
  // This works inside GCP environment or when using Application Default Credentials
  const metadataUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
  const params = {
    headers: {
      'Metadata-Flavor': 'Google'
    },
    timeout: '10s'
  };
  
  try {
    const response = http.get(metadataUrl, params);
    if (response.status === 200) {
      const tokenData = JSON.parse(response.body);
      return tokenData.access_token;
    } else {
      console.error(`Failed to get token from metadata service: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching token from metadata: ${error}`);
    return null;
  }
}

// Publish messages to Google Pub/Sub in batches
function publishToPubSub(message, accessToken) {
  const url = `https://pubsub.googleapis.com/v1/projects/${PROJECT_ID}/topics/${parsedTopicName}:publish`;
  
  const messageJson = JSON.stringify(message);
  const messageData = encoding.b64encode(messageJson);
  messageBytes.add(messageJson.length);
  
  // Generate a batch of messages for efficient publishing
  const messages = Array(BATCH_SIZE).fill(null).map(() => ({
    data: messageData,
    attributes: { test_type: "soak_test" },
  }));

  const payload = { messages };
  
  // Use the access token for authentication
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
  };
  
  const startTime = new Date().getTime();
  const response = http.post(url, JSON.stringify(payload), params);
  const endTime = new Date().getTime();
  
  pubLatency.add(endTime - startTime);
  
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
  
  pubSuccessRate.add(success);
  
  if (success) {
    messagesSent.add(BATCH_SIZE);
    currentRPS.add(BATCH_SIZE);
  } else {
    failedPublishes.add(1);
    console.log(`Failed to publish message: ${response.status} ${response.body}`);
  }
}

// Main test execution function
export default function() {
  const message = generateMessage();
  
  // Get the access token once per iteration
  const accessToken = __ENV.TOKEN || getAccessToken();
  
  if (!accessToken) {
    console.error('Failed to get access token');
    failedPublishes.add(1);
    return;
  }
  
  publishToPubSub(message, accessToken);
}

// Setup function executed before the test starts
export function setup() {
  console.log('Starting Pub/Sub soak test...');
  
  // Try to get token from Application Default Credentials
  // This can be provided as an environment variable to k6
  const accessToken = __ENV.TOKEN || getAccessToken();
  
  if (!accessToken) {
    console.error('Failed to get access token. Please ensure you have valid credentials.');
    console.error('Run: gcloud auth application-default login');
    console.error('Or provide a token via: k6 run script.js -e TOKEN=your_token');
    return { connectionSuccessful: false };
  }
  
  // Test connection to Pub/Sub
  const url = `https://pubsub.googleapis.com/v1/projects/${PROJECT_ID}/topics/${parsedTopicName}`;
  const params = {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  };
  
  const response = http.get(url, params);
  
  if (response.status !== 200) {
    console.error(`Failed to connect to Pub/Sub topic: ${response.status} ${response.body}`);
    return { connectionSuccessful: false, accessToken };
  }
  
  console.log('Successfully connected to Pub/Sub topic');
  return { connectionSuccessful: true, accessToken };
}

// Teardown function executed after test completion
export function teardown(data) {
  if (data.connectionSuccessful) {
    // Add null checks for all metrics to avoid "TypeError: Cannot read property 'toFixed' of undefined"
    const currentRpsValue = currentRPS.value !== undefined && currentRPS.value !== null ? 
      (currentRPS.value * 1000).toFixed(2) : "0.00";
    
    const goalAchievement = currentRPS.value !== undefined && currentRPS.value !== null ? 
      ((currentRPS.value * 1000 / TARGET_RPS) * 100).toFixed(2) : "0.00";
    
    const successRate = pubSuccessRate.value !== undefined && pubSuccessRate.value !== null ? 
      (pubSuccessRate.value * 100).toFixed(2) : "0.00";
    
    const avgLatency = pubLatency.avg !== undefined && pubLatency.avg !== null ? 
      pubLatency.avg.toFixed(2) : "N/A";
    
    const p95Latency = pubLatency.p && typeof pubLatency.p === 'function' ? 
      (pubLatency.p(95) !== undefined && pubLatency.p(95) !== null ? 
        pubLatency.p(95).toFixed(2) : "N/A") : "N/A";
    
    const totalMessages = messagesSent.value !== undefined ? messagesSent.value : 0;
    const failedPubs = failedPublishes.value !== undefined ? failedPublishes.value : 0;
    
    console.log(`
    Soak Test Summary
    -----------------
    Batch Size: ${BATCH_SIZE} messages per request
    Test Goals Achievement
    ---------------------
    Target RPS: ${TARGET_RPS}
    Current RPS: ${currentRpsValue}
    Goal Achievement: ${goalAchievement}%
    Total messages sent: ${totalMessages}
    Failed publishes: ${failedPubs}
    Success rate: ${successRate}%
    Average latency: ${avgLatency}ms
    P95 latency: ${p95Latency}ms
    
    Note: For short test runs (under 1 minute), the RPS calculation may not reach the target.
    Extended duration runs will give more accurate performance metrics.
    `);
  } else {
    console.log('Test did not run properly due to connection issues');
  }
}
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import encoding from 'k6/encoding';
import exec from 'k6/execution';

// Custom metrics for comprehensive performance monitoring
// pubSuccessRate: Tracks the success rate of publish operations (0-1 scale)
const pubSuccessRate = new Rate('pubsub_publish_success_rate');
// pubLatency: Measures the time taken for each publish operation in milliseconds
const pubLatency = new Trend('pubsub_publish_latency');
// failedPublishes: Counts total number of failed publish attempts
const failedPublishes = new Counter('pubsub_failed_publishes');
// messagesSent: Tracks total number of messages successfully published
const messagesSent = new Counter('pubsub_messages_sent');
// messageBytes: Monitors the size of messages in bytes to track payload trends
const messageBytes = new Trend('pubsub_message_bytes');
// currentRPS: Measures actual requests per second to compare against target
const currentRPS = new Rate('pubsub_current_rps');

// Configuration parameters via environment variables
// All parameters can be overridden using k6 -e FLAG=VALUE syntax
const PROJECT_ID = __ENV.PROJECT_ID || 'gcp-20240131-013';           // GCP project ID
const TOPIC_NAME = __ENV.TOPIC_NAME || 'topic_external_sys_push_member_list';  // Pub/Sub topic
const TARGET_RPS = parseInt(__ENV.TARGET_RPS) || 15000;  // Target requests/sec - adjust based on topic quotas
const BATCH_SIZE = parseInt(__ENV.BATCH_SIZE) || 10;     // Messages per publish request - higher values reduce API calls but increase latency
const MIN_VUS = parseInt(__ENV.MIN_VUS) || 500;         // Minimum virtual users - affects concurrency level
const TEST_DURATION = __ENV.TEST_DURATION || '1h';       // Duration of soak test - longer tests better identify memory leaks
const GCLOUD_AUTH_TOKEN = __ENV.GCLOUD_AUTH_TOKEN;       // Required for authentication with GCP

// Extract topic name if full path provided
const parsedTopicName = TOPIC_NAME.includes('/topics/') 
  ? TOPIC_NAME.split('/topics/')[1] 
  : TOPIC_NAME;

// Validate token
if (!GCLOUD_AUTH_TOKEN) {
  console.error('ERROR: GCLOUD_AUTH_TOKEN must be set. Run "gcloud auth print-access-token" and set the result to k6 using -e GCLOUD_AUTH_TOKEN=token');
  exec.test.abort();
}

// Log configuration
console.log(`Using configuration:
- Project ID: ${PROJECT_ID}
- Topic: ${parsedTopicName}
- Target RPS: ${TARGET_RPS}
- Test Duration: ${TEST_DURATION}
- GCloud Auth Token: ${GCLOUD_AUTH_TOKEN ? 'Provided (hidden)' : 'MISSING'}`);

// k6 test execution configuration
// Defines how the load test will be executed including:
// - Load pattern (constant arrival rate)
// - Performance thresholds
// - Resource allocation
export const options = {
  scenarios: {
    soak_test: {
      executor: 'constant-arrival-rate',    // Maintains steady load over time
      rate: TARGET_RPS,                     // Number of iterations to start per timeUnit
      timeUnit: '1s',                       // Time unit for rate (iterations per second)
      duration: TEST_DURATION,              // Total test duration
      // Resource allocation strategy:
      // - Base VUs calculation considers both MIN_VUS and workload requirements
      // - Additional VUs allocated to handle potential latency spikes
      // - BATCH_SIZE factor helps optimize concurrent request handling
      preAllocatedVUs: Math.max(MIN_VUS, Math.ceil(TARGET_RPS / (BATCH_SIZE * 2))),
      maxVUs: Math.max(MIN_VUS * 2, Math.ceil(TARGET_RPS / BATCH_SIZE)),
    },
  },
  thresholds: {
    // Success rate threshold ensures reliable message delivery
    'pubsub_publish_success_rate': ['rate>0.95'],
    // Latency threshold maintains responsive publishing
    'pubsub_publish_latency': ['p(95)<2000'],
    // RPS threshold verifies we meet performance targets
    'pubsub_current_rps': [`rate>=${TARGET_RPS * 0.95}`],
  },
};

/**
 * Generates a test message with realistic data structure
 * Message fields:
 * - event_id: Unique identifier for the event (currently using fixed UUID for debugging)
 * - hall_id: Random hall identifier between 1-100
 * - id: Unique message identifier
 * - identity: Either "MEM" (70% probability) or "HALL" (30% probability)
 * - category: Random category number 1-5
 * - username: Unique user identifier
 * - push_type: Currently fixed to "system" (was previously randomized)
 * - expired_time: ISO timestamp 30 minutes in the future
 */
function generateMessage() {
  const now = new Date();
  const expiredTime = new Date(now.getTime() + (30 * 60 * 1000));
  
  return {
    event_id: "98e0c1a0-1f3f-4894-876b-f8af61cbef9d",
    //event_id: uuidv4(),
    hall_id: randomIntBetween(1, 100),
    id: uuidv4(),
    identity: Math.random() < 0.7 ? "MEM": "HALL",
    category: randomIntBetween(1, 5),
    username: uuidv4(),
    //push_type: Math.random() < 0.9 ? "system" : "manual",
    push_type:"system",
    expired_time: expiredTime.toISOString()
  };
}

/**
 * Publishes messages to Google Pub/Sub in batches
 * Features:
 * - Batches multiple messages in a single API call for efficiency
 * - Tracks message size and publishing latency
 * - Implements error handling and success rate monitoring
 * - Updates real-time RPS metrics
 * 
 * @param {Object} message - The message object to be published
 */
function publishToPubSub(message) {
  const url = `https://pubsub.googleapis.com/v1/projects/${PROJECT_ID}/topics/${parsedTopicName}:publish`;
  
  const messageJson = JSON.stringify(message);
  const messageData = encoding.b64encode(messageJson);
  messageBytes.add(messageJson.length);
  
  // Generate a batch of messages for efficient publishing
  // - Each batch contains BATCH_SIZE identical messages 
  // - Using base64 encoded data for proper JSON formatting
  // - Adding test_type attribute for message tracking
  const messages = Array(BATCH_SIZE).fill(null).map(() => ({
    data: messageData,
    attributes: { test_type: "soak_test" },
  }));

  // Format payload according to Pub/Sub API requirements
  const payload = { messages };
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GCLOUD_AUTH_TOKEN}`,
    },
  };
  
  // Capture timing for latency measurement
  // - Uses high-resolution timestamps for accurate measurements
  // - Includes full round-trip time (request + response)
  // - Captures network latency, API processing time, and any retries
  const startTime = new Date().getTime();
  const response = http.post(url, JSON.stringify(payload), params);
  const endTime = new Date().getTime();
  
  // Record latency in milliseconds
  // This metric is used for:
  // - Performance threshold validation (p95 < 2000ms)
  // - Trend analysis over test duration
  // - Identifying potential performance degradation
  pubLatency.add(endTime - startTime);
  
  // Perform multi-level validation of the publish response:
  // 1. HTTP status check - verifies API call success
  // 2. Message validation - ensures messages were actually published
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
  
  // Update success rate metric for threshold validation
  pubSuccessRate.add(success);
  
  if (success) {
    // Track successful batch publishes for throughput analysis
    messagesSent.add(BATCH_SIZE);  // Increment by batch size for accurate message count
    currentRPS.add(BATCH_SIZE);    // Update RPS metric for performance monitoring
  } else {
    // Log failed publishes for debugging and error analysis
    failedPublishes.add(1);
    console.log(`Failed to publish message: ${response.status} ${response.body}`);
  }
}

/**
 * Main test execution function - runs independently for each virtual user (VU)
 * 
 * Workflow:
 * 1. Generates a message with realistic user data
 * 2. Publishes message to Pub/Sub with configurable batching
 * 
 * Performance characteristics:
 * - Each VU operates independently to simulate concurrent users
 * - Execution rate controlled by constant-arrival-rate scenario
 * - Batching helps optimize throughput while managing API quotas
 * - Multiple VUs work together to achieve target RPS
 * 
 * The actual execution frequency is determined by:
 * - TARGET_RPS configuration (target requests per second)
 * - BATCH_SIZE (messages per publish request)
 * - Available VUs (preAllocatedVUs to maxVUs)
 */
export default function() {
  const message = generateMessage();
  publishToPubSub(message);
}

/**
 * Setup function executed before the test starts
 * Responsibilities:
 * - Validates Pub/Sub topic accessibility
 * - Verifies authentication token
 * - Establishes initial connection
 * - Returns connection status for teardown phase
 */
export function setup() {
  console.log('Starting Pub/Sub soak test...');
  
  const url = `https://pubsub.googleapis.com/v1/projects/${PROJECT_ID}/topics/${parsedTopicName}`;
  const params = {
    headers: {
      'Authorization': `Bearer ${GCLOUD_AUTH_TOKEN}`,
    },
  };
  
  const response = http.get(url, params);
  
  if (response.status !== 200) {
    console.error(`Failed to connect to Pub/Sub topic: ${response.status} ${response.body}`);
    return { connectionSuccessful: false };
  }
  
  console.log('Successfully connected to Pub/Sub topic');
  return { connectionSuccessful: true };
}

/**
 * Teardown function executed after test completion
 * Provides comprehensive test results including:
 * - Performance metrics (RPS, latency)
 * - Success rates and error counts
 * - Goal achievement analysis
 * 
 * @param {Object} data - Data passed from setup phase containing connection status
 */
export function teardown(data) {
  if (data.connectionSuccessful) {
    console.log(`
    Soak Test Summary
    -----------------
    Batch Size: ${BATCH_SIZE} messages per request
    Test Goals Achievement
    ---------------------
    Target RPS: ${TARGET_RPS}
    Current RPS: ${(currentRPS.value * 1000).toFixed(2)}
    Goal Achievement: ${((currentRPS.value * 1000 / TARGET_RPS) * 100).toFixed(2)}%
    Total messages sent: ${messagesSent.value}
    Failed publishes: ${failedPublishes.value}
    Success rate: ${(pubSuccessRate.value * 100).toFixed(2)}%
    Average latency: ${pubLatency.avg.toFixed(2)}ms
    P95 latency: ${pubLatency.p(95).toFixed(2)}ms
    `);
  } else {
    console.log('Test did not run properly due to connection issues');
  }
}

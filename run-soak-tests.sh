#!/bin/bash

# Function to print help
print_help() {
    echo "Usage: $0 [test_type] [scenario]"
    echo ""
    echo "Test Types:"
    echo "  websocket   - Run WebSocket soak test"
    echo "  pubsub     - Run PubSub soak test"
    echo ""
    echo "Scenarios:"
    echo "  small      - Small load test (50 VUs)"
    echo "  medium     - Medium load test (200 VUs)"
    echo "  large      - Large load test (1000 VUs)"
    echo ""
    echo "Examples:"
    echo "  $0 websocket small   - Run WebSocket test with small load"
    echo "  $0 pubsub large      - Run PubSub test with large load"
}

# WebSocket test scenarios
run_websocket_test() {
    local size=$1
    local vus=50
    local conn_per_vu=2
    local duration="30m"
    local ramp="5m"
    
    case $size in
        "medium")
            vus=200
            conn_per_vu=5
            duration="1h"
            ramp="15m"
            ;;
        "large")
            vus=1000
            conn_per_vu=5
            duration="2h"
            ramp="20m"
            ;;
    esac

    echo "Running WebSocket soak test with:"
    echo "- VUs: $vus"
    echo "- Connections per VU: $conn_per_vu"
    echo "- Duration: $duration"
    echo "- Ramp up: $ramp"
    
    k6 run websocket-soak-test.js \
        -e WS_URL=wss://pnc.inspire888.net/pnc-client-push-execute-task/pigeon/ws \
        -e MIN_VUS=$vus \
        -e CONNECTIONS_PER_VU=$conn_per_vu \
        -e MESSAGE_INTERVAL=5 \
        -e RAMP_DURATION=$ramp \
        -e TEST_DURATION=$duration
}

# PubSub test scenarios
run_pubsub_test() {
    local size=$1
    local vus=50
    local target_rps=1000
    local duration="30m"
    local batch_size=10
    
    case $size in
        "medium")
            vus=200
            target_rps=5000
            duration="1h"
            batch_size=50
            ;;
        "large")
            vus=1000
            target_rps=15000
            duration="2h"
            batch_size=100
            ;;
    esac

    echo "Running PubSub soak test with:"
    echo "- VUs: $vus"
    echo "- Target RPS: $target_rps"
    echo "- Duration: $duration"
    echo "- Batch Size: $batch_size"
    
    k6 run pubsub-soak-test.js \
        -e PROJECT_ID=gcp-20240131-013 \
        -e TOPIC_NAME=topic_external_sys_push_member_list \
        -e GCLOUD_AUTH_TOKEN=$(gcloud auth print-access-token) \
        -e MIN_VUS=$vus \
        -e TARGET_RPS=$target_rps \
        -e BATCH_SIZE=$batch_size \
        -e TEST_DURATION=$duration
}

# Main script
if [ "$#" -ne 2 ]; then
    print_help
    exit 1
fi

test_type=$1
scenario=$2

case $test_type in
    "websocket")
        run_websocket_test $scenario
        ;;
    "pubsub")
        run_pubsub_test $scenario
        ;;
    *)
        echo "Invalid test type: $test_type"
        print_help
        exit 1
        ;;
esac

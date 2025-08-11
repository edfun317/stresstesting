# Pub/Sub 壓力測試標準作業程序 (SOP)

[English Version Below](#pubsub-stress-testing-standard-operating-procedure-sop)

## 前置條件
1. 存取已安裝 K6 的 GCP 虛擬機器（目前可用：Staging 專案 `gcp-20240131-013` 中的 `vm-testing-ed`）

## 測試執行步驟
1. 存取測試用虛擬機器：
   - 進入 GCP Console > Compute Engine > VM執行個體
   - 找到 `vm-testing-ed`
   - 點選左上角的 SSH 按鈕進行連線

2. 進入測試腳本目錄：
   ```bash
   cd /k6/script
   ```

3. 找到測試腳本：`pubsub-soak-test.js`

4. 執行壓力測試：
   ```bash
   k6 run pubsub-soak-test.js \
     -e PROJECT_ID=gcp-20240131-013 \
     -e TOPIC_NAME=topic_external_sys_push_member_list \
     -e GCLOUD_AUTH_TOKEN=$(gcloud auth print-access-token) \
     -e MIN_VUS=300 \
     -e TARGET_RPS=1500 \
     -e BATCH_SIZE=15 \
     -e TEST_DURATION=5s
   ```

   參數說明：
   - `PROJECT_ID`：目標 GCP 專案識別碼
   - `TOPIC_NAME`：要發布訊息的 Pub/Sub 主題
   - `GCLOUD_AUTH_TOKEN`：GCP 服務認證令牌（自動生成）
   - `MIN_VUS`：最小虛擬用戶數（並發連接數）
   - `TARGET_RPS`：目標每秒請求數（訊息發布速率）
   - `BATCH_SIZE`：每批次發布的訊息數量
   - `TEST_DURATION`：壓力測試持續時間

## 監控和驗證

### 1. 即時測試驗證
- 監控 K6 輸出是否有錯誤訊息
- 若無錯誤訊息，表示訊息已成功交付給 Pub/Sub

### 2. 客戶端訊息通知伺服器
- 確認推播通知是否被正確接收和處理

### 3. GCP 監控
監控以下指標：
- Pod 資源使用情況：
  - 過濾條件：`Pod Name =~ backend-go-pnc-client-push-execute-task.*`
  - 監控指標：CPU 和記憶體使用趨勢

### 4. 錯誤日誌監控
在 Logs Explorer 中使用以下過濾條件：
```
jsonPayload.service="backend_go_pnc_client_push_execute_task" AND 
jsonPayload.log_type="ERROR_LOG"
```

### 5. 效能指標
客戶端推播服務使用環型緩衝區儲存最近 10 萬筆訊息處理時間：
- 記錄的指標：
  - 從 Consumer 到 WebSocket 推送的處理時間
  - 總處理時間（從發布到完成）
  - 效能百分位數（55、95、99 百分位），單位為毫秒
  - 成功/失敗計數統計
- 每分鐘產生一次稽核日誌

### 6. Pub/Sub 指標
監控 Pub/Sub 效能：
- 主題：`projects/gcp-20240131-013/topics/topic_external_sys_push_member_list`
- 關鍵指標：
  - 發布速率
  - 訂閱速率
  - 訊息延遲
  - 錯誤率

---

# Pub/Sub Stress Testing Standard Operating Procedure (SOP)

## Prerequisites
1. Access a GCP VM instance with K6 installed (Currently available: `vm-testing-ed` in Staging project `gcp-20240131-013`)

## Test Execution Steps
1. Access the test VM:
   - Navigate to GCP Console > Compute Engine > VM instances
   - Locate `vm-testing-ed`
   - Click the SSH button in the upper left corner to connect

2. Navigate to the test script directory:
   ```bash
   cd /k6/script
   ```

3. Locate the test script: `pubsub-soak-test.js`

4. Execute the stress test:
   ```bash
   k6 run pubsub-soak-test.js \
     -e PROJECT_ID=gcp-20240131-013 \
     -e TOPIC_NAME=topic_external_sys_push_member_list \
     -e GCLOUD_AUTH_TOKEN=$(gcloud auth print-access-token) \
     -e MIN_VUS=300 \
     -e TARGET_RPS=1500 \
     -e BATCH_SIZE=15 \
     -e TEST_DURATION=5s
   ```

   Parameter explanation:
   - `PROJECT_ID`: Target GCP project identifier
   - `TOPIC_NAME`: The Pub/Sub topic to publish messages to
   - `GCLOUD_AUTH_TOKEN`: Authentication token for GCP services (auto-generated)
   - `MIN_VUS`: Minimum number of Virtual Users (concurrent connections)
   - `TARGET_RPS`: Target Requests Per Second (message publish rate)
   - `BATCH_SIZE`: Number of messages per batch publish operation
   - `TEST_DURATION`: Duration of the stress test

## Monitoring and Verification

### 1. Immediate Test Verification
- Monitor the K6 output for any error messages
- Successful message delivery will show no errors in the output

### 2. Client Message Notification Server
- Verify that push notifications are being received and processed

### 3. GCP Monitoring
Monitor the following metrics:
- Pod resource utilization:
  - Filter: `Pod Name =~ backend-go-pnc-client-push-execute-task.*`
  - Metrics: CPU and Memory usage trends

### 4. Error Log Monitoring
Check Logs Explorer with filters:
```
jsonPayload.service="backend_go_pnc_client_push_execute_task" AND 
jsonPayload.log_type="ERROR_LOG"
```

### 5. Performance Metrics
The client push service implements a circular buffer storing the last 100k message processing times:
- Metrics recorded:
  - Consumer to WebSocket push duration
  - Total processing time (Publish to completion)
  - Performance percentiles (55th, 95th, 99th) in milliseconds
  - Success/failure counters
- Audit logs generated every minute

### 6. Pub/Sub Metrics
Monitor Pub/Sub performance:
- Topic: `projects/gcp-20240131-013/topics/topic_external_sys_push_member_list`
- Key metrics:
  - Publish rates
  - Subscribe rates
  - Message latency
  - Error rates

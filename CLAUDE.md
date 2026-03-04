# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HemoScreen Gateway is an Electron-based desktop application that acts as a local TCP server gateway for medical laboratory devices. It receives lab results in POCT1 XML format, parses them, and forwards them to a remote SaaS API with offline queueing capabilities.

## Running the Application

```bash
npm start              # Start the Electron app
```

## Architecture

### Core Data Flow

1. **TCP Server** (`tcpServer.js`) listens on a configurable port (default 5000)
2. Medical device connects and sends XML messages (POCT1 format)
3. XML is parsed and converted to JSON payload
4. **API Service** (`apiService.js`) attempts to send to remote SaaS API
5. On failure, payload is queued in SQLite database via **Queue Service** (`queueService.js`)
6. **Retry Worker** (`retryWorker.js`) processes pending queue items every 15 seconds
7. Electron UI displays connection status and queue count

### Message Processing Pipeline

- **Supported message types**: `OBS.R01` (observations), `HEL.R01`, `DST.R01`
- **ACK response**: Always sent to device immediately after receiving complete message
- **Buffer handling**: TCP data is buffered until closing tag is found (`</OBS.R01>`, etc.)
- **Observations parsing**: Single or array of observations are normalized to array format

### Key Components

**Backend (Main Process)**
- `index.js` - Electron main process, initializes window and services
- `tcpServer.js` - TCP server handling POCT1 XML messages
- `apiService.js` - HTTP client for forwarding to SaaS API
- `queueService.js` - SQLite-based persistent queue for offline storage
- `retryWorker.js` - Background worker that retries queued items every 15s
- `configService.js` - File-based configuration (config.json)

**Frontend (Renderer Process)**
- `index.html` - Basic UI with configuration form and status display
- `renderer.js` - Handles UI updates from IPC events
- `preload.js` - Context bridge for secure IPC communication

### Database Schema

SQLite database (`gateway.db`) with single table:
```sql
outbound_queue (
  id INTEGER PRIMARY KEY,
  payload TEXT,           -- JSON stringified lab result
  status TEXT,            -- 'pending' or 'sent'
  attempts INTEGER,       -- Retry counter
  last_error TEXT,        -- Last error message
  created_at DATETIME
)
```

### Configuration

Configuration stored in `config.json`:
- `apiUrl` - SaaS backend URL
- `apiToken` - Bearer token for API authentication
- `tcpPort` - TCP server listening port
- `deviceSerial` - Device identifier sent with each payload

### API Payload Format

Sent to `${apiUrl}/api/v1/lab/hemoscreen`:
```json
{
  "control_id": "12345",
  "message_type": "OBS.R01",
  "patient_identifier": "PATIENT-123",
  "device_serial": "HS-LOCAL-01",
  "observations": [
    {
      "loinc": "718-7",
      "name": "Hemoglobin",
      "value": 14.5,
      "unit": "g/dL"
    }
  ]
}
```

## Important Implementation Details

### Error Handling Strategy
- Network failures automatically queue payloads for retry
- Device ACK is sent regardless of API success/failure
- No maximum retry limit currently implemented
- Queue items remain in 'pending' status until successfully sent

### IPC Communication
- Uses contextBridge for secure renderer ↔ main process communication
- Events: `save-config`, `device-status`, `queue-update`, `config-saved`
- `sendStatus()` in index.js broadcasts to renderer

### XML Parsing Notes
- Uses fast-xml-parser with `ignoreAttributes: false`
- Attributes accessed via `@_V` (value) and `@_DN` (display name)
- Control ID extracted from `HDR.control_id.@_V` or defaults to "1"
- Observation values parsed as floats

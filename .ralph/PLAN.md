# Sheets to GroupMe Integration

## Overview
Automate adding new members to a GroupMe group when they submit their info via Google Sheets.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Google Sheet  │────▶│  Cron Runner    │────▶│    GroupMe      │
│   (Source)      │     │  (Fly.io/Edge)  │     │    (Target)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  Local State    │
                       │  (Processed IDs)│
                       └─────────────────┘
```

## Data Flow

1. **Cron triggers** (hourly)
2. **Fetch** new rows from Google Sheet (filter by date/newer than last run)
3. **Deduplicate** against local state
4. **For each new user:**
   - Extract contact info
   - Call GroupMe API to add member
   - Record ID to local state
5. **On error:**
   - Log error
   - Send notification (Slack/email/log)
   - Continue processing other rows

## Google Sheets Integration

**API:** Google Sheets API v4
**Auth:** Service Account (domain-wide delegation)
**Method:** `spreadsheets.values.get` with filtered query

**Query Strategy:**
```typescript
// Get all rows, filter in code
// Or use A1 notation to get range
// Track last processed timestamp internally
```

## GroupMe Integration

**API:** GroupMe API v3
**Auth:** OAuth 2.0 (Client Credentials or Personal Access Token)
**Method:** `POST /groups/{group_id}/members/add`

**Payload:**
```json
{
  "member": {
    "email": "user@example.com",
    "phone_number": "+1234567890",
    "name": "User Name"
  }
}
```

## Local State

**Storage:** `data/processed_rows.json` (file-based)
**Format:**
```json
{
  "lastRun": "2024-01-01T00:00:00Z",
  "processedRowIds": ["row_id_1", "row_id_2"]
}
```

## Features

| ID | Category | Description | Steps |
|----|----------|-------------|-------|
| INIT-001 | setup | Initialize Bun + TypeScript + Effect project | 1. Create package.json<br>2. Install dependencies<br>3. Configure tsconfig |
| STRUCT-001 | setup | Create project directory structure | 1. Create src/google, src/groupme, src/state, src/scheduler<br>2. Add index.ts exports |
| CONFIG-001 | setup | Environment configuration with Effect Config | 1. Define config schema<br>2. Load from env vars<br>3. Validate required fields |
| GSheet-001 | integration | Google Sheets API client with Effect | 1. Create GoogleHttpClient layer<br>2. Implement fetchRows function<br>3. Parse ValueRange response |
| GSheet-002 | integration | Configurable column mapping | 1. Accept COLUMN_NAME, COLUMN_EMAIL, COLUMN_PHONE envs<br>2. Map headers to user data |
| GMe-001 | integration | GroupMe API client with Effect | 1. Create GroupMeHttpClient layer<br>2. Implement addMember function<br>3. Handle response |
| STATE-001 | core | Local state store (file-based) | 1. Load state.json<br>2. Track processed row IDs<br>3. Save on changes |
| SYNC-001 | core | Main sync loop with deduplication | 1. Fetch new rows<br>2. Filter processed IDs<br>3. Add each to GroupMe<br>4. Update state |
| CRON-001 | deployment | Hourly cron scheduler | 1. Run sync on interval<br>2. Exit after completion |
| DOCKER-001 | deployment | Dockerfile for Fly.io | 1. Multi-stage build<br>2. Copy source<br>3. Install bun<br>4. Run with entrypoint |
| FLY-001 | deployment | Fly.io configuration | 1. Create fly.toml<br>2. Configure region (sfo)<br>3. Add volume for state |
| VERIFY-001 | quality | Build and typecheck verification | 1. bun run build<br>2. bun run typecheck |

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Bun (fast, native TypeScript)
- **Framework:** Effect (typed functional programming)
- **Deployment:** Fly.io
- **Scheduling:** cron in container or external cron service

## Project Structure

```
├── src/
│   ├── main.ts           # Entry point
│   ├── google/
│   │   ├── client.ts     # Sheets API client
│   │   └── types.ts      # Google types
│   ├── groupme/
│   │   ├── client.ts     # GroupMe API client
│   │   └── types.ts      # GroupMe types
│   ├── state/
│   │   ├── store.ts      # Local state management
│   │   └── types.ts      # State types
│   ├── scheduler/
│   │   └── cron.ts       # Cron job runner
│   └── error/
│       └── notify.ts     # Error notifications
├── data/
│   └── state.json        # Local state file
├── .env                  # Secrets (gitignored)
├── package.json
├── tsconfig.json
└── Dockerfile
```

## Configuration

Required env vars:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GROUPME_ACCESS_TOKEN`
- `GROUPME_GROUP_ID`
- `NOTIFICATION_WEBHOOK_URL` (Slack or similar)

## Open Questions (Resolved)

- [x] Column mapping - Configurable via env vars (deferred)
- [ ] Notification method - Backlog (not urgent)
- [x] Fly.io region - SFO (west coast)

## Configuration

Required env vars:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GROUPME_ACCESS_TOKEN`
- `GROUPME_GROUP_ID`
- `COLUMN_NAME` (column header for name)
- `COLUMN_EMAIL` (column header for email)
- `COLUMN_PHONE` (column header for phone)
- `FLY_REGION` (default: sfo)

## References

- Google Sheets API: https://developers.google.com/sheets/api
- GroupMe API: https://dev.groupme.com/docs/v3
- Effect: https://effect.website

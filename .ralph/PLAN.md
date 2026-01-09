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

### Setup
| ID | Description | Steps |
|----|-------------|-------|
| INIT-001 | Initialize Bun + TypeScript + Effect project | Create package.json, install deps, configure tsconfig |
| STRUCT-001 | Create project directory structure | Create src/* directories with barrel exports |
| CONFIG-001 | Environment configuration with Effect Config | Define config schema, load env vars, validate |
| BIOME-001 | Configure Biome formatter and linter | Install biome, create biome.json, add scripts |

### Integration (Google Sheets)
| ID | Description | Steps |
|----|-------------|-------|
| GSheet-001 | Google Sheets API client with Effect | Create HttpClient layer, fetch rows, parse response |
| GSheet-002 | Google Sheets authentication | JWT auth, credential loading, token refresh |
| GSheet-003 | Configurable column mapping | Accept COLUMN_* envs, parse headers, extract data |

### Integration (GroupMe)
| ID | Description | Steps |
|----|-------------|-------|
| GMe-001 | GroupMe API client with Effect | Create HttpClient layer, add member endpoint |
| GMe-002 | GroupMe authentication | Bearer token, handle 401, validate group access |
| GMe-003 | Member addition with duplicate detection | Check existing, handle already_member response |

### Core
| ID | Description | Steps |
|----|-------------|-------|
| STATE-001 | Local state store (file-based) | Load/save state.json, track processed IDs |
| STATE-002 | Row ID generation strategy | Stable ID from row data, handle duplicates |
| SYNC-001 | Main sync loop orchestration | Fetch → filter → add → update state → report |
| SYNC-002 | Error handling and recovery | Catch errors, continue processing, collect failures |
| CORE-001 | Structured logging with Effect | Logger layer, timestamps, JSON output |
| CORE-002 | Effect schema for validation | UserContact schema, SyncResult schema, validation |

### Deployment
| ID | Description | Steps |
|----|-------------|-------|
| CRON-001 | Hourly cron scheduler | Run on interval, clean exit, signal handling |
| DOCKER-001 | Dockerfile for Fly.io | Multi-stage build, Bun runtime, minimal image |
| FLY-001 | Fly.io configuration | fly.toml, sfo region, volume mount, health checks |

### CI/CD
| ID | Description | Steps |
|----|-------------|-------|
| CI-001 | GitHub Actions CI workflow | Install deps, typecheck, biome check on PRs |
| CI-002 | GitHub Actions CD workflow | Build image, deploy to Fly.io, notify on result |

### Quality
| ID | Description | Steps |
|----|-------------|-------|
| VERIFY-001 | Build and typecheck verification | bun build && bun typecheck pass |
| VERIFY-002 | Code quality gates | format, lint, biome check all pass |

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Bun (fast, native TypeScript)
- **Framework:** Effect (typed functional programming)
- **Formatter/Linter:** Biome (all-in-one toolchain)
- **Deployment:** Fly.io
- **Scheduling:** cron in container or external cron service
- **CI/CD:** GitHub Actions

## Project Structure

```
├── src/
│   ├── main.ts           # Entry point
│   ├── google/
│   │   ├── client.ts     # Sheets API client
│   │   ├── auth.ts       # Service account auth
│   │   └── types.ts      # Google types
│   ├── groupme/
│   │   ├── client.ts     # GroupMe API client
│   │   ├── auth.ts       # Token auth
│   │   └── types.ts      # GroupMe types
│   ├── state/
│   │   ├── store.ts      # Local state management
│   │   └── types.ts      # State types
│   ├── scheduler/
│   │   └── cron.ts       # Cron job runner
│   ├── error/
│   │   └── notify.ts     # Error notifications
│   ├── core/
│   │   ├── logger.ts     # Structured logging
│   │   └── schema.ts     # Effect schemas
│   └── types/
│       └── user.ts       # User contact types
├── data/
│   └── state.json        # Local state file
├── .github/workflows/
│   ├── ci.yml            # CI pipeline
│   └── cd.yml            # CD pipeline
├── .env.example          # Env var template
├── biome.json            # Biome configuration
├── package.json
├── tsconfig.json
├── Dockerfile
└── fly.toml
```

## Configuration

Required env vars:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Google service account email
- `GOOGLE_PRIVATE_KEY` - Google service account private key
- `GOOGLE_SHEET_ID` - Google Sheets spreadsheet ID
- `GROUPME_ACCESS_TOKEN` - GroupMe API access token
- `GROUPME_GROUP_ID` - Target GroupMe group ID
- `COLUMN_NAME` - Column header for name field
- `COLUMN_EMAIL` - Column header for email field
- `COLUMN_PHONE` - Column header for phone field
- `FLY_REGION` - Fly.io region (default: sfo)

Optional env vars:
- `LOG_LEVEL` - Logging level (debug, info, warn, error)
- `SYNC_INTERVAL` - Cron interval (default: "0 * * * *" hourly)

## References

- Google Sheets API: https://developers.google.com/sheets/api
- GroupMe API: https://dev.groupme.com/docs/v3
- Effect: https://effect.website
- Biome: https://biomejs.dev
- Bun: https://bun.sh
- Fly.io: https://fly.io/docs

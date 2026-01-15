# Sheets to GroupMe

Sync contacts from a Google Sheet to a GroupMe group. Runs on a cron schedule and sends Discord notifications on sync events.

## Features

- Fetches contacts from Google Sheets (supports flexible column mapping)
- Adds new contacts to a GroupMe group
- Detects existing members by name, email, or phone to avoid duplicates
- Change detection to skip syncs when sheet data hasn't changed
- Exclusion list for contacts that should never be synced
- Dry run mode for testing without modifying GroupMe
- Discord webhook notifications for sync results and errors
- Deployed to Fly.io with hourly cron scheduling

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_SHEET_ID` | Yes | Google Sheet ID containing contacts |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Service account email for Sheets API |
| `GOOGLE_PRIVATE_KEY` | Yes | Service account private key |
| `GROUPME_ACCESS_TOKEN` | Yes | GroupMe API access token |
| `GROUPME_GROUP_ID` | Yes | Target GroupMe group ID |
| `DISCORD_WEBHOOK_URL` | No | Discord webhook for notifications |
| `COLUMN_NAME` | No | Column header for full name (default: "Name") |
| `COLUMN_FIRST_NAME` | No | Column header for first name |
| `COLUMN_LAST_NAME` | No | Column header for last name |
| `COLUMN_EMAIL` | No | Column header for email (default: "Email") |
| `COLUMN_PHONE` | No | Column header for phone (default: "Phone") |
| `DRY_RUN` | No | Set to "true" to test without modifying GroupMe |

## Column Mapping

The sync supports two modes for contact names:

1. **Full name column**: Set `COLUMN_NAME` to the header containing full names
2. **First/last name columns**: Set `COLUMN_FIRST_NAME` and `COLUMN_LAST_NAME` to combine them

## Dry Run Mode

Test the sync without making changes to GroupMe:

```bash
DRY_RUN=true bun run src/main.ts
```

In dry run mode:
- Contacts are not added to GroupMe
- Discord notifications are not sent
- The change detection hash is not updated (so subsequent real syncs still run)
- Logs show what would happen: `[DRY RUN] Would add: John Doe (john@example.com, +15551234567)`

## Exclusion List

Skip specific contacts that are already in GroupMe with different identifiers (different nickname, email, or phone than in the sheet).

Create `sync-exclude.json` in the project root:

```json
{
  "names": ["John Doe", "Jane Smith"],
  "emails": ["skip@example.com"],
  "phones": ["+15551234567"]
}
```

- **Names**: Case-insensitive match
- **Emails**: Case-insensitive match
- **Phones**: Normalized to digits only (handles various formats)

See `sync-exclude.example.json` for a template.

## Development

```bash
# Install dependencies
bun install

# Run locally (with Infisical for secrets)
infisical run -- bun run src/main.ts

# Run tests
bun run test

# Type check
bun run typecheck

# Format and lint
bun run check
```

## Deployment

Deployed to Fly.io. The app runs on an hourly cron schedule.

```bash
# Deploy
fly deploy

# View logs
fly logs

# SSH into machine
fly ssh console
```

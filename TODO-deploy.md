# Deployment Next Steps

### 2. Add Environment Variables

In your Infisical project, add these secrets to the **Development** environment:

| Secret Name                          | Description                       | Example                                                         |
| ------------------------------------ | --------------------------------- | --------------------------------------------------------------- |
| `GOOGLE_SHEET_ID`                    | Spreadsheet ID from URL           | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`                  |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`       | Service account email             | `myapp@myproject.iam.gserviceaccount.com`                       |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Private key (with newlines)       | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` |
| `GOOGLE_PROJECT_ID`                  | Google Cloud project ID           | `my-gcp-project-123`                                            |
| `GROUPME_GROUP_ID`                   | GroupMe group ID                  | `12345678`                                                      |
| `GROUPME_ACCESS_TOKEN`               | GroupMe API token                 | `abc123...`                                                     |
| `COLUMN_NAME`                        | Header for name column            | `Name`                                                          |
| `COLUMN_EMAIL`                       | Header for email column           | `Email`                                                         |
| `COLUMN_PHONE`                       | Header for phone column           | `Phone`                                                         |
| `FLY_REGION`                         | Fly.io deployment region          | `sfo`                                                           |
| `DISCORD_WEBHOOK_URL`                | Discord webhook for notifications | `https://discord.com/api/webhooks/...`                          |

**Tip**: For the private key, paste it with literal `\n` characters or use Infisical's multi-line input.

### 5. Create Production Environment

In Infisical dashboard:

1. Go to your project → Environments
2. Create a **Production** environment
3. Copy secrets from Development (or add production-specific values)

## Running Locally with Infisical

```bash
# Run the app with injected secrets
infisical run -- bun run src/main.ts

# Run tests (if they need env vars)
infisical run -- bun run test

# Run with specific environment
infisical run --env=dev -- bun run src/main.ts
infisical run --env=prod -- bun run src/main.ts
```

## Test Spreadsheet Format

| Name     | Email            | Phone       |
| -------- | ---------------- | ----------- |
| John Doe | john@example.com | +1234567890 |
| Jane Doe | jane@example.com | +0987654321 |

Headers must match: `Name`, `Email`, `Phone` (or configure via `COLUMN_NAME`, `COLUMN_EMAIL`, `COLUMN_PHONE` env vars)

## Where to Get Secrets

| Secret                               | Location                                                                |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `GOOGLE_SHEET_ID`                    | Google Sheet URL: `docs.google.com/spreadsheets/d/[ID]/edit`            |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`       | Google Cloud Console → IAM → Service Account → Email                    |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Google Cloud Console → IAM → Service Account → Keys → Create Key → JSON |
| `GOOGLE_PROJECT_ID`                  | Google Cloud Console → Project Settings                                 |
| `GROUPME_GROUP_ID`                   | GroupMe group URL or settings                                           |
| `GROUPME_ACCESS_TOKEN`               | [dev.groupme.com](https://dev.groupme.com)                              |
| `DISCORD_WEBHOOK_URL`                | Discord → Server Settings → Integrations → Webhooks                     |

## Deployment to Fly.io

### Option A: Using Infisical Native Integration

Fly.io has native Infisical integration. See [Fly.io Infisical docs](https://fly.io/docs/reference/infisical/).

```bash
# Link Infisical to Fly app (one-time setup)
fly secrets import --from-infisical

# Deploy
fly deploy
```

### Option B: Manual Secret Sync

```bash
# Export from Infisical and set in Fly
infisical export --env=prod --format=dotenv | xargs fly secrets set

# Or set individually
fly secrets set \
  GOOGLE_SHEET_ID="your_sheet_id" \
  GOOGLE_SERVICE_ACCOUNT_EMAIL="xxx@xxx.iam.gserviceaccount.com" \
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n" \
  GOOGLE_PROJECT_ID="your_project_id" \
  GROUPME_GROUP_ID="your_group_id" \
  GROUPME_ACCESS_TOKEN="your_access_token" \
  DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

### Deploy Steps

```bash
# 1. Create volume for state persistence (first time only)
fly volumes create data --size 1

# 2. Deploy
fly deploy

# 3. Check logs
fly logs

# 4. Check status
fly status
```

## Rollback

```bash
fly releases
fly rollback <release_number>
```

## Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project or select existing
3. Enable Google Sheets API: APIs & Services → Library → "Google Sheets API" → Enable
4. Create Service Account: IAM → Service Accounts → Create → Grant role "Editor"
5. Download JSON key (contains private key)
6. Share your spreadsheet with service account email (from step 4)

## GroupMe Setup

1. Go to [dev.groupme.com](https://dev.groupme.com)
2. Sign in with your GroupMe account
3. Click "Access Token" → Copy (shows once only)
4. Get Group ID:
   - Open GroupMe in browser → Select group
   - URL: `https://groupme.com/groups/[GROUP_ID]/messages`
   - Or: Group → Settings → Group ID at bottom

## Discord Webhook Setup

1. Open Discord → Server Settings → Integrations
2. Click "Webhooks" → "New Webhook"
3. Name it (e.g., "Sync Notifications")
4. Select channel for notifications
5. Copy Webhook URL
6. Add to Infisical as `DISCORD_WEBHOOK_URL`

## Troubleshooting

### Missing Secrets

```bash
# List all secrets (masked)
infisical secrets

# Export to see values (careful!)
infisical export --env=dev
```

### Fly.io Issues

```bash
# Check app status
fly status

# View recent logs
fly logs --tail

# SSH into container
fly ssh console

# Check secrets are set
fly secrets list
```

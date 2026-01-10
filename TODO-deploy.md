# Deployment Next Steps

## Test Spreadsheet Format

| Name | Email | Phone |
|------|-------|-------|
| John Doe | john@example.com | +1234567890 |
| Jane Doe | jane@example.com | +0987654321 |

Headers must match: `Name`, `Email`, `Phone` (or configure via `COLUMN_NAME`, `COLUMN_EMAIL`, `COLUMN_PHONE` env vars)

## Secrets to Set (Fly.io)

```bash
fly secrets set \
  GOOGLE_SHEET_ID="docs.google.com/.../d/[ID]/edit" \
  GOOGLE_SERVICE_ACCOUNT_EMAIL="xxx@xxx.iam.gserviceaccount.com" \
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n" \
  GROUPME_GROUP_ID="https://groupme.com/groups/[ID]/..." \
  GROUPME_ACCESS_TOKEN="dev.groupme.com access token"
```

## Where to Get Secrets

| Secret | Location |
|--------|----------|
| `GOOGLE_SHEET_ID` | Google Sheet URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Cloud Console → IAM → Service Account → Email |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Google Cloud Console → IAM → Service Account → Keys → Create Key → JSON |
| `GROUPME_GROUP_ID` | GroupMe group URL or settings |
| `GOOGLE_ACCESS_TOKEN` | [dev.groupme.com](https://dev.groupme.com) |

## Deployment

```bash
# 1. Set secrets
fly secrets set ...

# 2. Create volume for state persistence (if needed)
fly volumes create data --size 1

# 3. Deploy
fly deploy

# 4. Check logs
fly logs
```

## Rollback

```bash
fly releases
fly rollback <release_number>
```

## Testing Locally

```bash
# Set env vars in .env then run
bun run src/main.ts

# Expected output: "Sync complete: added=X, skipped=Y, errors=Z"
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

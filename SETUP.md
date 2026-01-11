# Sheets to GroupMe Setup Guide

This guide walks you through connecting a Google Sheet to a GroupMe group for automatic member syncing.

## What You'll Need

- Admin access to the Google Sheet
- Admin access to the GroupMe group
- About 10 minutes

---

## Step 1: Set Up the Google Sheet

### Get Your Sheet ID

1. Open your Google Sheet in a browser
2. Look at the URL - it will look like:
   ```
   https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
   ```
3. The Sheet ID is the long string between `/d/` and `/edit`:
   ```
   1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
   ```

### Add the Service Account

The sync service uses a special Google account to read your sheet. You need to give it access:

1. In your Google Sheet, click **Share** (top right)
2. Add this email address:
   ```
   sheets-to-groupme@sheets-to-groupme.iam.gserviceaccount.com
   ```
3. Set permission to **Viewer** (it only needs to read, not edit)
4. Uncheck "Notify people" and click **Share**

### Format Your Sheet

Your sheet needs these columns (the header names matter):

| Name | Email | Phone |
|------|-------|-------|
| John Doe | john@example.com | +1234567890 |
| Jane Smith | jane@example.com | +0987654321 |

**Notes:**
- **Name** is required for each row
- **Email** or **Phone** - at least one is needed for GroupMe to send an invite
- Phone numbers should include country code (e.g., +1 for US)
- Empty rows are skipped automatically

---

## Step 2: Set Up GroupMe

### Get Your Group ID

1. Open GroupMe in a web browser (not the app)
2. Go to your group
3. Look at the URL:
   ```
   https://web.groupme.com/groups/12345678
   ```
4. The Group ID is the number at the end: `12345678`

**Alternative:** If you have a join link like `https://groupme.com/join_group/12345678/AbCdEf`, the Group ID is the first number after `join_group/`.

### Get Your Access Token

1. Go to [dev.groupme.com](https://dev.groupme.com)
2. Sign in with your GroupMe account
3. Click **Access Token** in the top menu
4. Copy the token shown

**Important:** This token has full access to your GroupMe account. Keep it private and don't share it.

---

## Step 3: Send Configuration

Once you have collected the information above, send the following to the person managing the sync:

```
Google Sheet ID: [paste here]
GroupMe Group ID: [paste here]
GroupMe Access Token: [paste here]
```

If your sheet uses different column names than "Name", "Email", "Phone", also include:
```
Name column header: [e.g., "Full Name"]
Email column header: [e.g., "Email Address"]
Phone column header: [e.g., "Mobile"]
```

---

## How the Sync Works

- The service checks your Google Sheet once per hour
- New contacts are automatically invited to the GroupMe group
- Already-synced contacts are skipped (no duplicate invites)
- You'll receive Discord notifications for sync results

---

## Troubleshooting

### Members not being added?

- Check that the service account email has access to your sheet
- Verify phone numbers include the country code
- Ensure at least one of email or phone is filled in for each row

### Wrong people being synced?

- The sync reads ALL rows after the header row
- Remove any test data or rows you don't want synced
- Empty rows are ignored, but rows with just a name will fail

---

## Questions?

Contact the person who sent you this guide.

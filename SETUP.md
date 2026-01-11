# Sheets to GroupMe Setup Guide

## Your Tasks

These sections need to be completed by you (Jack). Once done, send the configuration info to the person managing the sync.

### Get Sheet ID

1. Open your Google Sheet in a browser
2. Look at the URL - it will look like:
   ```
   https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
   ```
3. The Sheet ID is the long string between `/d/` and `/edit`:
   ```
   1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
   ```

### Format Your Sheet

> Waiting for the doc to be shared. Once shared, update the env variables with the column names.

| Name       | Email            | Phone       |
| ---------- | ---------------- | ----------- |
| John Doe   | john@example.com | +1234567890 |
| Jane Smith | jane@example.com | +0987654321 |

### Get Your Group ID

1. In GroupMe, open your group and tap **Share** → **Share Group Link**
2. The link will look like: `https://groupme.com/join_group/12345678/AbCdEf`
3. The Group ID is the first number after `join_group/`: `12345678`

---

## Setup (For Harry)

### Add the Service Account

The sync service uses a special Google account to read your sheet. You need to give it access:

1. In your Google Sheet, click **Share** (top right)
2. Add this email address:
   ```
   sheets-to-groupme@sheets-to-groupme.iam.gserviceaccount.com
   ```
3. Set permission to **Viewer** (it only needs to read, not edit)
4. Uncheck "Notify people" and click **Share**

---

## Step 2: Access Token (Choose One Option)

To add members via the API, we need an access token from a group admin.

### Option A: Make Jack an Admin
1. In GroupMe, go to the group settings
2. Add Jack as a member (if not already)
3. Promote Jack to **Admin**
4. Jack will generate his own access token

### Option B: Share Your Access Token
1. Go to [dev.groupme.com](https://dev.groupme.com)
2. Sign in with your GroupMe account
3. Click **Access Token** in the top menu
4. Copy the token and share with Jack

**Note:** The access token has full access to your GroupMe account. Only share with people you trust.

---

## Step 3: Send to Jack

Once complete, send Jack:

- **Group ID** (from the share link)
- **Access Token** (if using Option B)

---

## How the Sync Works

- The service checks your Google Sheet once per hour
- New contacts are automatically invited to the GroupMe group
- Already-synced contacts are skipped (no duplicate invites)
- You'll receive Discord notifications for sync results

---

## Questions?

Contact the person who sent you this guide.

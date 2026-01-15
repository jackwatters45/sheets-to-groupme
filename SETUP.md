# Sheets to GroupMe Setup Guide

## Setup

## Step 1: GroupMe Access Token (Choose One Option)

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

## Step 2: Send to Jack

Once complete, send Jack:

- **Access Token** (if using Option B)

---

## How the Sync Works

- The service checks your Google Sheet once per hour
- New contacts are automatically invited to the GroupMe group
- Already-synced contacts are skipped (no duplicate invites)

---

## Questions?

Contact the person who sent you this guide.

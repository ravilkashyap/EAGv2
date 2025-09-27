# Gmail MCP Server Setup Guide

## 1. Set up Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Desktop app" as application type
   - Download the credentials JSON file

## 2. Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" user type
3. Fill in required fields (app name, user support email, etc.)
4. Add your email to test users
5. Save and continue

## 3. Place Credentials File

1. Save the downloaded credentials JSON file as:
   ```
   /Users/ravil/Documents/TSAI/gmail_credentials.json
   ```

## 4. First Run

The first time you run the Gmail server, it will:
1. Open a browser for OAuth authorization
2. Ask you to grant permissions
3. Save the token to `/Users/ravil/Documents/TSAI/gmail_token.json`

## 5. Test the Setup

Run this command to test:
```bash
cd /Users/ravil/Documents/TSAI/Session4/class_code
python test_gmail_server.py
```

## 6. Use in talk2mcp.py

The Gmail server is already integrated. It provides these tools:
- `send-email`: Send emails
- `get-unread-emails`: Get unread emails
- `read-email`: Read specific emails
- `trash-email`: Move emails to trash
- `mark-email-as-read`: Mark emails as read
- `open-email`: Open emails in browser

## Example Usage

The LLM can now call:
```bash
FUNCTION_CALL: send-email|recipient@example.com|Math Problem Result|The answer is 42
```

## Security Notes

- Store credentials securely (outside of version control)
- Use minimal required scopes
- Review the Gmail server's code before using
- Be careful with prompt injection when reading emails

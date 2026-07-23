const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.NODE_ENV === 'production'
    ? 'https://clearcents-backend.onrender.com/auth/gmail/callback'
    : 'http://localhost:5000/auth/gmail/callback'
);

module.exports = oauth2Client;
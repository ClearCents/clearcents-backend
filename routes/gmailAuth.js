const express = require('express');
const router = express.Router();
const oauth2Client = require('../config/googleClient');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Step A: Redirect user to Google's consent screen
// Expects ?token=<supabase_jwt> so we know which ClearCents user is connecting
router.get('/connect', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(401).send('Missing auth token');
  }

  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) {
    return res.status(401).send('Invalid or expired token');
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent',
    state: userData.user.id // carries the ClearCents user ID through to /callback
  });

  res.redirect(url);
});

// Step B: Handle Google's redirect back with the auth code
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;

  if (!userId) {
    return res.status(400).send('Missing user reference, cannot save tokens');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    const { error } = await supabaseAdmin
      .from('gmail_tokens')
      .upsert(
        {
          user_id: userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('Failed to save Gmail tokens:', error);
      return res.status(500).send('Gmail connected but failed to save tokens');
    }

    const frontendUrl = process.env.NODE_ENV === 'production'
        ? 'https://clearcents-frontend.vercel.app'
        : 'http://localhost:3000';

    res.redirect(`${frontendUrl}/account?gmail=connected`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Gmail connection failed');
  }
});

// Check if the current user has Gmail connected
router.get('/status', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { data, error } = await supabaseAdmin
    .from('gmail_tokens')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ connected: !!data });
});

// Disconnect Gmail — removes the stored tokens for this user
router.delete('/disconnect', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { error } = await supabaseAdmin
    .from('gmail_tokens')
    .delete()
    .eq('user_id', userData.user.id);

  if (error) {
    console.error('Failed to disconnect Gmail:', error);
    return res.status(500).json({ error: 'Failed to disconnect Gmail' });
  }

  res.json({ disconnected: true });
});

module.exports = router;
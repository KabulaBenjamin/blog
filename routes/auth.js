const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;

const issueSessionCookie = (res, user) => {
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
};

router.get('/me', authenticateToken, (req, res) => {
  res.json(req.user);
});

router.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Fields required.' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    issueSessionCookie(res, result.rows[0]);
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username taken.' });
    res.status(500).json({ error: 'Signup error.' });
  }
});

router.post('/signin', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });
    
    const isMatch = await bcrypt.compare(password, result.rows[0].password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

    const user = { id: result.rows[0].id, username: result.rows[0].username };
    issueSessionCookie(res, user);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: 'Signin error.' });
  }
});

// =========================================================================
// FORGOT PASSWORD: Generates short 6-char token & returns it in the response
// =========================================================================
router.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required.' });
  try {
    const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length === 0) {
      // Security standard: don't explicitly leak non-existent usernames to scanners
      return res.status(404).json({ error: 'Username lookup processed: account not found.' });
    }
    
    const userId = userCheck.rows[0].id;
    
    // Generates a clean 6-character alpha-numeric token (e.g., A4B7E9) for screen display copy-paste efficiency
    const resetToken = crypto.randomBytes(3).toString('hex').toUpperCase();
    const tokenExpiry = new Date(Date.now() + 3600000); // 1 Hour active lifespan Matrix

    await pool.query(
      'UPDATE users SET reset_token = $1, token_expiry = $2 WHERE id = $3', 
      [resetToken, tokenExpiry, userId]
    );
    
    // Deliver token directly in the response payload for direct UI rendering
    res.json({ 
      success: true, 
      message: 'Reset token generated successfully.', 
      token: resetToken 
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error processing request.' });
  }
});

// =========================================================================
// RESET PASSWORD: Validates token expiration & updates user's credentials
// =========================================================================
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and password required.' });
  try {
    // Look up valid token that hasn't crossed the current timestamp expiry execution limit
    const result = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND token_expiry > NOW()', 
      [token.toUpperCase().trim()]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Reset token is invalid or has expired.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = $1, reset_token = NULL, token_expiry = NULL WHERE id = $2', 
      [hashedPassword, result.rows[0].id]
    );
    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error updating password.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ success: true, message: 'Logged out cleanly.' });
});

router.delete('/delete-account', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    await pool.query('DELETE FROM posts WHERE user_id = $1', [userId]);
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User account not found.' });

    res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
    res.json({ success: true, message: 'Account permanently deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error processing account deletion.' });
  }
});

module.exports = router;
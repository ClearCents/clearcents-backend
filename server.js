const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const cors = require('cors')

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const app = express()
app.use(express.json())
app.use(cors({
  origin: ['https://clearcents-frontend-ob9o-chi.vercel.app', 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}))

// Connect to Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
)

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getSupabaseForUser(token) {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY,
        {
            global: {
                headers: { Authorization: `Bearer ${token}` }
            }
        }
    )
}

// Test route
app.get('/', (req, res) => {
    res.send('ClearCents Backend is running!')
})

// SIGNUP (with email verification flow)
app.post('/auth/signup', async (req, res) => {
    const { email, password } = req.body
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return res.status(400).json({ error: error.message })

    res.json({
        message: 'Verification code sent to your email',
        needsVerification: true
    })
})

// VERIFY SIGNUP CODE
app.post('/auth/verify-signup', async (req, res) => {
    const { email, token } = req.body

    if (!email || !token) {
        return res.status(400).json({ error: 'Email and code are required' })
    }

    const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup'
    })

    if (error) {
        return res.status(400).json({ error: error.message })
    }

    res.json({
        message: 'Email verified successfully',
        token: data.session?.access_token
    })
})

// RESEND VERIFICATION CODE
app.post('/auth/resend-code', async (req, res) => {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email is required' })

    const { error } = await supabase.auth.resend({
        type: 'signup',
        email
    })

    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: 'Verification code resent' })
})

// LOGIN
app.post('/auth/signin', async (req, res) => {
    const { email, password } = req.body
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: 'Login successful', token: data.session.access_token })
})

// Get all subscriptions
app.get('/subscriptions', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError) return res.status(401).json({ error: 'Invalid token' })
    const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userData.user.id)
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
})

// Add a subscription
app.post('/subscriptions', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })

    const userClient = getSupabaseForUser(token)
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError) return res.status(401).json({ error: 'Invalid token' })

    const { name, price, usage_hours, is_active, billing_cycle, start_date, currency } = req.body

    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'INR']
    const finalCurrency = validCurrencies.includes(currency) ? currency : 'USD'

    const { data, error } = await userClient
        .from('subscriptions')
        .insert([{ name, price, usage_hours, is_active, billing_cycle, start_date, currency: finalCurrency, user_id: userData.user.id }])
        .select()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
})

// Delete a subscription
app.delete('/subscriptions/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError) return res.status(401).json({ error: 'Invalid token' })
    const { id } = req.params
    const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', id)
        .eq('user_id', userData.user.id)
    if (error) return res.status(500).json({ error: error.message })
    res.json({ message: 'Deleted successfully' })
})

// Get your email
app.get('/auth/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const { data, error } = await supabase.auth.getUser(token);

        if (error) {
            return res.status(401).json({ error: error.message });
        }

        res.json({
            id: data.user.id,
            email: data.user.email,
            created_at: data.user.created_at
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// CHANGE PASSWORD
app.post('/auth/change-password', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })

    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password are required' })
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters long' })
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) {
        return res.status(401).json({ error: 'Invalid token' })
    }

    // Verify current password using a fresh, isolated client
    const verifyClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
    )

    const { error: signInError } = await verifyClient.auth.signInWithPassword({
        email: userData.user.email,
        password: currentPassword
    })

    if (signInError) {
        return res.status(401).json({ error: 'Current password is incorrect' })
    }

    // Update password using the admin client (no session needed)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userData.user.id,
        { password: newPassword }
    )

    if (updateError) {
        return res.status(500).json({ error: updateError.message })
    }

    res.json({ message: 'Password updated successfully' })
})

// DELETE ACCOUNT
app.delete('/auth/delete-account', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const { data: userData, error: userError } = await supabase.auth.getUser(token);

        if (userError || !userData.user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(userData.user.id);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ message: 'Account deleted successfully' });

    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
    console.log(`ClearCents server running on port ${PORT}`)
})
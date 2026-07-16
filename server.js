const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const cors = require('cors')
require('dotenv').config()

const app = express()
app.use(express.json())
app.use(cors())

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

// SIGNUP
app.post('/auth/signup', async (req, res) => {
    const { email, password } = req.body
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return res.status(400).json({ error: error.message })
    res.json({
    message: 'Signup successful',
    token: data.session?.access_token
});
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

//Get your email
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

// GET current user's preferred currency
app.get('/profile/currency', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })

    const userClient = getSupabaseForUser(token)
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError) return res.status(401).json({ error: 'Invalid token' })

    const { data, error } = await userClient
        .from('profiles')
        .select('preferred_currency')
        .eq('user_id', userData.user.id)
        .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })

    res.json({ preferred_currency: data?.preferred_currency || 'USD' })
})
// UPDATE (or create) current user's preferred currency
app.patch('/profile/currency', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })

    const userClient = getSupabaseForUser(token)
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError) return res.status(401).json({ error: 'Invalid token' })

    const { currency } = req.body
    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'INR']
    if (!validCurrencies.includes(currency)) {
        return res.status(400).json({ error: 'Invalid currency' })
    }

    const { data, error } = await userClient
        .from('profiles')
        .upsert(
            { user_id: userData.user.id, preferred_currency: currency },
            { onConflict: 'user_id' }
        )
        .select()

    if (error) return res.status(500).json({ error: error.message })

    res.json({ preferred_currency: data[0].preferred_currency })
})

app.post('/subscriptions', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })

    const userClient = getSupabaseForUser(token)
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError) return res.status(401).json({ error: 'Invalid token' })

    const { data: profileData, error: profileError } = await userClient
        .from('profiles')
        .select('preferred_currency')
        .eq('user_id', userData.user.id)
        .maybeSingle()

    if (profileError) return res.status(500).json({ error: profileError.message })

    const currency = profileData?.preferred_currency || 'USD'

    const { name, price, usage_hours, is_active } = req.body
    const { data, error } = await userClient
        .from('subscriptions')
        .insert([{ name, price, usage_hours, is_active, user_id: userData.user.id, currency }])
        .select()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
})

app.delete('/auth/delete-account', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // Verify the user
        const { data: userData, error: userError } = await supabase.auth.getUser(token);

        if (userError || !userData.user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Delete the user from Supabase Auth
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userData.user.id);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ message: 'Account deleted successfully' });

    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

const PORT = 5000
app.listen(PORT, () => {
    console.log(`ClearCents server running on port ${PORT}`)
})
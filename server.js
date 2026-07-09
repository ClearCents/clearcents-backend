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

// Add a subscription
app.post('/subscriptions', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError) return res.status(401).json({ error: 'Invalid token' })
    const { name, price, usage_hours, is_active } = req.body
    const { data, error } = await supabase
        .from('subscriptions')
        .insert([{ name, price, usage_hours, is_active, user_id: userData.user.id}])
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

const PORT = 5000
app.listen(PORT, () => {
    console.log(`ClearCents server running on port ${PORT}`)
})
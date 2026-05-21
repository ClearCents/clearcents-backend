const express = require('express')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const app = express()
app.use(express.json())

// Connect to Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
)

// Test route
app.get('/', (req, res) => {
    res.send('ClearCents Backend is running!')
})

// Get all subscriptions
app.get('/subscriptions', async (req, res) => {
    const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
})

// Add a subscription
app.post('/subscriptions', async (req, res) => {
    const { name, price, usage_hours, is_active } = req.body
    const { data, error } = await supabase
        .from('subscriptions')
        .insert([{ name, price, usage_hours, is_active }])
        .select()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
})

// Delete a subscription
app.delete('/subscriptions/:id', async (req, res) => {
    const { id } = req.params
    const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    res.json({ message: 'Deleted successfully' })
})

const PORT = 3000
app.listen(PORT, () => {
    console.log(`ClearCents server running on port ${PORT}`)
})
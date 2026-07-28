const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const cors = require('cors')

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const gmailAuthRoutes = require('./routes/gmailAuth');

const app = express()
app.use(express.json())
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || origin.includes('vercel.app') || origin.includes('localhost')) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))

app.use('/auth/gmail', gmailAuthRoutes)

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

const PDFDocument = require("pdfkit");

app.get("/subscriptions/download", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "No token provided" });
    }

    const { data: userData, error: userError } =
        await supabase.auth.getUser(token);

    if (userError) {
        return res.status(401).json({ error: "Invalid token" });
    }

    const { data: subscriptions, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userData.user.id);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        "attachment; filename=subscriptions.pdf"
    );

    doc.pipe(res);

    doc.fontSize(24).text("ClearCents Subscription Report");
    doc.moveDown();

    doc.fontSize(12).text(`Email: ${userData.user.email}`);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`);

    doc.moveDown();

    subscriptions.forEach((sub, index) => {
        doc
            .fontSize(16)
            .text(`${index + 1}. ${sub.name}`);

        doc.fontSize(12);
        doc.text(`Price: ${sub.price} ${sub.currency}`);
        doc.text(`Billing: ${sub.billing_cycle}`);
        doc.text(`Status: ${sub.is_active ? "Active" : "Inactive"}`);
        doc.text(`Category: ${sub.category || "-"}`);
        doc.text(`Start Date: ${sub.start_date}`);
        doc.text(`Description: ${sub.description || "-"}`);

        doc.moveDown();
    });

    doc.end();
});

// Add a subscription
app.post('/subscriptions', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })

    const userClient = getSupabaseForUser(token)
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError) return res.status(401).json({ error: 'Invalid token' })

    const { name, price, usage_hours, is_active, billing_cycle, start_date, currency, url, category, description } = req.body
    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'INR']

    let finalCurrency = currency
    // If frontend didn't send a valid currency, fall back to the user's saved profile preference
    if (!validCurrencies.includes(finalCurrency)) {
        const { data: profileData } = await userClient
            .from('profiles')
            .select('preferred_currency')
            .eq('user_id', userData.user.id)
            .maybeSingle()
        finalCurrency = profileData?.preferred_currency || 'USD'
    }

    const { data, error } = await userClient
        .from('subscriptions')
        .insert([{
            name,
            price,
            usage_hours,
            is_active,
            billing_cycle,
            start_date,
            currency: finalCurrency,
            url: url || null,
            category: category || null,
            description: description || null,
            user_id: userData.user.id
        }])
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

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userData.user.id,
        { password: newPassword }
    )

    if (updateError) {
        return res.status(500).json({ error: updateError.message })
    }

    res.json({ message: 'Password updated successfully' })
})

// Get a single subscription
app.get('/subscriptions/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError) return res.status(401).json({ error: 'Invalid token' })

    const { id } = req.params
    const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Subscription not found' })

    res.json(data)
})

// Update a subscription
app.put('/subscriptions/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })

    const userClient = getSupabaseForUser(token)
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError) return res.status(401).json({ error: 'Invalid token' })

    const { id } = req.params
    const { name, price, billing_cycle, start_date, currency, url, category, description, is_active } = req.body

    const { data, error } = await userClient
        .from('subscriptions')
        .update({
            name,
            price,
            billing_cycle,
            start_date,
            currency,
            url: url || null,
            category: category || null,
            description: description || null,
            is_active
        })
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .select()

    if (error) return res.status(500).json({ error: error.message })
    if (!data || data.length === 0) return res.status(404).json({ error: 'Subscription not found' })

    res.json(data[0])
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
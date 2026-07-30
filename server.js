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

    const { data: userData, error: userError } = await supabase.auth.getUser(token);

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

    const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        bufferPages: true
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        "attachment; filename=ClearCents-Subscriptions.pdf"
    );

    doc.pipe(res);

    // ==================== BRAND PALETTE ====================
    const purple = "#7C3AED";
    const purpleDark = "#4C1D95";
    const purpleTint = "#F3EEFF";
    const dark = "#111827";
    const gray = "#6B7280";
    const grayLight = "#9CA3AF";
    const light = "#E5E7EB";
    const cardBg = "#FAFAFA";
    const green = "#16A34A";
    const greenTint = "#DCFCE7";
    const red = "#DC2626";
    const redTint = "#FEE2E2";

    const currencySymbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' };

    // ==================== CALCULATIONS ====================
    const activeCount = subscriptions.filter(s => s.is_active).length;
    const inactiveCount = subscriptions.length - activeCount;

    let monthlyTotal = 0;
    subscriptions.forEach(sub => {
        if (!sub.is_active) return;
        const cycle = sub.billing_cycle?.toLowerCase();
        const price = Number(sub.price) || 0;
        if (cycle === "monthly") monthlyTotal += price;
        else if (cycle === "yearly") monthlyTotal += price / 12;
        else if (cycle === "weekly") monthlyTotal += price * 4.33;
        else if (cycle === "biweekly") monthlyTotal += price * 2.17;
        else if (cycle === "quarterly") monthlyTotal += price / 3;
        else if (cycle === "semiannual") monthlyTotal += price / 6;
    });

    const yearlyTotal = monthlyTotal * 12;

    const categoryTotals = {};
    subscriptions.forEach(sub => {
        if (!sub.is_active) return;
        const cat = sub.category || "Uncategorized";
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(sub.price || 0);
    });

    // ==================== COVER HEADER BAND ====================
    doc.rect(0, 0, 595, 130).fill(purple);

    doc.fontSize(30)
        .fillColor("#FFFFFF")
        .text("ClearCents", 50, 42);

    doc.fontSize(11)
        .fillColor(purpleTint)
        .text("Know what you pay. Own what you use.", 50, 78);

    doc.fontSize(10)
        .fillColor(purpleTint)
        .text(`Report generated ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}`, 50, 100);

    doc.y = 155;

    // ==================== USER INFO ====================
    doc.fontSize(10).fillColor(gray).text(`Prepared for: ${userData.user.email}`, 50);
    doc.moveDown(1);

    // ==================== SUMMARY CARDS ====================
    const cardY = doc.y;
    const cardWidth = 152;
    const cardGap = 12;
    const cardHeight = 70;

    const summaryCards = [
        { label: "Total Subscriptions", value: `${subscriptions.length}`, accent: purple },
        { label: "Active", value: `${activeCount}`, accent: green },
        { label: "Monthly Spend", value: `~$${monthlyTotal.toFixed(2)}`, accent: purple }
    ];

    summaryCards.forEach((card, i) => {
        const x = 50 + i * (cardWidth + cardGap);
        doc.roundedRect(x, cardY, cardWidth, cardHeight, 8).fill(cardBg);
        doc.rect(x, cardY, 4, cardHeight).fill(card.accent);
        doc.fontSize(9).fillColor(gray).text(card.label.toUpperCase(), x + 16, cardY + 14, { width: cardWidth - 24 });
        doc.fontSize(20).fillColor(dark).text(card.value, x + 16, cardY + 34);
    });

    doc.y = cardY + cardHeight + 25;

    doc.fontSize(10).fillColor(gray)
        .text(`Estimated yearly spend: $${yearlyTotal.toFixed(2)}   |   Inactive subscriptions: ${inactiveCount}`, 50);
    doc.moveDown(1.2);

    // ==================== CATEGORY BREAKDOWN ====================
    const categoryEntries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

    if (categoryEntries.length > 0) {
        doc.fontSize(14).fillColor(purpleDark).text("Spending by category", 50);
        doc.moveDown(0.5);

        const maxVal = Math.max(...categoryEntries.map(e => e[1]));
        const barMaxWidth = 300;

        categoryEntries.slice(0, 6).forEach(([cat, total]) => {
            const rowY = doc.y;
            const barWidth = maxVal > 0 ? Math.max((total / maxVal) * barMaxWidth, 4) : 4;

            doc.fontSize(9).fillColor(dark).text(cat, 50, rowY, { width: 140 });
            doc.roundedRect(195, rowY - 2, barMaxWidth, 10, 4).fill(light);
            doc.roundedRect(195, rowY - 2, barWidth, 10, 4).fill(purple);
            doc.fontSize(9).fillColor(gray).text(`$${total.toFixed(2)}`, 505, rowY, { width: 45, align: "right" });

            doc.y = rowY + 20;
        });

        doc.moveDown(0.8);
    }

    doc.strokeColor(light).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // ==================== SUBSCRIPTIONS LIST ====================
    doc.fontSize(16).fillColor(purpleDark).text("All subscriptions");
    doc.moveDown(0.7);

    subscriptions.forEach((sub, index) => {
        if (doc.y + 110 > 780) {
            doc.addPage();
            doc.y = 50;
        }

        const startY = doc.y;
        const symbol = currencySymbols[sub.currency] || sub.currency || '';

        doc.roundedRect(50, startY, 495, 100, 8).fillAndStroke(cardBg, light);
        doc.rect(50, startY, 4, 100).fill(sub.is_active ? green : grayLight);

        doc.fontSize(13).fillColor(dark).text(sub.name || "Untitled", 68, startY + 14, { width: 340 });

        const statusBg = sub.is_active ? greenTint : "#F3F4F6";
        const statusText = sub.is_active ? green : gray;
        const statusLabel = sub.is_active ? "Active" : "Inactive";
        doc.roundedRect(465, startY + 14, 65, 16, 8).fill(statusBg);
        doc.fontSize(8).fillColor(statusText).text(statusLabel, 465, startY + 18, { width: 65, align: "center" });

        doc.fontSize(10).fillColor(gray);
        doc.text(`Price`, 68, startY + 40, { continued: false });
        doc.fontSize(12).fillColor(purple).text(`${symbol}${sub.price}`, 68, startY + 52);

        doc.fontSize(10).fillColor(gray).text(`Billing cycle`, 190, startY + 40);
        doc.fontSize(11).fillColor(dark).text(sub.billing_cycle || "-", 190, startY + 52);

        doc.fontSize(10).fillColor(gray).text(`Category`, 310, startY + 40);
        doc.fontSize(11).fillColor(dark).text(sub.category || "-", 310, startY + 52);

        doc.fontSize(10).fillColor(gray).text(`Started`, 430, startY + 40, { width: 100 });
        doc.fontSize(11).fillColor(dark).text(sub.start_date || "-", 430, startY + 52, { width: 100 });

        if (sub.description) {
            doc.fontSize(9).fillColor(grayLight)
                .text(sub.description, 68, startY + 76, { width: 460, height: 16, ellipsis: true });
        }

        doc.y = startY + 100;
        doc.moveDown(0.6);
    });

    // ==================== FOOTER (added to every buffered page, THEN finalize) ====================
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.strokeColor(light).lineWidth(0.5).moveTo(50, 800).lineTo(545, 800).stroke();
        doc.fontSize(8).fillColor(grayLight).text("ClearCents", 50, 810, { width: 200 });
        doc.fontSize(8).fillColor(grayLight).text(`Page ${i + 1} of ${pages.count}`, 345, 810, { width: 200, align: "right" });
    }

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
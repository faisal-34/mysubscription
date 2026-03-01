// ─────────────────────────────────────────────────────────
//  Xentaa — Stripe Subscription Endpoint
//  Vercel Serverless Function  /api/create-subscription
// ─────────────────────────────────────────────────────────
//
//  ENV VARS to set in Vercel Dashboard → Settings → Environment Variables:
//
//   STRIPE_SECRET_KEY   →  sk_live_xxxx   (from dashboard.stripe.com/apikeys)
//   NEXT_PUBLIC_URL     →  https://xentaa.com  (your Vercel domain)
//
// ─────────────────────────────────────────────────────────

const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  // CORS headers — allow your own domain + localhost for testing
  const allowed = [
    'https://xentaa.com',
    'https://www.xentaa.com',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ];
  const origin = req.headers.origin;
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const { name, email, priceId } = req.body;

    // ── Validate inputs ───────────────────────────────────
    if (!name || !email || !priceId) {
      return res.status(400).json({ error: 'Missing required fields: name, email, priceId' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // ── Find or create Stripe Customer ────────────────────
    const existing = await stripe.customers.list({ email, limit: 1 });
    let customer;

    if (existing.data.length > 0) {
      customer = existing.data[0];
      // Update name if it changed
      if (customer.name !== name) {
        customer = await stripe.customers.update(customer.id, { name });
      }
    } else {
      customer = await stripe.customers.create({
        name,
        email,
        metadata: { source: 'xentaa-website' },
      });
    }

    // ── Check for existing active subscription ────────────
    const activeSubs = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 5,
    });

    const alreadySubscribed = activeSubs.data.some(sub =>
      sub.items.data.some(item => item.price.id === priceId)
    );

    if (alreadySubscribed) {
      return res.status(409).json({
        error: 'already_subscribed',
        message: 'This email is already subscribed to this plan.',
      });
    }

    // ── Create Subscription ───────────────────────────────
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        customer_name: name,
        source: 'xentaa-website',
      },
    });

    const invoice = subscription.latest_invoice;
    const paymentIntent = invoice?.payment_intent;

    if (!paymentIntent?.client_secret) {
      // Subscription might be trialing or free — handle gracefully
      return res.status(200).json({
        subscriptionId: subscription.id,
        status: subscription.status,
        clientSecret: null,
      });
    }

    return res.status(200).json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
      customerId: customer.id,
    });

  } catch (err) {
    console.error('Stripe error:', err.message);

    // Return Stripe errors clearly to the frontend
    if (err.type?.startsWith('Stripe')) {
      return res.status(402).json({ error: err.message });
    }

    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
};

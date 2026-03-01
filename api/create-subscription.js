const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {

  // ── CORS ────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe secret key not configured.' });
  }

  try {
    const { name, email, priceId } = req.body;

    if (!name || !email || !priceId) {
      return res.status(400).json({ error: 'Missing name, email, or priceId.' });
    }

    // Find or create customer
    const existing = await stripe.customers.list({ email: email, limit: 1 });
    let customer = existing.data.length > 0
      ? existing.data[0]
      : await stripe.customers.create({ name: name, email: email });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      expand: ['latest_invoice.payment_intent'],
    });

    const clientSecret = subscription.latest_invoice.payment_intent.client_secret;

    return res.status(200).json({
      subscriptionId: subscription.id,
      clientSecret: clientSecret,
    });

  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(400).json({ error: err.message });
  }
};

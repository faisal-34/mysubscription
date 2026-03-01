// ─────────────────────────────────────────────────────────
//  Xentaa — Stripe Webhook Handler
//  Vercel Serverless Function  /api/webhook
// ─────────────────────────────────────────────────────────
//
//  ENV VARS needed:
//   STRIPE_SECRET_KEY        →  sk_live_xxxx
//   STRIPE_WEBHOOK_SECRET    →  whsec_xxxx  (from Stripe Dashboard → Webhooks)
//
//  Setup in Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   URL:    https://your-domain.vercel.app/api/webhook
//   Events: customer.subscription.created
//           customer.subscription.deleted
//           invoice.payment_succeeded
//           invoice.payment_failed
//
// ─────────────────────────────────────────────────────────

const Stripe = require('stripe');

// Vercel requires raw body for webhook signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // ── Handle events ─────────────────────────────────────
  switch (event.type) {

    case 'customer.subscription.created': {
      const sub = event.data.object;
      console.log(`✅ New subscription: ${sub.id} — customer: ${sub.customer}`);
      // TODO: Send welcome email via SendGrid / Resend / Nodemailer
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      console.log(`💰 Payment received: ${invoice.id} — $${invoice.amount_paid / 100}`);
      // TODO: Log to your CRM or send receipt
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.warn(`⚠️ Payment failed: ${invoice.id} — customer: ${invoice.customer}`);
      // TODO: Notify client to update payment method
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log(`❌ Subscription cancelled: ${sub.id}`);
      // TODO: Revoke access, send offboarding email
      break;
    }

    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  return res.status(200).json({ received: true });
};

const Stripe = require('stripe');

const config = { api: { bodyParser: false } };

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
    return res.status(400).json({ error: err.message });
  }

  switch (event.type) {
    case 'customer.subscription.created': {
      const sub = event.data.object;
      console.log('New subscription:', sub.id);
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      console.log('Payment received: $' + invoice.amount_paid / 100);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.warn('Payment failed:', invoice.customer);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log('Subscription cancelled:', sub.id);
      break;
    }
    default:
      console.log('Unhandled event:', event.type);
  }

  return res.status(200).json({ received: true });
};

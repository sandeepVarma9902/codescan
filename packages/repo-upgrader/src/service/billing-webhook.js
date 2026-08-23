import { createHmac, timingSafeEqual } from 'node:crypto';
import { PLANS } from './auth.js';

const ACTIVE = new Set(['active', 'trialing', 'past_due']);

export function verifyBillingSignature(raw, header, secret, options = {}) {
  if (!secret || !header) return false;
  const fields = Object.fromEntries(header.split(',').map((part) => part.split('=', 2)));
  const timestamp = Number(fields.t);
  if (!timestamp || !fields.v1) return false;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > (options.toleranceSeconds ?? 300)) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  const actual = Buffer.from(fields.v1, 'hex');
  const wanted = Buffer.from(expected, 'hex');
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export function billingUpdateFromEvent(event) {
  if (!event?.id || !event?.type || !event.data?.object) return null;
  if (!['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) return null;
  const subscription = event.data.object;
  const accountId = subscription.metadata?.accountId;
  if (!accountId) throw new Error('Billing subscription metadata.accountId is required.');
  const requestedPlan = subscription.metadata?.plan || subscription.items?.data?.[0]?.price?.lookup_key;
  const active = event.type !== 'customer.subscription.deleted' && ACTIVE.has(subscription.status);
  const plan = active ? requestedPlan : 'free';
  if (!PLANS[plan]) throw new Error(`Unknown billing plan: ${plan}`);
  return {
    eventId: event.id,
    accountId,
    plan,
    customerId: subscription.customer,
    subscriptionId: subscription.id,
    status: subscription.status
  };
}

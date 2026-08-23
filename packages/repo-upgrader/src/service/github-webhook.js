import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyGitHubSignature(body, signature, secret) {
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function jobFromGitHubDispatch(event, payload) {
  if (event !== 'repository_dispatch' || payload.action !== 'modernize') return null;
  const target = payload.client_payload?.target || 'vite';
  if (!['vite', 'nextjs'].includes(target)) throw new Error(`Unsupported target: ${target}`);
  return { source: 'github', repository: { fullName: payload.repository?.full_name, ref: payload.client_payload?.ref || payload.repository?.default_branch || 'main' }, target, deliveryId: payload.delivery_id };
}

import { createSign } from 'node:crypto';

export class GitHubAppClient {
  constructor({ appId, privateKey, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
    if (!appId || !privateKey) throw new Error('GitHub App ID and private key are required.');
    this.appId = String(appId);
    this.privateKey = privateKey.replaceAll('\\n', '\n');
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  createJwt(now = Math.floor(Date.now() / 1000)) {
    const header = encode({ alg: 'RS256', typ: 'JWT' });
    const payload = encode({ iat: now - 60, exp: now + 9 * 60, iss: this.appId });
    const unsigned = `${header}.${payload}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.privateKey).toString('base64url');
    return `${unsigned}.${signature}`;
  }

  async installationToken(installationId) {
    if (!Number.isInteger(Number(installationId))) throw new Error('A numeric GitHub App installation ID is required.');
    const response = await this.fetch(`${this.apiUrl}/app/installations/${installationId}/access_tokens`, { method: 'POST', headers: this.headers(this.createJwt()) });
    const data = await response.json();
    if (!response.ok || !data.token) throw new Error(`GitHub installation token exchange failed (${response.status}).`);
    return { token: data.token, expiresAt: data.expires_at };
  }

  async createPullRequest(token, fullName, input) {
    const response = await this.fetch(`${this.apiUrl}/repos/${fullName}/pulls`, { method: 'POST', headers: this.headers(token), body: JSON.stringify(input) });
    const data = await response.json();
    if (!response.ok) throw new Error(`GitHub pull request creation failed (${response.status}): ${data.message || 'unknown error'}`);
    return { number: data.number, url: data.html_url, state: data.state };
  }

  headers(token) { return { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'repo-upgrader', 'x-github-api-version': '2022-11-28' }; }
}

function encode(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }

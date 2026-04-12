export class AuthService {
    constructor(kv) {
        this.kv = kv;
    }

    async _hashPassword(password, salt) {
        const encoder = new TextEncoder();
        const data = encoder.encode(salt + ':' + password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async register(username, password) {
        if (!username || username.length < 3) throw new Error('用户名至少3个字符');
        if (!password || password.length < 6) throw new Error('密码至少6个字符');

        const existing = await this.kv.get(`user:${username}`);
        if (existing) throw new Error('用户名已存在');

        const salt = crypto.randomUUID();
        const passwordHash = await this._hashPassword(password, salt);
        const userId = crypto.randomUUID();
        await this.kv.put(`user:${username}`, JSON.stringify({ userId, passwordHash, salt, username }));
        return userId;
    }

    async login(username, password) {
        const raw = await this.kv.get(`user:${username}`);
        if (!raw) throw new Error('用户名或密码错误');

        const user = JSON.parse(raw);
        const passwordHash = await this._hashPassword(password, user.salt);
        if (passwordHash !== user.passwordHash) throw new Error('用户名或密码错误');

        const token = crypto.randomUUID();
        await this.kv.put(`session:${token}`, JSON.stringify({ userId: user.userId, username }), { expirationTtl: 7 * 24 * 3600 });
        return token;
    }

    async getSession(token) {
        if (!token) return null;
        const raw = await this.kv.get(`session:${token}`);
        if (!raw) return null;
        return JSON.parse(raw);
    }

    async logout(token) {
        if (token) await this.kv.delete(`session:${token}`);
    }

    getTokenFromRequest(req) {
        const cookie = req.header('Cookie') || '';
        const match = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
        return match ? match[1] : null;
    }
}

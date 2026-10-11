import type { UserProfile, WeeklySubmission } from '../types';

/**
 * Upstash Redis High-Speed Caching Layer
 * Reads configuration from Netlify Environment Variables or local runtime storage
 */
export class RedisService {
  private static getCredentials() {
    const url = localStorage.getItem('upstash_redis_url') || 
                import.meta.env.VITE_UPSTASH_REDIS_REST_URL || 
                '';
    const token = localStorage.getItem('upstash_redis_token') || 
                  import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN || 
                  '';
    return { url, token };
  }

  public static isConfigured(): boolean {
    const { url, token } = this.getCredentials();
    return Boolean(url && token);
  }

  public static setCredentials(url: string, token: string) {
    localStorage.setItem('upstash_redis_url', url.trim());
    localStorage.setItem('upstash_redis_token', token.trim());
  }

  // Execute Upstash REST command
  public static async command(args: (string | number)[]): Promise<any> {
    const { url, token } = this.getCredentials();

    if (!url || !token) {
      return this.localMemoryStore(args);
    }

    try {
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      const res = await fetch(`${cleanUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([args])
      });

      if (!res.ok) {
        throw new Error(`Upstash response status ${res.status}`);
      }

      const results = await res.json();
      return results[0]?.result;
    } catch (err) {
      console.warn('Upstash Redis fallback to local cache:', err);
      return this.localMemoryStore(args);
    }
  }

  // Local storage fallback so the site always runs at instant speeds
  private static localMemoryStore(args: (string | number)[]): any {
    const cmd = String(args[0]).toUpperCase();
    const key = String(args[1]);

    if (cmd === 'GET') {
      const val = localStorage.getItem(`redis_${key}`);
      return val ? JSON.parse(val) : null;
    }

    if (cmd === 'SET') {
      const val = args[2];
      localStorage.setItem(`redis_${key}`, JSON.stringify(val));
      return 'OK';
    }

    if (cmd === 'DEL') {
      localStorage.removeItem(`redis_${key}`);
      return 1;
    }

    return null;
  }

  // --- High Level Domain Caching Operations ---

  // Cache Worker Profile
  public static async cacheProfile(profile: UserProfile): Promise<void> {
    await this.command(['SET', `user:${profile.id}`, JSON.stringify(profile)]);
    await this.command(['SET', `phone:${profile.phone_number}`, profile.id]);
    await this.command(['SET', `wallet:${profile.id}`, profile.wallet_balance]);
  }

  // Get Worker Profile from Redis
  public static async getCachedProfile(userId: string): Promise<UserProfile | null> {
    const raw = await this.command(['GET', `user:${userId}`]);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  // Update & Cache Wallet Balance
  public static async updateWalletBalance(userId: string, newBalance: number): Promise<void> {
    await this.command(['SET', `wallet:${userId}`, newBalance]);
    const profile = await this.getCachedProfile(userId);
    if (profile) {
      profile.wallet_balance = newBalance;
      await this.cacheProfile(profile);
    }
  }

  // Cache All Weekly Submissions
  public static async cacheSubmissions(submissions: WeeklySubmission[]): Promise<void> {
    await this.command(['SET', 'submissions:all', JSON.stringify(submissions)]);
  }

  // Get Submissions from Redis
  public static async getCachedSubmissions(): Promise<WeeklySubmission[] | null> {
    const raw = await this.command(['GET', 'submissions:all']);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  // Store OTP with 10-minute expiry
  public static async storeOTP(phone: string, otp: string): Promise<void> {
    const payload = { otp, expiresAt: Date.now() + 10 * 60 * 1000 };
    await this.command(['SET', `otp:${phone}`, JSON.stringify(payload)]);
  }

  // Verify OTP
  public static async verifyOTP(phone: string, otp: string): Promise<boolean> {
    const raw = await this.command(['GET', `otp:${phone}`]);
    if (!raw) return false;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (data.otp === otp && Date.now() <= data.expiresAt) {
      await this.command(['DEL', `otp:${phone}`]);
      return true;
    }
    return false;
  }
}

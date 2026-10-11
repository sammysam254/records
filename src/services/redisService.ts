import type { UserProfile, WeeklySubmission } from '../types';

/**
 * Upstash Redis High-Speed Caching & Automated Self-Cleaning Engine
 * Provides sub-millisecond reads, writes, and database reconciliation.
 */
export class RedisService {
  private static getCredentials() {
    const url = localStorage.getItem('upstash_redis_url') || 
                import.meta.env.VITE_UPSTASH_REDIS_REST_URL || 
                'https://destined-spider-220274.upstash.io';
    const token = localStorage.getItem('upstash_redis_token') || 
                  import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN || 
                  'gQAAAAAAA1xyAAIgcDJmNjlhM2M2NWU3ZTc0NTg2OTNjNmY1MjFiMWYxZGQ4ZQ';
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

  // ─── Core REST Command Execution ───────────────────────────
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

  // ─── Batch Pipeline Execution (Single HTTP roundtrip) ───────
  public static async pipeline(commands: (string | number)[][]): Promise<any[]> {
    const { url, token } = this.getCredentials();
    if (!url || !token || commands.length === 0) return [];

    try {
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      const res = await fetch(`${cleanUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commands)
      });

      if (!res.ok) throw new Error(`Upstash pipeline error: ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json.map(j => j?.result) : [];
    } catch (err) {
      console.warn('Upstash Redis pipeline fallback:', err);
      return commands.map(cmd => this.localMemoryStore(cmd));
    }
  }

  // ─── Query All Redis Keys ──────────────────────────────────
  public static async getAllKeys(pattern: string = '*'): Promise<string[]> {
    const { url, token } = this.getCredentials();
    if (!url || !token) return [];

    try {
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      const res = await fetch(`${cleanUrl}/keys/${encodeURIComponent(pattern)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.result) ? json.result : [];
    } catch {
      return [];
    }
  }

  // ─── Local Storage Fallback ────────────────────────────────
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

  // ─── High-Speed Domain Caching: Workers ────────────────────

  // Get all registered workers from Redis cache (<50ms response)
  public static async getCachedWorkers(): Promise<UserProfile[] | null> {
    const raw = await this.command(['GET', 'workers:all']);
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(w => !this.isFakeWorker(w));
      }
      return null;
    } catch {
      return null;
    }
  }

  // Cache all registered workers
  public static async cacheWorkers(workers: UserProfile[]): Promise<void> {
    const clean = workers.filter(w => !this.isFakeWorker(w));
    await this.command(['SET', 'workers:all', JSON.stringify(clean)]);
  }

  // ─── Self-Cleaning & Database Sync Engine ──────────────────
  /**
   * Automatically reconciles Redis with authoritative database records:
   * 1. Updates 'workers:all' and individual worker profiles in Redis.
   * 2. Inspects existing Redis keys and PURGES any fake/orphaned/stale keys
   *    whose user IDs no longer exist in the database.
   * 3. Ensures lightning-fast loading speeds on subsequent page visits.
   */
  public static async syncAndCleanWorkers(dbWorkers: UserProfile[]): Promise<{ cleanedCount: number }> {
    const cleanWorkers = dbWorkers.filter(w => !this.isFakeWorker(w));
    const validIds = new Set(cleanWorkers.map(w => w.id));
    const validPhones = new Set(cleanWorkers.map(w => w.phone_number));
    const validEmails = new Set(cleanWorkers.filter(w => w.email).map(w => w.email.toLowerCase()));

    // Commands to write fresh authoritative data
    const pipelineCmds: (string | number)[][] = [
      ['SET', 'workers:all', JSON.stringify(cleanWorkers)]
    ];

    for (const w of cleanWorkers) {
      pipelineCmds.push(['SET', `user:${w.id}`, JSON.stringify(w)]);
      pipelineCmds.push(['SET', `phone:${w.phone_number}`, w.id]);
      if (w.email) {
        pipelineCmds.push(['SET', `email:${w.email.toLowerCase()}`, w.id]);
      }
      pipelineCmds.push(['SET', `wallet:${w.id}`, w.wallet_balance]);
    }

    // Inspect existing keys in Redis to detect and purge stale/fake/orphaned keys
    let cleanedCount = 0;
    try {
      const allKeys = await this.getAllKeys('*');
      for (const k of allKeys) {
        // Skip current valid workers key
        if (k === 'workers:all' || k === 'submissions:all') continue;
        // Don't delete active OTP keys
        if (k.startsWith('otp:')) continue;

        // Clean obsolete user:* keys
        if (k.startsWith('user:')) {
          const uid = k.slice(5);
          if (!validIds.has(uid)) {
            pipelineCmds.push(['DEL', k]);
            cleanedCount++;
          }
        }
        // Clean obsolete wallet:* keys
        else if (k.startsWith('wallet:')) {
          const wid = k.slice(7);
          if (!validIds.has(wid)) {
            pipelineCmds.push(['DEL', k]);
            cleanedCount++;
          }
        }
        // Clean obsolete phone:* keys
        else if (k.startsWith('phone:')) {
          const ph = k.slice(6);
          // Keep admin phone if configured, clean others not in DB
          if (ph !== '254706499848' && !validPhones.has(ph)) {
            pipelineCmds.push(['DEL', k]);
            cleanedCount++;
          }
        }
        // Clean obsolete email:* keys
        else if (k.startsWith('email:')) {
          const em = k.slice(6);
          if (!validEmails.has(em)) {
            pipelineCmds.push(['DEL', k]);
            cleanedCount++;
          }
        }
        // Clean any legacy test keys
        else if (k.startsWith('test_') || k.includes('samson_01') || k.includes('faith_02') || k.includes('kevin_03')) {
          pipelineCmds.push(['DEL', k]);
          cleanedCount++;
        }
      }
    } catch (err) {
      console.warn('Redis key scan warning:', err);
    }

    // Execute atomic sync and cleanup via pipeline
    await this.pipeline(pipelineCmds);
    return { cleanedCount };
  }

  // ─── High-Speed Domain Caching: Submissions ────────────────

  // Get cached submissions
  public static async getCachedSubmissions(): Promise<WeeklySubmission[] | null> {
    const raw = await this.command(['GET', 'submissions:all']);
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        return parsed.filter(s => {
          if (s.id === 'sub_001' || s.id === 'sub_002' || s.id === 'sub_003') return false;
          if (s.user && this.isFakeWorker(s.user)) return false;
          return true;
        });
      }
      return null;
    } catch {
      return null;
    }
  }

  // Cache and clean weekly submissions from DB
  public static async syncAndCleanSubmissions(submissions: WeeklySubmission[]): Promise<void> {
    const cleanSubs = submissions.filter(s => {
      if (s.id === 'sub_001' || s.id === 'sub_002' || s.id === 'sub_003') return false;
      if (s.user && this.isFakeWorker(s.user)) return false;
      return true;
    });

    await this.command(['SET', 'submissions:all', JSON.stringify(cleanSubs)]);
  }

  public static async cacheSubmissions(submissions: WeeklySubmission[]): Promise<void> {
    await this.syncAndCleanSubmissions(submissions);
  }

  // ─── Individual Profile Cache & Wallet Updates ────────────

  public static async cacheProfile(profile: UserProfile): Promise<void> {
    if (this.isFakeWorker(profile)) return;

    await this.pipeline([
      ['SET', `user:${profile.id}`, JSON.stringify(profile)],
      ['SET', `phone:${profile.phone_number}`, profile.id],
      ...(profile.email ? [['SET', `email:${profile.email.toLowerCase()}`, profile.id]] : []),
      ['SET', `wallet:${profile.id}`, profile.wallet_balance]
    ]);

    // Also update this profile inside workers:all cache if present
    const cachedWorkers = await this.getCachedWorkers();
    if (cachedWorkers) {
      const idx = cachedWorkers.findIndex(w => w.id === profile.id);
      if (idx !== -1) {
        cachedWorkers[idx] = profile;
      } else {
        cachedWorkers.unshift(profile);
      }
      await this.cacheWorkers(cachedWorkers);
    }
  }

  public static async getCachedProfile(userId: string): Promise<UserProfile | null> {
    const raw = await this.command(['GET', `user:${userId}`]);
    if (!raw) return null;
    const profile = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return this.isFakeWorker(profile) ? null : profile;
  }

  public static async getProfileByEmail(email: string): Promise<UserProfile | null> {
    const cleanEmail = email.toLowerCase().trim();
    const userId = await this.command(['GET', `email:${cleanEmail}`]);
    if (userId && typeof userId === 'string') {
      const profile = await this.getCachedProfile(userId);
      if (profile) return profile;
    }
    return null;
  }

  public static async getProfileByPhone(phone: string): Promise<UserProfile | null> {
    const userId = await this.command(['GET', `phone:${phone}`]);
    if (userId && typeof userId === 'string') {
      const profile = await this.getCachedProfile(userId);
      if (profile) return profile;
    }
    return null;
  }

  public static async updateWalletBalance(userId: string, newBalance: number): Promise<void> {
    const cleanBalance = Number(newBalance.toFixed(2));
    await this.command(['SET', `wallet:${userId}`, cleanBalance]);

    // Update user profile in Redis
    const profile = await this.getCachedProfile(userId);
    if (profile) {
      profile.wallet_balance = cleanBalance;
      await this.command(['SET', `user:${userId}`, JSON.stringify(profile)]);
    }

    // Also update wallet balance inside workers:all list cache
    const workers = await this.getCachedWorkers();
    if (workers) {
      const idx = workers.findIndex(w => w.id === userId);
      if (idx !== -1) {
        workers[idx].wallet_balance = cleanBalance;
        await this.cacheWorkers(workers);
      }
    }
  }

  // ─── OTP Operations ────────────────────────────────────────

  public static async storeOTP(phone: string, otp: string): Promise<void> {
    const payload = { otp, expiresAt: Date.now() + 10 * 60 * 1000 };
    await this.command(['SET', `otp:${phone}`, JSON.stringify(payload)]);
  }

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

  // Helper validation to reject fake seed workers
  private static isFakeWorker(w: Partial<UserProfile> | null | undefined): boolean {
    if (!w) return true;
    const email = (w.email || '').toLowerCase().trim();
    const id = (w.id || '').toLowerCase().trim();
    const phone = (w.phone_number || '').trim();
    if (email.endsWith('@records.io')) return true;
    if (id.startsWith('usr_samson') || id.startsWith('usr_faith') || id.startsWith('usr_kevin')) return true;
    if (phone === '254712345678' || phone === '254722998877' || phone === '254799112233') return true;
    return false;
  }
}

import type { UserProfile, WeeklySubmission } from '../types';
import { calculateWalletCredit } from '../utils/calculator';
import { SMSService, SMSTemplates, formatKenyanPhone } from './smsService';
import { RedisService } from './redisService';
import { getSupabase } from './supabaseClient';

const SEED_WORKERS: UserProfile[] = [
  {
    id: 'usr_samson_01',
    email: 'samson@records.io',
    full_name: 'Samson Matata Mwinzi',
    phone_number: '254712345678',
    device_url: 'https://workstation.cloud/device/sm-7701',
    device_pin: '8492',
    wallet_balance: 65.0,
    role: 'worker',
    phone_verified: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: 'usr_faith_02',
    email: 'faith@records.io',
    full_name: 'Faith Achieng Ouma',
    phone_number: '254722998877',
    device_url: 'https://workstation.cloud/device/fo-9912',
    device_pin: '3150',
    wallet_balance: 40.0,
    role: 'worker',
    phone_verified: true,
    created_at: new Date(Date.now() - 20 * 86400000).toISOString()
  },
  {
    id: 'usr_kevin_03',
    email: 'kevin@records.io',
    full_name: 'Kevin Kiprono Bett',
    phone_number: '254799112233',
    device_url: 'https://workstation.cloud/device/kb-4421',
    device_pin: '7741',
    wallet_balance: 0.0,
    role: 'worker',
    phone_verified: true,
    created_at: new Date(Date.now() - 10 * 86400000).toISOString()
  }
];

const SEED_SUBMISSIONS: WeeklySubmission[] = [
  {
    id: 'sub_001',
    user_id: 'usr_samson_01',
    amount_made: 110.0,
    calculated_credit: 55.0, // 40 + (110 - 80)/2 = 40 + 15 = 55
    status: 'pending',
    week_date: new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString()
  },
  {
    id: 'sub_002',
    user_id: 'usr_faith_02',
    amount_made: 65.0,
    calculated_credit: 25.0, // 65 - 40 = 25
    status: 'pending',
    week_date: new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString()
  },
  {
    id: 'sub_003',
    user_id: 'usr_kevin_03',
    amount_made: 35.0,
    calculated_credit: 0.0, // <= 40 => 0
    status: 'pending',
    week_date: new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString()
  }
];

export class DataService {
  private static STORAGE_KEY_WORKERS = 'records_workers_db';
  private static STORAGE_KEY_SUBMISSIONS = 'records_submissions_db';
  private static STORAGE_KEY_CURRENT_USER = 'records_active_user';

  // Initialize data store from Redis or seeds
  public static async init(): Promise<void> {
    const rawWorkers = localStorage.getItem(this.STORAGE_KEY_WORKERS);
    if (!rawWorkers) {
      localStorage.setItem(this.STORAGE_KEY_WORKERS, JSON.stringify(SEED_WORKERS));
      for (const w of SEED_WORKERS) {
        await RedisService.cacheProfile(w);
      }
    }

    const rawSubmissions = localStorage.getItem(this.STORAGE_KEY_SUBMISSIONS);
    if (!rawSubmissions) {
      localStorage.setItem(this.STORAGE_KEY_SUBMISSIONS, JSON.stringify(SEED_SUBMISSIONS));
      await RedisService.cacheSubmissions(SEED_SUBMISSIONS);
    }
  }

  // Get active session
  public static getCurrentUser(): UserProfile | null {
    const raw = localStorage.getItem(this.STORAGE_KEY_CURRENT_USER);
    if (!raw) return SEED_WORKERS[0]; // Default to Samson for instant preview
    return JSON.parse(raw);
  }

  public static setCurrentUser(user: UserProfile | null): void {
    if (user) {
      localStorage.setItem(this.STORAGE_KEY_CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(this.STORAGE_KEY_CURRENT_USER);
    }
  }

  // Get all workers (served from Redis or local store)
  public static async getWorkers(): Promise<UserProfile[]> {
    const raw = localStorage.getItem(this.STORAGE_KEY_WORKERS);
    return raw ? JSON.parse(raw) : SEED_WORKERS;
  }

  // Get single worker
  public static async getWorkerById(id: string): Promise<UserProfile | null> {
    const cached = await RedisService.getCachedProfile(id);
    if (cached) return cached;

    const workers = await this.getWorkers();
    const worker = workers.find(w => w.id === id) || null;
    if (worker) {
      await RedisService.cacheProfile(worker);
    }
    return worker;
  }

  // Send Registration SMS OTP
  public static async sendRegistrationOTP(phoneNumber: string, fullName: string): Promise<{ success: boolean; code?: string; message: string }> {
    const formatted = formatKenyanPhone(phoneNumber);
    if (formatted.length < 10) {
      return { success: false, message: 'Invalid phone number format' };
    }

    // Generate 6-digit random code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store in Redis (10 minutes TTL)
    await RedisService.storeOTP(formatted, code);

    // Prepare customized message starting with "Hello {fullName}"
    const message = SMSTemplates.otp(fullName || 'User', code);

    // Send SMS via TextSMS Kenya
    const smsRes = await SMSService.sendSMS({
      mobile: formatted,
      recipientName: fullName || 'User',
      message,
      messageType: 'otp'
    });

    return {
      success: true,
      code,
      message: `Verification code sent to ${formatted}: ${smsRes.description}`
    };
  }

  // Verify Registration OTP
  public static async verifyRegistrationOTP(phoneNumber: string, code: string): Promise<boolean> {
    const formatted = formatKenyanPhone(phoneNumber);
    return await RedisService.verifyOTP(formatted, code);
  }

  // Register Worker
  public static async registerWorker(data: {
    fullName: string;
    phoneNumber: string;
    email: string;
    password?: string;
    deviceUrl: string;
    devicePin: string;
    isPhoneVerified: boolean;
  }): Promise<{ success: boolean; worker?: UserProfile; error?: string }> {
    const workers = await this.getWorkers();
    const formattedPhone = formatKenyanPhone(data.phoneNumber);

    if (workers.some(w => w.phone_number === formattedPhone)) {
      return { success: false, error: 'A worker with this phone number is already registered.' };
    }

    if (workers.some(w => w.email.toLowerCase() === data.email.toLowerCase())) {
      return { success: false, error: 'A worker with this email address is already registered.' };
    }

    const newWorker: UserProfile = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      email: data.email,
      full_name: data.fullName,
      phone_number: formattedPhone,
      device_url: data.deviceUrl,
      device_pin: data.devicePin,
      wallet_balance: 0.0,
      role: 'worker',
      phone_verified: data.isPhoneVerified,
      created_at: new Date().toISOString()
    };

    // If Supabase is connected, insert to Supabase auth & profiles
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('profiles').insert([
          {
            id: newWorker.id,
            full_name: newWorker.full_name,
            phone_number: newWorker.phone_number,
            device_url: newWorker.device_url,
            device_pin: newWorker.device_pin,
            wallet_balance: 0,
            role: 'worker',
            phone_verified: newWorker.phone_verified
          }
        ]);
      } catch (err) {
        console.warn('Supabase profile insertion error:', err);
      }
    }

    // Cache in Redis & local store
    workers.push(newWorker);
    localStorage.setItem(this.STORAGE_KEY_WORKERS, JSON.stringify(workers));
    await RedisService.cacheProfile(newWorker);

    // Auto-login
    this.setCurrentUser(newWorker);

    return { success: true, worker: newWorker };
  }

  // Submit Weekly Earnings (Every Saturday)
  public static async submitWeeklyEarnings(userId: string, amount: number): Promise<{ success: boolean; submission?: WeeklySubmission; error?: string }> {
    const worker = await this.getWorkerById(userId);
    if (!worker) {
      return { success: false, error: 'Worker profile not found.' };
    }

    const calculatedCredit = calculateWalletCredit(amount);
    const submissions = await this.getSubmissions();

    const newSub: WeeklySubmission = {
      id: 'sub_' + Math.random().toString(36).substring(2, 9),
      user_id: userId,
      amount_made: Number(amount.toFixed(2)),
      calculated_credit: calculatedCredit,
      status: 'pending',
      week_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      user: worker
    };

    // Save locally & Redis
    submissions.unshift(newSub);
    localStorage.setItem(this.STORAGE_KEY_SUBMISSIONS, JSON.stringify(submissions));
    await RedisService.cacheSubmissions(submissions);

    // If Supabase is configured
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('weekly_submissions').insert([
          {
            id: newSub.id,
            user_id: newSub.user_id,
            amount_made: newSub.amount_made,
            calculated_credit: newSub.calculated_credit,
            status: 'pending'
          }
        ]);
      } catch (err) {
        console.warn('Supabase submission insert error:', err);
      }
    }

    // Send SMS confirmation starting with "Hello {FullName}"
    const message = SMSTemplates.submissionReceived(worker.full_name, amount);
    await SMSService.sendSMS({
      mobile: worker.phone_number,
      recipientName: worker.full_name,
      message,
      messageType: 'submission_received',
      userId: worker.id
    });

    return { success: true, submission: newSub };
  }

  // Get Submissions
  public static async getSubmissions(): Promise<WeeklySubmission[]> {
    const raw = localStorage.getItem(this.STORAGE_KEY_SUBMISSIONS);
    const list: WeeklySubmission[] = raw ? JSON.parse(raw) : SEED_SUBMISSIONS;
    const workers = await this.getWorkers();
    
    // Attach user profile reference
    return list.map(sub => ({
      ...sub,
      user: workers.find(w => w.id === sub.user_id)
    }));
  }

  // Admin approves submission -> Credits wallet & sends SMS
  public static async approveSubmission(submissionId: string): Promise<{ success: boolean; error?: string }> {
    const submissions = await this.getSubmissions();
    const index = submissions.findIndex(s => s.id === submissionId);
    if (index === -1) return { success: false, error: 'Submission not found' };

    const sub = submissions[index];
    if (sub.status !== 'pending') {
      return { success: false, error: `Submission is already ${sub.status}` };
    }

    const worker = await this.getWorkerById(sub.user_id);
    if (!worker) return { success: false, error: 'Worker profile not found' };

    // Update submission
    sub.status = 'approved';
    sub.approved_at = new Date().toISOString();

    // Credit Worker Wallet
    const newBalance = Number((worker.wallet_balance + sub.calculated_credit).toFixed(2));
    worker.wallet_balance = newBalance;

    // Persist
    const workers = await this.getWorkers();
    const workerIndex = workers.findIndex(w => w.id === worker.id);
    if (workerIndex !== -1) workers[workerIndex] = worker;

    localStorage.setItem(this.STORAGE_KEY_WORKERS, JSON.stringify(workers));
    localStorage.setItem(this.STORAGE_KEY_SUBMISSIONS, JSON.stringify(submissions));

    // Update Redis Cache
    await RedisService.updateWalletBalance(worker.id, newBalance);
    await RedisService.cacheProfile(worker);
    await RedisService.cacheSubmissions(submissions);

    // If current session is this worker, update session
    const current = this.getCurrentUser();
    if (current && current.id === worker.id) {
      this.setCurrentUser(worker);
    }

    // Send Approval SMS: "Hello {FullName}, your weekly earnings... has been approved..."
    const message = SMSTemplates.approvedAndCredited(
      worker.full_name,
      sub.amount_made,
      sub.calculated_credit,
      newBalance
    );

    await SMSService.sendSMS({
      mobile: worker.phone_number,
      recipientName: worker.full_name,
      message,
      messageType: 'approved',
      userId: worker.id
    });

    return { success: true };
  }

  // Admin marks submission as Paid -> Deducts credit from wallet & sends SMS
  public static async markSubmissionAsPaid(submissionId: string): Promise<{ success: boolean; error?: string }> {
    const submissions = await this.getSubmissions();
    const index = submissions.findIndex(s => s.id === submissionId);
    if (index === -1) return { success: false, error: 'Submission not found' };

    const sub = submissions[index];
    if (sub.status === 'paid') {
      return { success: false, error: 'Submission is already marked as paid' };
    }

    const worker = await this.getWorkerById(sub.user_id);
    if (!worker) return { success: false, error: 'Worker profile not found' };

    // Update submission status
    sub.status = 'paid';
    sub.paid_at = new Date().toISOString();

    // Deduct from wallet balance
    const deduction = sub.calculated_credit;
    const newBalance = Math.max(0, Number((worker.wallet_balance - deduction).toFixed(2)));
    worker.wallet_balance = newBalance;

    // Persist
    const workers = await this.getWorkers();
    const workerIndex = workers.findIndex(w => w.id === worker.id);
    if (workerIndex !== -1) workers[workerIndex] = worker;

    localStorage.setItem(this.STORAGE_KEY_WORKERS, JSON.stringify(workers));
    localStorage.setItem(this.STORAGE_KEY_SUBMISSIONS, JSON.stringify(submissions));

    // Update Redis Cache
    await RedisService.updateWalletBalance(worker.id, newBalance);
    await RedisService.cacheProfile(worker);
    await RedisService.cacheSubmissions(submissions);

    // If current session is this worker, update session
    const current = this.getCurrentUser();
    if (current && current.id === worker.id) {
      this.setCurrentUser(worker);
    }

    // Send Paid SMS: "Hello {FullName}, admin has paid your earnings of {amount}... deducted... new balance {balance}."
    const message = SMSTemplates.markedAsPaid(
      worker.full_name,
      deduction,
      newBalance
    );

    await SMSService.sendSMS({
      mobile: worker.phone_number,
      recipientName: worker.full_name,
      message,
      messageType: 'paid',
      userId: worker.id
    });

    return { success: true };
  }

  // Send Saturday Reminder SMS to all workers or pending workers
  public static async sendSaturdayReminders(): Promise<{ sentCount: number; results: string[] }> {
    const workers = await this.getWorkers();
    const results: string[] = [];
    let sentCount = 0;

    for (const worker of workers) {
      if (worker.role !== 'worker') continue;

      const message = SMSTemplates.saturdayReminder(worker.full_name);
      const res = await SMSService.sendSMS({
        mobile: worker.phone_number,
        recipientName: worker.full_name,
        message,
        messageType: 'saturday_reminder',
        userId: worker.id
      });

      sentCount++;
      results.push(`${worker.full_name} (${worker.phone_number}): ${res.description}`);
    }

    return { sentCount, results };
  }
}

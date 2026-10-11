export type UserRole = 'worker' | 'admin';

export type SubmissionStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone_number: string;
  device_url: string;
  device_serial?: string;
  device_pin: string;
  wallet_balance: number;
  role: UserRole;
  phone_verified: boolean;
  created_at: string;
  updated_at?: string;
}

export interface WeeklySubmission {
  id: string;
  user_id: string;
  amount_made: number;
  calculated_credit: number;
  status: SubmissionStatus;
  week_date: string;
  admin_notes?: string;
  approved_at?: string;
  paid_at?: string;
  created_at: string;
  user?: UserProfile;
}

export interface SMSLog {
  id: string;
  user_id?: string;
  phone_number: string;
  recipient_name: string;
  message: string;
  message_type: 'otp' | 'submission_received' | 'approved' | 'paid' | 'saturday_reminder' | 'custom';
  status_code: number;
  response_desc: string;
  created_at: string;
}

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  textSmsApiKey: string;
  textSmsPartnerId: string;
  textSmsShortcode: string;
  upstashRedisUrl: string;
  upstashRedisToken: string;
}

export interface CalculationBreakdown {
  amount: number;
  tier: 1 | 2 | 3;
  baseCredit: number;
  excessAmount: number;
  excessCredit: number;
  totalCredit: number;
  summary: string;
}

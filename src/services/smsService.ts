import type { SMSLog } from '../types';

export interface SendSMSParams {
  mobile: string;
  recipientName: string;
  message: string;
  messageType?: 'otp' | 'submission_received' | 'approved' | 'paid' | 'saturday_reminder' | 'custom';
  userId?: string;
}

export interface SendSMSResult {
  success: boolean;
  messageId?: string | number;
  statusCode: number;
  description: string;
  formattedMobile: string;
  log?: SMSLog;
}

// Clean and format mobile number to Kenyan international format e.g. 2547XXXXXXXX
export function formatKenyanPhone(phone: string): string {
  // Strip all non-digits and leading +
  let cleaned = phone.replace(/[^\d]/g, '');

  // Handle +254... → already full international
  if (cleaned.startsWith('254') && cleaned.length === 12) {
    return cleaned; // e.g. 254706499848
  }

  // Handle 0XXXXXXXXX (10 digits starting with 0) e.g. 0706499848
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '254' + cleaned.substring(1); // → 254706499848
  }

  // Handle 7XXXXXXXX or 1XXXXXXXX (9 digits, local without leading 0)
  if ((cleaned.startsWith('7') || cleaned.startsWith('1')) && cleaned.length === 9) {
    return '254' + cleaned; // → 254706499848
  }

  // Handle cases where user typed partial international without + e.g. 254706499848 already 12 digits
  if (cleaned.length === 12 && cleaned.startsWith('254')) {
    return cleaned;
  }

  // Return as-is and let validation catch it
  return cleaned;
}

// Validates that a number is a proper Kenyan international format (254XXXXXXXXX = 12 digits)
export function isValidKenyanPhone(phone: string): boolean {
  const formatted = formatKenyanPhone(phone);
  return /^254[17]\d{8}$/.test(formatted);
}

// Template generators ensuring every message begins with "Hello {FullName}" and uses Dollar ($)
export const SMSTemplates = {
  otp: (fullName: string, code: string) => 
    `Hello ${fullName}, your verification code is ${code}. Please enter this to verify your phone number.`,

  submissionReceived: (fullName: string, amount: number) => 
    `Hello ${fullName}, your weekly earnings submission of $${amount.toFixed(2)} has been received and is waiting for admin approval.`,

  approvedAndCredited: (fullName: string, amountMade: number, credited: number, currentBalance: number) => 
    `Hello ${fullName}, your weekly earnings of $${amountMade.toFixed(2)} has been approved. $${credited.toFixed(2)} has been credited to your wallet. Current wallet balance: $${currentBalance.toFixed(2)}.`,

  markedAsPaid: (fullName: string, amountPaid: number, remainingBalance: number) => 
    `Hello ${fullName}, admin has paid your earnings of $${amountPaid.toFixed(2)}. This amount has been deducted from your wallet. Your new balance is $${remainingBalance.toFixed(2)}.`,

  saturdayReminder: (fullName: string) => 
    `Hello ${fullName}, it's Saturday! This is a reminder to submit your weekly earnings through your dashboard.`
};

export class SMSService {
  public static getStoredConfig() {
    const apiKey = localStorage.getItem('textsms_apikey') || import.meta.env.VITE_TEXTSMS_API_KEY || '';
    // partnerID is optional — TextSMS Kenya works with just the API key + default shortcode
    const partnerId = localStorage.getItem('textsms_partnerid') || import.meta.env.VITE_TEXTSMS_PARTNER_ID || '';
    const shortcode = localStorage.getItem('textsms_shortcode') || import.meta.env.VITE_TEXTSMS_SHORTCODE || 'TextSMS';
    return { apiKey, partnerId, shortcode };
  }

  public static async sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
    const { apiKey, partnerId, shortcode } = this.getStoredConfig();
    const formattedMobile = formatKenyanPhone(params.mobile);

    // Make sure the message starts with "Hello {recipientName},"
    let finalMessage = params.message;
    if (!finalMessage.toLowerCase().startsWith('hello')) {
      finalMessage = `Hello ${params.recipientName}, ${finalMessage}`;
    }

    // Build payload — partnerID is optional
    const smsPayload: Record<string, string> = {
      mobile: formattedMobile,
      message: finalMessage,
      apikey: apiKey,
      shortcode: shortcode
    };
    if (partnerId) smsPayload.partnerID = partnerId;

    // Try Netlify serverless function first (handles TextSMS API server-side)
    try {
      const netlifyResp = await fetch('/.netlify/functions/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smsPayload)
      });

      const data = await netlifyResp.json();

      if (!netlifyResp.ok) {
        const errorMsg = data.error || data['response-description'] || `HTTP ${netlifyResp.status}`;
        throw new Error(`TextSMS Dispatch Failed: ${errorMsg}`);
      }

      // Check TextSMS API response payload
      const responseEntry = data?.responses?.[0] || data;
      const respCode = responseEntry['respose-code'] || responseEntry['response-code'] || 200;
      const desc = responseEntry['response-description'] || 'SMS Dispatched';
      const msgId = responseEntry.messageid;

      if (respCode !== 200) {
        throw new Error(`TextSMS Error (${respCode}): ${desc}`);
      }

      const log = this.recordLog(params, formattedMobile, finalMessage, 200, desc);

      return {
        success: true,
        messageId: msgId,
        statusCode: 200,
        description: desc,
        formattedMobile,
        log
      };
    } catch (err: any) {
      console.error('Real SMS sending error:', err);
      // NO SIMULATION FALLBACK - Report real error
      const log = this.recordLog(params, formattedMobile, finalMessage, 500, err.message || 'SMS Delivery Failed');
      return {
        success: false,
        statusCode: 500,
        description: err.message || 'Failed to send SMS via TextSMS Kenya gateway.',
        formattedMobile,
        log
      };
    }
  }

  public static async checkBalance(): Promise<{ balance?: string; raw?: unknown; error?: string }> {
    const { apiKey, partnerId } = this.getStoredConfig();

    try {
      const response = await fetch('/.netlify/functions/check-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: apiKey, partnerID: partnerId })
      });
      const data = await response.json();
      return { raw: data, balance: JSON.stringify(data) };
    } catch (err: any) {
      return { error: err.message || 'Failed to check balance' };
    }
  }

  private static recordLog(
    params: SendSMSParams,
    formattedMobile: string,
    message: string,
    statusCode: number,
    responseDesc: string
  ): SMSLog {
    const log: SMSLog = {
      id: 'sms_' + Math.random().toString(36).substring(2, 9),
      user_id: params.userId,
      phone_number: formattedMobile,
      recipient_name: params.recipientName,
      message,
      message_type: params.messageType || 'custom',
      status_code: statusCode,
      response_desc: responseDesc,
      created_at: new Date().toISOString()
    };

    try {
      const existing = JSON.parse(localStorage.getItem('sms_logs_cache') || '[]');
      existing.unshift(log);
      localStorage.setItem('sms_logs_cache', JSON.stringify(existing.slice(0, 100)));
    } catch {
      // ignore
    }

    return log;
  }

  public static getLogs(): SMSLog[] {
    try {
      return JSON.parse(localStorage.getItem('sms_logs_cache') || '[]');
    } catch {
      return [];
    }
  }
}

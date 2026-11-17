export interface SmsProvider {
  send(to: string, text: string): Promise<void>;
}

/** Development: codes are printed to the server log. */
export const consoleSms: SmsProvider = {
  async send(to, text) {
    console.log(`[sms] to ${to}: ${text}`);
  },
};

/**
 * Production: POSTs {to, text} as JSON to SMS_WEBHOOK_URL. Point it at a tiny adapter for whichever
 * local gateway is cheapest where you launch (Africa's Talking, Twilio, a carrier API…).
 */
export function webhookSms(url: string, token?: string): SmsProvider {
  return {
    async send(to, text) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ to, text }),
      });
      if (!res.ok) throw new Error(`sms webhook failed: ${res.status}`);
    },
  };
}

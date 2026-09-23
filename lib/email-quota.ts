import { getQuotaStatus, recordEmailsSent, HOURLY_LIMIT, DAILY_LIMIT } from './email-queue';

export { HOURLY_LIMIT, DAILY_LIMIT };

export interface QuotaCheckResult {
  canSend: boolean;
  reason?: string;
  emailsSent?: number;
  dailyLimit?: number;
  hourlyLimitReached?: boolean;
  nextHourReset?: Date;
  emailsSentThisHour?: number;
  emailsSentToday?: number;
  canSendMore?: number;
}

export async function checkEmailQuota(): Promise<QuotaCheckResult> {
  const status = await getQuotaStatus();
  const nextHourReset = new Date(Date.now() + (status.minutes_to_reset * 60 * 1000));

  return {
    canSend: status.can_send > 0,
    reason: status.cooldown_reason,
    emailsSent: status.daily_used,
    dailyLimit: status.daily_limit,
    hourlyLimitReached: status.hourly_remaining <= 0,
    emailsSentThisHour: status.hourly_used,
    emailsSentToday: status.daily_used,
    canSendMore: status.can_send,
    nextHourReset,
  };
}

export async function incrementEmailQuota(apiUsed?: string, count: number = 1): Promise<void> {
  await recordEmailsSent(count, apiUsed);
}

import { getDeviceId } from './deviceId';

const WORKER_URL = import.meta.env.VITE_SYNC_WORKER_URL || '';

export type FeedbackType = 'bug' | 'suggestion' | 'other';

export async function submitFeedback(type: FeedbackType, message: string, page?: string): Promise<void> {
  if (!WORKER_URL) throw new Error('Sync worker not configured');
  const deviceId = getDeviceId();
  const response = await fetch(`${WORKER_URL}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(deviceId ? { 'X-Device-ID': deviceId } : {}),
    },
    body: JSON.stringify({ type, message, page }),
  });
  if (!response.ok) throw new Error('Failed to submit feedback');
}

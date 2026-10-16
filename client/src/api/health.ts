import type { HealthResponse } from '@issue-tracker/shared';
import { request } from './http';

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

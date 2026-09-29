import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { CalculationResponse, ChecklistItem, ExitReason, ProfileDraft, ProfileDto, RightsSource } from './models';

/** Thin HTTP adapter. Knows URLs and shapes, nothing about the flow. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  calculate(profile: ProfileDto, reason: ExitReason, fromPayslip: boolean): Promise<CalculationResponse> {
    return firstValueFrom(this.http.post<CalculationResponse>(`${this.base}/api/calculations`, { profile, reason, fromPayslip }));
  }

  compare(profile: ProfileDto, fromPayslip: boolean): Promise<CalculationResponse[]> {
    return firstValueFrom(this.http.post<CalculationResponse[]>(`${this.base}/api/calculations/compare`, { profile, fromPayslip }));
  }

  extractPayslips(images: Blob[]): Promise<ProfileDraft> {
    const form = new FormData();
    images.forEach((img, i) => form.append('files', img, `payslip-${i + 1}.jpg`));
    return firstValueFrom(this.http.post<ProfileDraft>(`${this.base}/api/payslips/extract`, form));
  }

  checklist(reason: ExitReason): Promise<ChecklistItem[]> {
    return firstValueFrom(this.http.get<ChecklistItem[]>(`${this.base}/api/checklist`, { params: { reason } }));
  }

  sources(): Promise<RightsSource[]> {
    return firstValueFrom(this.http.get<RightsSource[]>(`${this.base}/api/sources`));
  }

  partners(kind: 'Professional' | 'Lawyer'): Promise<PartnerOffer[]> {
    return firstValueFrom(this.http.get<PartnerOffer[]>(`${this.base}/api/partners`, { params: { kind } }));
  }

  requestPaidHelp(body: PaidHelpRequest): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/api/help-requests`, body));
  }

  submitReview(body: ExperienceReview): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/api/reviews`, body));
  }
}

export interface PartnerOffer {
  id: string;
  name: string;
  kind: 'Professional' | 'Lawyer';
  summary: string;
  cooperation: boolean;
  discountPercent: number;
  email: string | null;
  whatsapp: string | null;
}

export interface PaidHelpRequest {
  kind: 'Professional' | 'Lawyer';
  name: string;
  phone: string;
  email: string;
  note: string | null;
  reason: string | null;
  estimatedTotal: number | null;
  partnerId: string | null;
  channel: 'Email' | 'WhatsApp' | null;
}

export interface ExperienceReview {
  systemRating: number;
  experienceRating: number;
  text: string | null;
}

/** Turns an API failure into a sentence the user can act on. The server sends Hebrew problem titles. */
export function describeError(err: unknown): { message: string; fields: Record<string, string> } {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return { message: 'אין חיבור לשרת. בדקו את החיבור לאינטרנט.', fields: {} };
    if (err.status === 429) return { message: 'יותר מדי ניסיונות. נסו שוב בעוד דקה.', fields: {} };
    const body = err.error as { title?: string; errors?: Record<string, string> } | null;
    return { message: body?.title ?? 'משהו השתבש. נסו שוב.', fields: body?.errors ?? {} };
  }
  return { message: 'משהו השתבש. נסו שוב.', fields: {} };
}

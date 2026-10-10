import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { CalculationResponse, ChecklistItem, ExitReason, FundLine, ProfileDraft, ProfileDto, RightsReport, RightsSource } from './models';
import type { ExtractedContribution } from './review.models';

/** One document check reads up to three pages with an AI model: generous, but not endless. */
const VERIFY_TIMEOUT_MS = 150_000;

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

  buildReport(body: {
    profile: ProfileDto;
    reason: ExitReason | null;
    compare: boolean;
    fromPayslip: boolean;
    payslipMonth: string | null;
    funds: FundLine[];
    employerName?: string | null;
  }): Promise<RightsReport> {
    return firstValueFrom(this.http.post<RightsReport>(`${this.base}/api/reports`, body));
  }

  exportReport(
    body: {
      profile: ProfileDto;
      reason: ExitReason | null;
      compare: boolean;
      fromPayslip: boolean;
      payslipMonth: string | null;
      funds: FundLine[];
      employerName?: string | null;
    },
    format: 'html' | 'csv' | 'json'
  ): Promise<Blob> {
    return firstValueFrom(this.http.post(`${this.base}/api/reports/export?format=${format}`, body, {
      responseType: 'blob'
    }));
  }

  extractPayslips(images: Blob[]): Promise<ProfileDraft> {
    const form = new FormData();
    images.forEach((img, i) => form.append('files', img, `payslip-${i + 1}.jpg`));
    return firstValueFrom(this.http.post<ProfileDraft>(`${this.base}/api/payslips/extract`, form));
  }

  /** Verify employment-review document type/year/(month) via OCR/AI. */
  verifyDocument(body: {
    images: Blob[];
    expectedType: string;
    expectedYear: number;
    expectedMonth?: number | null;
  }): Promise<DocumentVerificationResult> {
    const form = new FormData();
    body.images.forEach((img, i) => form.append('files', img, `doc-${i + 1}.jpg`));
    form.append('expectedType', body.expectedType);
    form.append('expectedYear', String(body.expectedYear));
    if (body.expectedMonth != null) form.append('expectedMonth', String(body.expectedMonth));
    // A server that does not answer must not leave the spinner running for ever: after this the document waits for a re-check.
    return firstValueFrom(this.http.post<DocumentVerificationResult>(`${this.base}/api/documents/verify`, form).pipe(timeout(VERIFY_TIMEOUT_MS)));
  }

  checklist(reason?: ExitReason | null): Promise<ChecklistItem[]> {
    return firstValueFrom(this.http.get<ChecklistItem[]>(
      `${this.base}/api/checklist`,
      reason ? { params: { reason } } : {}
    ));
  }

  sources(): Promise<RightsSource[]> {
    return firstValueFrom(this.http.get<RightsSource[]>(`${this.base}/api/sources`));
  }

  partners(kind: 'Professional' | 'Lawyer'): Promise<PartnerOffer[]> {
    return firstValueFrom(this.http.get<PartnerOffer[]>(`${this.base}/api/partners`, { params: { kind } }));
  }

  partnerReviews(partnerId: string): Promise<PartnerReview[]> {
    return firstValueFrom(this.http.get<PartnerReview[]>(`${this.base}/api/partners/${encodeURIComponent(partnerId)}/reviews`));
  }

  saveReview(partnerId: string, rating: number, text: string): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/api/partners/${encodeURIComponent(partnerId)}/reviews/me`, { rating, text }));
  }

  deleteReview(partnerId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/api/partners/${encodeURIComponent(partnerId)}/reviews/me`));
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
  website?: string | null;
  specialty?: string | null;
  recommendations?: string[] | null;
  /** Average of users' ratings (1–5), null when nobody rated yet. */
  ratingAverage?: number | null;
  ratingCount?: number;
}

/** A user's rating of a professional, shown with a short display name only. */
export interface PartnerReview {
  partnerId: string;
  rating: number;
  text: string | null;
  displayName: string;
  updatedAt: string;
  mine: boolean;
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

export interface DocumentVerificationResult {
  readable: boolean;
  detectedType: string;
  detectedYear: number | null;
  detectedMonth: number | null;
  periodLabel: string | null;
  typeMatches: boolean;
  yearMatches: boolean;
  monthMatches: boolean;
  overallOk: boolean;
  messageHe: string;
  summaryHe: string | null;
  /** The employer printed on a payslip / Form 106, or null. */
  employerName?: string | null;
  grossSalary?: number | null;
  annualGross?: number | null;
  funds?: Array<{
    kind: string;
    provider: string | null;
    balance: number | null;
    asOf: string | null;
    feeAnnualPercent: number | null;
    returnAnnualPercent: number | null;
    track: string | null;
  }> | null;
  /** Payslip contribution kinds: pension, severance, disability, study. */
  contributionKinds?: string[] | null;
  pensionBase?: number | null;
  contributions?: ExtractedContribution[] | null;
  /** Payslip only: vacation days as printed; a figure the payslip does not show is null. */
  vacation?: { balance: number | null; used: number | null; accrued: number | null; previousBalance: number | null } | null;
  /** Payslip only: the payment lines (salary, notice pay, vacation redemption, ...). */
  payComponents?: Array<{ kind: string; amount: number }> | null;
  /** Form 106 only: the per-fund yearly totals of its table of contributions to funds. */
  fundTotals?: Array<{ kind: string; provider: string | null; employee: number; employer: number }> | null;
}

/** Turns an API failure into a sentence the user can act on. The server sends Hebrew problem titles. */
export function describeError(err: unknown): { message: string; fields: Record<string, string> } {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return { message: 'אין חיבור לשרת. בדקו את החיבור לאינטרנט.', fields: {} };
    const body = err.error as { title?: string; errors?: Record<string, string> } | null;
    // The server's own 429s say how long to wait (a minute, an hour); the generic text covers the gateway limiter.
    if (err.status === 429) return { message: body?.title ?? 'יותר מדי ניסיונות. נסו שוב בעוד דקה.', fields: {} };
    return { message: body?.title ?? 'משהו השתבש. נסו שוב.', fields: body?.errors ?? {} };
  }
  return { message: 'משהו השתבש. נסו שוב.', fields: {} };
}

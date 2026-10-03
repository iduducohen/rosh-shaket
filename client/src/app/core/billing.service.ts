import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface BillingPlan {
  id: string;
  name: string;
  tagline: string;
  documents: number;
  priceIls: number;
  recommended: boolean;
  topUp: boolean;
}

export interface PlansResponse {
  plans: BillingPlan[];
  freeDocuments: number;
  enabled: boolean;
  checkoutAvailable: boolean;
  simulated: boolean;
}

export interface BillingPurchase {
  id: string;
  planId: string;
  planName: string;
  documents: number;
  amountIls: number;
  status: string;
  provider: string;
  createdAt: string;
}

export interface BillingLedgerEntry {
  delta: number;
  kind: 'welcome' | 'purchase' | 'document' | 'refund' | string;
  documentType: string | null;
  year: number | null;
  month: number | null;
  createdAt: string;
}

export interface BillingAccount {
  balance: number;
  freeGranted: number;
  purchased: number;
  used: number;
  refunded: number;
  spentIls: number;
  purchases: BillingPurchase[];
  recentActivity: BillingLedgerEntry[];
}

export interface CheckoutResult {
  status: string;
  purchase: BillingPurchase;
  balance: number;
}

/** Credits for the full review: one credit = one document read by the AI check. */
@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/billing`;

  /** Last known account, shared by the header chip, account page and paywall. */
  readonly account = signal<BillingAccount | null>(null);

  /** Whether the server counts documents at all (off during the trial run). */
  readonly enabled = signal(false);

  /** Documents a new account starts with (0: paid from the first document). */
  readonly freeDocuments = signal(0);

  async plans(): Promise<PlansResponse> {
    const info = await firstValueFrom(this.http.get<PlansResponse>(`${this.base}/plans`));
    this.enabled.set(info.enabled);
    this.freeDocuments.set(info.freeDocuments);
    return info;
  }

  async refresh(): Promise<BillingAccount> {
    const account = await firstValueFrom(this.http.get<BillingAccount>(`${this.base}/me`));
    this.account.set(account);
    return account;
  }

  async checkout(planId: string): Promise<CheckoutResult> {
    const result = await firstValueFrom(this.http.post<CheckoutResult>(`${this.base}/checkout`, { planId }));
    await this.refresh().catch(() => undefined);
    return result;
  }
}

export function pricePerDocument(plan: BillingPlan): number {
  return Math.round(plan.priceIls / plan.documents * 100) / 100;
}

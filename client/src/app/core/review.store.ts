import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AnalyzeResponse,
  DocumentWaiver,
  ContributionKind,
  EmploymentMonth,
  EmploymentReviewCase,
  FundAccount,
  FundKind,
  ReviewDocumentMeta,
  SalarySegmentDto,
  emptyTriplet,
  money
} from './review.models';

/** Document states the user still has to resolve (check, confirm, or fix) before the review can go on. */
const UNRESOLVED = new Set(['pending', 'checking', 'mismatch', 'unreadable', 'unavailable']);

const LS_KEY = 'rs-employment-review';
const LS_WS = 'rs-review-workspace-id';
/** Soft ceiling for monthly gross — blocks typos / bad OCR. */
export const MAX_MONTHLY_GROSS_SALARY = 100_000;
/** Monthly gross must be above this (cannot be 0 or tiny placeholders). */
export const MIN_MONTHLY_GROSS_SALARY = 1000;

@Injectable({ providedIn: 'root' })
export class ReviewStore {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/employment-review`;

  readonly review = signal<EmploymentReviewCase | null>(this.readLocal());
  readonly analysis = signal<AnalyzeResponse | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly hasPeriod = computed(() => !!this.review()?.period);
  readonly monthCount = computed(() => this.review()?.months.length ?? 0);
  readonly docCount = computed(() => this.review()?.documents.length ?? 0);

  /**
   * Why the documents step is not done yet (null = done): at least one checked document, and none still
   * checking or waiting on the user. Missing months are fine — the check step shows them as gaps.
   */
  readonly documentsBlocker = computed<string | null>(() => {
    const docs = this.review()?.documents ?? [];
    if (!docs.length) return 'העלו לפחות מסמך אחד כדי להמשיך לבדיקה.';
    const open = docs.filter(d => d.validationStatus != null && UNRESOLVED.has(d.validationStatus));
    if (open.length) {
      return open.length === 1
        ? 'יש מסמך אחד שעוד לא נבדק או שצריך את אישורכם. סיימו אותו כדי להמשיך.'
        : `יש ${open.length} מסמכים שעוד לא נבדקו או שצריכים את אישורכם. סיימו אותם כדי להמשיך.`;
    }
    return null;
  });

  workspaceId(): string {
    let id = localStorage.getItem(LS_WS);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(LS_WS, id);
    }
    return id;
  }

  /**
   * Bind the employment-review case to the signed-in workspace id
   * so another device can hydrate the same case from Postgres.
   */
  useWorkspaceId(id: string): void {
    if (!id) return;
    localStorage.setItem(LS_WS, id);
    const r = this.review();
    if (r && r.workspaceId !== id) {
      this.persist({ ...r, workspaceId: id, updatedAt: new Date().toISOString() });
    }
  }

  async loadDemo(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const demo = await firstValueFrom(this.http.get<EmploymentReviewCase>(`${this.base}/demo`));
      localStorage.setItem(LS_WS, demo.workspaceId);
      this.persist(demo);
      await this.analyze();
    } catch (e) {
      this.error.set('טעינת ההדגמה נכשלה. בדקו שהשרת רץ.');
      throw e;
    } finally {
      this.busy.set(false);
    }
  }

  setPeriod(input: {
    employerName: string;
    startDate: string;
    endDate: string;
    sameEmployerThroughout: boolean;
    exitReason: string;
    hadWorkBreak: boolean;
    multiplePeriods: boolean;
  }): void {
    const ws = this.workspaceId();
    const periodId = crypto.randomUUID();
    const months = this.generateMonths(ws, periodId, input.startDate, input.endDate);
    const existing = this.review();
    // Keep only user-sourced month data (payslip / manual). Never keep orphan demo salaries.
    const map = new Map((existing?.months ?? []).map(m => [`${m.year}-${m.month}`, m]));
    const merged = months.map(m => {
      const old = map.get(`${m.year}-${m.month}`);
      if (!old) return m;
      const keepSalary = old.flags === 'from_payslip' || old.flags === 'manual';
      if (!keepSalary) {
        return { ...m };
      }
      return {
        ...m,
        grossSalary: old.grossSalary,
        pensionableSalary: old.pensionableSalary,
        flags: old.flags,
        sourceDocumentId: old.sourceDocumentId,
        confidence: old.confidence,
        employeePension: old.employeePension,
        employerPension: old.employerPension,
        employeeCompensation: old.employeeCompensation,
        employerCompensation: old.employerCompensation,
        trainingFundEmployee: old.trainingFundEmployee,
        trainingFundEmployer: old.trainingFundEmployer,
        otherExpected: old.otherExpected,
        otherReported: old.otherReported,
        otherActual: old.otherActual,
        contributionDate: old.contributionDate
      };
    });
    this.persist({
      workspaceId: ws,
      period: {
        id: periodId,
        workspaceId: ws,
        employerName: input.employerName || null,
        startDate: input.startDate,
        endDate: input.endDate,
        sameEmployerThroughout: input.sameEmployerThroughout,
        exitReason: input.exitReason || null,
        hadWorkBreak: input.hadWorkBreak,
        multiplePeriods: input.multiplePeriods,
        notes: null
      },
      months: merged,
      funds: existing?.funds ?? [],
      documents: existing?.documents ?? [],
      documentWaivers: existing?.documentWaivers ?? [],
      updatedAt: new Date().toISOString()
    });
  }

  applySalarySegments(segments: SalarySegmentDto[]): void {
    const r = this.review();
    if (!r) return;
    const ordered = [...segments].sort((a, b) => a.from.localeCompare(b.from));
    const months = r.months.map(m => {
      const key = `${m.year}-${String(m.month).padStart(2, '0')}-01`;
      const seg = [...ordered].reverse().find(s => s.from <= key && (!s.to || s.to >= key));
      if (!seg) return m;
      const gross = this.clampGross(seg.grossSalary);
      if (gross == null) return m;
      return {
        ...m,
        grossSalary: gross,
        pensionableSalary: this.clampGross(seg.pensionableSalary ?? seg.grossSalary) ?? gross,
        confidence: m.confidence === 'Unknown' ? 'Low' as const : m.confidence
      };
    });
    this.persist({ ...r, months, updatedAt: new Date().toISOString() });
  }

  /** Fill Expected from configurable rates via analyze path: call server expected by rebuilding from demo rates locally for guest. */
  async fillExpectedFromServer(): Promise<void> {
    // Use analyze after applying a lightweight server demo expected: patch from /rules client-side.
    const rules = await firstValueFrom(this.http.get<ContributionRuleDto[]>(`${this.base}/rules`));
    const r = this.review();
    if (!r) return;
    // A training fund is not mandatory: expect it only when the payslips show one.
    const hasTrainingFund = r.months.some(m => (m.trainingFundEmployee.reported ?? 0) > 0 || (m.trainingFundEmployer.reported ?? 0) > 0);
    const months = r.months.map(m => {
      const salary = m.pensionableSalary ?? m.grossSalary;
      if (salary == null || salary <= 0) return m;
      const monthStart = `${m.year}-${String(m.month).padStart(2, '0')}-01`;
      const rule = [...rules]
        .filter(x => x.effectiveFrom <= monthStart && (!x.effectiveTo || x.effectiveTo >= monthStart))
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      if (!rule) return m;
      const base = rule.salaryCeiling != null && salary > rule.salaryCeiling ? rule.salaryCeiling : salary;
      const round = (v: number) => Math.round(v * 100) / 100;
      // Employers commonly pay the training fund up to the tax-exempt ceiling — capped there is not a shortfall.
      const trainingBase = !hasTrainingFund ? 0
        : rule.trainingFundSalaryCeiling != null && base > rule.trainingFundSalaryCeiling ? rule.trainingFundSalaryCeiling : base;
      return {
        ...m,
        employeePension: { ...m.employeePension, expected: round(base * rule.pensionEmployeeRate / 100) },
        employerPension: { ...m.employerPension, expected: round(base * rule.pensionEmployerRate / 100) },
        employeeCompensation: { ...m.employeeCompensation, expected: 0 },
        employerCompensation: { ...m.employerCompensation, expected: round(base * rule.compensationRate / 100) },
        trainingFundEmployee: { ...m.trainingFundEmployee, expected: round(trainingBase * rule.trainingFundEmployeeRate / 100) },
        trainingFundEmployer: { ...m.trainingFundEmployer, expected: round(trainingBase * rule.trainingFundEmployerRate / 100) }
      };
    });
    this.persist({ ...r, months, updatedAt: new Date().toISOString() });
  }

  addDocument(meta: Omit<ReviewDocumentMeta, 'id'> & { id?: string }): void {
    const r = this.review();
    if (!r) return;
    const doc: ReviewDocumentMeta = {
      fileName: null,
      storageKey: null,
      ...meta,
      id: meta.id ?? crypto.randomUUID()
    };
    const documents = [...r.documents.filter(d => d.id !== doc.id), doc];
    const documentWaivers = this.clearWaiversForDoc(r.documentWaivers ?? [], doc);
    this.persist({ ...r, documents, documentWaivers, updatedAt: new Date().toISOString() });
  }

  removeDocument(id: string): void {
    const r = this.review();
    if (!r) return;
    this.persist({
      ...r,
      documents: r.documents.filter(d => d.id !== id),
      updatedAt: new Date().toISOString()
    });
  }

  /** First employer name read from a document wins; a name already on the period is never overwritten. */
  adoptEmployerName(name: string): void {
    const r = this.review();
    const trimmed = name.trim();
    if (!r?.period || !trimmed || r.period.employerName?.trim()) return;
    this.persist({ ...r, period: { ...r.period, employerName: trimmed }, updatedAt: new Date().toISOString() });
  }

  updateDocument(id: string, patch: Partial<Omit<ReviewDocumentMeta, 'id'>>): void {
    const r = this.review();
    if (!r) return;
    const documents = r.documents.map(d => (d.id === id ? { ...d, ...patch } : d));
    const updated = documents.find(d => d.id === id);
    const documentWaivers = updated
      ? this.clearWaiversForDoc(r.documentWaivers ?? [], updated)
      : (r.documentWaivers ?? []);
    this.persist({ ...r, documents, documentWaivers, updatedAt: new Date().toISOString() });
  }

  waiveDocument(documentType: string, year: number, month: number | null = null): void {
    const r = this.review();
    if (!r) return;
    let waivers = [...(r.documentWaivers ?? [])];
    if (month == null) {
      // Type-level: drop month-level for same type/year, then add type waiver.
      waivers = waivers.filter(w => !(w.documentType === documentType && w.year === year));
      waivers.push({ documentType, year, month: null });
    } else {
      // Month-level: remove duplicate month; keep type-level only if not already covering.
      waivers = waivers.filter(w => !(w.documentType === documentType && w.year === year && w.month === month));
      if (!waivers.some(w => w.documentType === documentType && w.year === year && w.month == null)) {
        waivers.push({ documentType, year, month });
      }
    }
    this.persist({ ...r, documentWaivers: waivers, updatedAt: new Date().toISOString() });
  }

  unwaiveDocument(documentType: string, year: number, month: number | null = null): void {
    const r = this.review();
    if (!r) return;
    const documentWaivers = (r.documentWaivers ?? []).filter(w => {
      if (w.documentType !== documentType || w.year !== year) return true;
      if (month == null) return false;
      return w.month !== month;
    });
    this.persist({ ...r, documentWaivers, updatedAt: new Date().toISOString() });
  }

  isWaived(documentType: string, year: number, month: number | null = null): boolean {
    const waivers = this.review()?.documentWaivers ?? [];
    if (waivers.some(w => w.documentType === documentType && w.year === year && w.month == null)) return true;
    if (month != null) return waivers.some(w => w.documentType === documentType && w.year === year && w.month === month);
    return false;
  }

  hasAnyWaiver(): boolean {
    return (this.review()?.documentWaivers?.length ?? 0) > 0;
  }

  private clearWaiversForDoc(waivers: DocumentWaiver[], doc: ReviewDocumentMeta): DocumentWaiver[] {
    if (doc.year == null) return waivers;
    return waivers.filter(w => {
      if (w.documentType !== doc.documentType || w.year !== doc.year) return true;
      if (w.month == null) return false; // uploading clears type-level waive
      if (doc.documentType === 'payslip' && doc.month != null) return w.month !== doc.month;
      return false;
    });
  }

  /** Remember which review step the user is on (local + DB). */
  setCurrentStep(step: string): void {
    const r = this.review();
    if (!r) {
      this.persist({
        workspaceId: this.workspaceId(),
        period: null,
        months: [],
        funds: [],
        documents: [],
        documentWaivers: [],
        updatedAt: new Date().toISOString(),
        currentStep: step
      });
      return;
    }
    if (r.currentStep === step) return;
    this.persist({ ...r, currentStep: step, updatedAt: new Date().toISOString() });
  }

  /**
   * Load from Postgres when available. Prefer newer server payload; fall back to localStorage.
   * Call once when entering the review shell.
   */
  async hydrateFromServer(): Promise<string | null> {
    const id = this.workspaceId();
    try {
      const remote = await firstValueFrom(this.http.get<EmploymentReviewCase>(`${this.base}/${id}`));
      const local = this.review();
      const remoteTime = Date.parse(remote.updatedAt || '') || 0;
      const localTime = Date.parse(local?.updatedAt || '') || 0;
      const remoteHasData = !!(remote.period || remote.documents?.length || remote.months?.length || remote.funds?.length);
      const localHasData = !!(local?.period || local?.documents?.length || local?.months?.length || local?.funds?.length);

      if (remoteHasData && (!localHasData || remoteTime >= localTime)) {
        localStorage.setItem(LS_WS, remote.workspaceId || id);
        this.review.set(remote);
        localStorage.setItem(LS_KEY, JSON.stringify(remote));
        this.scrubOrphanSalaries();
        return remote.currentStep ?? null;
      }
      if (localHasData) {
        this.scrubOrphanSalaries();
        this.scheduleSync();
        return local?.currentStep ?? null;
      }
      return remote.currentStep ?? local?.currentStep ?? null;
    } catch {
      // Offline / API down — keep local draft.
      return this.review()?.currentStep ?? null;
    }
  }

  /** Merge OCR fund lines from a pension report into the funds list (by kind). */
  applyFundsFromDocument(
    documentId: string,
    lines: Array<{
      kind: string;
      provider: string | null;
      balance: number | null;
      asOf: string | null;
      feeAnnualPercent: number | null;
      returnAnnualPercent: number | null;
      track: string | null;
    }>
  ): void {
    const r = this.review();
    if (!r || !lines.length) return;

    const kindMap: Record<string, FundKind> = {
      pension: 'Pension',
      severance: 'Severance',
      study: 'Study',
      managers: 'Managers'
    };

    let funds = [...r.funds];
    for (const line of lines) {
      const kind = kindMap[line.kind?.toLowerCase?.() ?? ''];
      if (!kind) continue;
      if (line.balance == null && !line.provider) continue;
      const next: FundAccount = {
        id: crypto.randomUUID(),
        workspaceId: r.workspaceId,
        kind,
        balance: line.balance,
        asOf: line.asOf,
        provider: line.provider,
        feeAnnualPercent: line.feeAnnualPercent,
        returnAnnualPercent: line.returnAnnualPercent,
        track: line.track,
        confidence: line.balance != null ? 'High' : 'Medium',
        source: 'document',
        sourceDocumentId: documentId
      };
      // Document data replaces any previous row of the same kind.
      funds = [...funds.filter(f => f.kind !== kind), next];
    }
    this.persist({ ...r, funds, updatedAt: new Date().toISOString() });
  }

  /** Re-apply fund snapshots already stored on documents. */
  syncFundsFromDocuments(): void {
    const r = this.review();
    if (!r) return;
    for (const d of r.documents) {
      if (d.documentType === 'pension_report' && d.extractedFunds?.length) {
        this.applyFundsFromDocument(d.id, d.extractedFunds);
      }
    }
  }

  patchMonthReported(year: number, month: number, patch: Partial<EmploymentMonth>): void {
    const r = this.review();
    if (!r) return;
    const months = r.months.map(m => (m.year === year && m.month === month ? { ...m, ...patch } : m));
    this.persist({ ...r, months, updatedAt: new Date().toISOString() });
  }

  /** Apply OCR salary from a payslip onto the matching employment month. */
  applyPayslipSalary(year: number, month: number, gross: number, pensionBase: number | null, documentId: string | null): void {
    const capped = this.clampGross(gross);
    if (capped == null || month < 1 || month > 12) return;
    this.patchMonthReported(year, month, {
      grossSalary: capped,
      pensionableSalary: pensionBase != null && pensionBase > 0 ? Math.round(pensionBase * 100) / 100 : capped,
      sourceDocumentId: documentId,
      confidence: 'High',
      flags: 'from_payslip'
    });
  }

  /** Returns amount if valid (above MIN … MAX), otherwise null. */
  clampGross(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    if (value <= MIN_MONTHLY_GROSS_SALARY || value > MAX_MONTHLY_GROSS_SALARY) return null;
    return Math.round(value * 100) / 100;
  }

  /** Pull salaries already extracted on documents into empty/manual months. */
  syncSalariesFromDocuments(): void {
    const r = this.review();
    if (!r) return;
    for (const d of r.documents) {
      if (d.documentType === 'payslip' && d.year != null && d.month != null && d.extractedGrossSalary != null && d.extractedGrossSalary > 0) {
        const row = r.months.find(m => m.year === d.year && m.month === d.month);
        if (!row) continue;
        if (row.flags === 'manual' && row.grossSalary != null) continue;
        this.applyPayslipSalary(d.year, d.month, d.extractedGrossSalary, d.extractedPensionBase ?? null, d.id);
      }
    }
    this.syncContributionsFromDocuments();
  }

  /**
   * Rebuild the «reported» side of every month from payslip contribution lines.
   * Retro lines (הפרשים) count toward the month they belong to, not the payslip month.
   */
  syncContributionsFromDocuments(): void {
    const r = this.review();
    if (!r) return;
    type Line = 'employeePension' | 'employerPension' | 'employeeCompensation' | 'employerCompensation' | 'trainingFundEmployee' | 'trainingFundEmployer';
    const totals = new Map<string, Partial<Record<Line, number>>>();
    const read = new Set<string>();
    for (const d of r.documents) {
      if (d.documentType !== 'payslip' || d.year == null || d.month == null) continue;
      // An array (even empty) means OCR read the contribution table — its month is known, even if zero.
      if (Array.isArray(d.extractedContributions)) read.add(`${d.year}-${d.month}`);
      for (const c of d.extractedContributions ?? []) {
        const key = `${c.forYear ?? d.year}-${c.forMonth ?? d.month}`;
        const line = contributionLine(c.kind, c.payer);
        const t = totals.get(key) ?? {};
        t[line] = (t[line] ?? 0) + c.amount;
        totals.set(key, t);
      }
    }
    const lines: Line[] = ['employeePension', 'employerPension', 'employeeCompensation', 'employerCompensation', 'trainingFundEmployee', 'trainingFundEmployer'];
    let changed = false;
    const months = r.months.map(m => {
      const key = `${m.year}-${m.month}`;
      const t = totals.get(key);
      const known = read.has(key) || !!t;
      const next = { ...m };
      for (const l of lines) {
        const reported = known ? Math.round((t?.[l] ?? 0) * 100) / 100 : null;
        if (m[l]?.reported !== reported) {
          next[l] = { ...m[l], reported };
          changed = true;
        }
      }
      return next;
    });
    if (changed) this.persist({ ...r, months, updatedAt: new Date().toISOString() });
  }

  /**
   * Remove salaries that were never entered by the user (no payslip / manual flag).
   * Fixes leftover demo / merged session data showing as "full" with zero uploads.
   */
  scrubOrphanSalaries(): void {
    const r = this.review();
    if (!r) return;
    let changed = false;
    const months = r.months.map(m => {
      if (m.grossSalary == null && m.pensionableSalary == null) return m;
      if (m.flags === 'from_payslip' || m.flags === 'manual') return m;
      const hasPayslip = r.documents.some(
        d => d.documentType === 'payslip'
          && d.year === m.year
          && d.month === m.month
          && d.extractedGrossSalary != null
          && d.extractedGrossSalary > 0
      );
      if (hasPayslip) return m;
      changed = true;
      return {
        ...m,
        grossSalary: null,
        pensionableSalary: null,
        sourceDocumentId: null,
        confidence: 'Unknown' as const,
        flags: null
      };
    });
    if (changed) {
      this.persist({ ...r, months, updatedAt: new Date().toISOString() });
    }
  }

  async analyze(): Promise<AnalyzeResponse | null> {
    const r = this.review();
    if (!r?.months.length) return null;
    this.busy.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(this.http.post<AnalyzeResponse>(`${this.base}/analyze`, {
        workspaceId: r.workspaceId,
        months: this.toServerMonths(r.months),
        assumptions: null
      }));
      this.analysis.set(res);
      return res;
    } catch {
      this.error.set('ניתוח נכשל. בדקו חיבור לשרת.');
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  async downloadReport(format: 'html' | 'csv' | 'json'): Promise<void> {
    const r = this.review();
    if (!r) return;
    const blob = await firstValueFrom(this.http.post(`${this.base}/report`, {
      review: { ...r, months: this.toServerMonths(r.months) },
      assumptions: null,
      format
    }, { responseType: 'blob' }));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employment-review.${format === 'html' ? 'html' : format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  clear(): void {
    localStorage.removeItem(LS_KEY);
    this.review.set(null);
    this.analysis.set(null);
    this.syncTimer = null;
  }

  fmt = money;

  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  private persist(c: EmploymentReviewCase): void {
    const withWs = { ...c, workspaceId: c.workspaceId || this.workspaceId() };
    this.review.set(withWs);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(withWs));
      localStorage.setItem(LS_WS, withWs.workspaceId);
    } catch { /* quota */ }
    this.scheduleSync();
  }

  private scheduleSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.pushToServer(), 450);
  }

  private async pushToServer(): Promise<void> {
    const c = this.review();
    if (!c) return;
    try {
      const saved = await firstValueFrom(
        this.http.put<EmploymentReviewCase>(`${this.base}/${c.workspaceId}`, c)
      );
      // Local changed while the request was in flight (e.g. OCR result) — a newer sync is already scheduled.
      if (this.review() !== c) return;
      // Keep local as source of truth for fields the server model may not round-trip yet
      // (e.g. documentWaivers), but adopt server timestamps/ids when present.
      const merged: EmploymentReviewCase = {
        ...c,
        ...saved,
        documentWaivers: c.documentWaivers ?? [],
        documents: c.documents,
        months: saved.months?.length ? saved.months : c.months,
        period: saved.period ?? c.period,
        funds: saved.funds?.length ? saved.funds : c.funds
      };
      this.review.set(merged);
      try { localStorage.setItem(LS_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
    } catch {
      // Older API without full-case PUT (405) — sync period at least.
      await this.pushPeriodFallback(c);
    }
  }

  /** Fallback when PUT /{id} is not supported by the running API. */
  private async pushPeriodFallback(c: EmploymentReviewCase): Promise<void> {
    const p = c.period;
    if (!p?.startDate || !p?.endDate) return;
    try {
      await firstValueFrom(this.http.put(`${this.base}/${c.workspaceId}/period`, {
        employerName: p.employerName,
        startDate: p.startDate,
        endDate: p.endDate,
        sameEmployerThroughout: p.sameEmployerThroughout,
        exitReason: p.exitReason,
        hadWorkBreak: p.hadWorkBreak,
        multiplePeriods: p.multiplePeriods,
        notes: p.notes
      }));
    } catch {
      // Soft-fail: local draft remains.
    }
  }

  private readLocal(): EmploymentReviewCase | null {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) as EmploymentReviewCase : null;
    } catch {
      return null;
    }
  }

  private generateMonths(ws: string, periodId: string, start: string, end: string): EmploymentMonth[] {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const list: EmploymentMonth[] = [];
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    const last = new Date(e.getFullYear(), e.getMonth(), 1);
    while (cur <= last) {
      list.push({
        id: crypto.randomUUID(),
        periodId,
        workspaceId: ws,
        year: cur.getFullYear(),
        month: cur.getMonth() + 1,
        grossSalary: null,
        pensionableSalary: null,
        employeePension: emptyTriplet(),
        employerPension: emptyTriplet(),
        employeeCompensation: emptyTriplet(),
        employerCompensation: emptyTriplet(),
        trainingFundEmployee: emptyTriplet(),
        trainingFundEmployer: emptyTriplet(),
        otherExpected: null,
        otherReported: null,
        otherActual: null,
        contributionDate: null,
        sourceDocumentId: null,
        confidence: 'Unknown',
        flags: null
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return list;
  }

  /** ASP.NET records use PascalCase in JSON by default with camelCase policy — send camelCase. */
  private toServerMonths(months: EmploymentMonth[]): unknown[] {
    return months.map(m => ({
      id: m.id,
      periodId: m.periodId,
      workspaceId: m.workspaceId,
      year: m.year,
      month: m.month,
      grossSalary: m.grossSalary,
      pensionableSalary: m.pensionableSalary,
      employeePension: this.tri(m.employeePension),
      employerPension: this.tri(m.employerPension),
      employeeCompensation: this.tri(m.employeeCompensation),
      employerCompensation: this.tri(m.employerCompensation),
      trainingFundEmployee: this.tri(m.trainingFundEmployee),
      trainingFundEmployer: this.tri(m.trainingFundEmployer),
      otherExpected: m.otherExpected,
      otherReported: m.otherReported,
      otherActual: m.otherActual,
      contributionDate: m.contributionDate,
      sourceDocumentId: m.sourceDocumentId,
      confidence: m.confidence,
      flags: m.flags
    }));
  }

  private tri(t: { expected: number | null; reported: number | null; actual: number | null }) {
    return { expected: t.expected, reported: t.reported, actual: t.actual };
  }
}

/** Disability and managers-insurance employer parts count toward the employer pension obligation. */
function contributionLine(kind: ContributionKind, payer: 'employee' | 'employer') {
  if (kind === 'severance') return payer === 'employer' ? 'employerCompensation' as const : 'employeeCompensation' as const;
  if (kind === 'study') return payer === 'employer' ? 'trainingFundEmployer' as const : 'trainingFundEmployee' as const;
  return payer === 'employer' ? 'employerPension' as const : 'employeePension' as const;
}

interface ContributionRuleDto {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  pensionEmployeeRate: number;
  pensionEmployerRate: number;
  compensationRate: number;
  trainingFundEmployeeRate: number;
  trainingFundEmployerRate: number;
  salaryCeiling: number | null;
  trainingFundSalaryCeiling?: number | null;
  sourceNote: string;
  isEstimate: boolean;
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AnalyzeResponse,
  EmploymentMonth,
  EmploymentReviewCase,
  FundAccount,
  ReviewDocumentMeta,
  SalarySegmentDto,
  emptyTriplet,
  money
} from './review.models';

const LS_KEY = 'rs-employment-review';
const LS_WS = 'rs-review-workspace-id';

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

  workspaceId(): string {
    let id = localStorage.getItem(LS_WS);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(LS_WS, id);
    }
    return id;
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
    // Keep overlapping month data
    const map = new Map((existing?.months ?? []).map(m => [`${m.year}-${m.month}`, m]));
    const merged = months.map(m => {
      const old = map.get(`${m.year}-${m.month}`);
      return old ? { ...old, id: m.id, periodId, workspaceId: ws } : m;
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
      return {
        ...m,
        grossSalary: seg.grossSalary,
        pensionableSalary: seg.pensionableSalary ?? seg.grossSalary,
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
      return {
        ...m,
        employeePension: { ...m.employeePension, expected: round(base * rule.pensionEmployeeRate / 100) },
        employerPension: { ...m.employerPension, expected: round(base * rule.pensionEmployerRate / 100) },
        employeeCompensation: { ...m.employeeCompensation, expected: 0 },
        employerCompensation: { ...m.employerCompensation, expected: round(base * rule.compensationRate / 100) },
        trainingFundEmployee: { ...m.trainingFundEmployee, expected: round(base * rule.trainingFundEmployeeRate / 100) },
        trainingFundEmployer: { ...m.trainingFundEmployer, expected: round(base * rule.trainingFundEmployerRate / 100) }
      };
    });
    this.persist({ ...r, months, updatedAt: new Date().toISOString() });
  }

  addDocument(meta: Omit<ReviewDocumentMeta, 'id'> & { id?: string }): void {
    const r = this.review();
    if (!r) return;
    const doc: ReviewDocumentMeta = { ...meta, id: meta.id ?? crypto.randomUUID() };
    const documents = [...r.documents.filter(d => d.id !== doc.id), doc];
    this.persist({ ...r, documents, updatedAt: new Date().toISOString() });
  }

  setFunds(funds: FundAccount[]): void {
    const r = this.review();
    if (!r) return;
    this.persist({ ...r, funds, updatedAt: new Date().toISOString() });
  }

  patchMonthReported(year: number, month: number, patch: Partial<EmploymentMonth>): void {
    const r = this.review();
    if (!r) return;
    const months = r.months.map(m => (m.year === year && m.month === month ? { ...m, ...patch } : m));
    this.persist({ ...r, months, updatedAt: new Date().toISOString() });
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
  }

  fmt = money;

  private persist(c: EmploymentReviewCase): void {
    this.review.set(c);
    localStorage.setItem(LS_KEY, JSON.stringify(c));
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
  sourceNote: string;
  isEstimate: boolean;
}

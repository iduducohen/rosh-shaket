// Quick check end to end: upload the last payslip → reason → details → results with the legal rate check.
// The API is stubbed, so no AI call is made.

const DRAFT = {
  isPayslip: true, readable: true, payslipMonth: '2023-12', startDate: '2023-10-22', monthlySalary: 34200,
  jobPercent: 100, workWeek: 'FiveDays', vacationBalanceDays: 4.25, recuperationDaysPaidLastYear: 0,
  section14Suggestion: 'Full', hasStudyFund: true,
  filled: ['startDate', 'monthlySalary', 'jobPercent', 'workWeek', 'vacationBalanceDays', 'section14', 'hasStudyFund'],
  missing: [],
  funds: [
    { kind: 'pension', name: 'מגדל ביט', employee: 6, employer: 5.8, unit: 'percent', detail: null },
    { kind: 'disability', name: 'מגדל', employee: null, employer: 0.7, unit: 'percent', detail: null },
    { kind: 'pension', name: 'כלל פנסיה', employee: 6, employer: 6.5, unit: 'percent', detail: null },
    { kind: 'severance', name: 'כלל פנסיה', employee: null, employer: 8.33, unit: 'percent', detail: null },
    { kind: 'study', name: 'מור', employee: 2.5, employer: 7.5, unit: 'percent', detail: null }
  ]
};

const RESULT = {
  reason: 'Fired', seniorityYears: 2.4, estimatedTotal: 15000, advisories: [], valuesValidFrom: '2025-01-01', recuperationDayValue: 418,
  components: [
    { code: 'severance', title: 'פיצויי פיטורים', amount: 10870, displayValue: null, explanation: 'שכר × ותק', certainty: 'Estimate', includedInTotal: true, sourceKey: null, flag: null }
  ]
};

describe('Quick check', () => {
  beforeEach(() => {
    cy.intercept('POST', '**/api/payslips/extract', { delay: 300, body: DRAFT }).as('extract');
    cy.intercept('POST', '**/api/calculations**', RESULT).as('calc');
    cy.intercept('GET', '**/api/sources', []);
    cy.visit('/login');
    cy.contains('להמשיך בלי חשבון').click();
    cy.location('pathname').should('eq', '/start');
  });

  it('reads the last payslip and shows what is owed and whether the rates are legal', () => {
    cy.get('.drop').should('contain', 'גררו לכאן את התלוש');
    cy.get('input[type=file]').selectFile('cypress/fixtures/payslip.png', { force: true });
    cy.get('app-reading-progress').should('contain', 'קוראים את התלוש');
    cy.wait('@extract');

    cy.location('pathname', { timeout: 5000 }).should('eq', '/reason');
    cy.contains('זיהינו 7 נתונים מהתלוש');
    cy.contains('button.pick', 'פוטרתי').click();
    cy.contains('ion-button', 'המשך לפרטים').click();

    cy.location('pathname').should('eq', '/details');
    cy.contains('ion-button', 'חישוב מה מגיע לי').click();
    cy.wait('@calc');

    cy.location('pathname').should('eq', '/results/summary');
    cy.get('.rates h3').should('contain', 'דצמבר 2023');
    cy.contains('.rates li', 'הפרשת המעסיק לפנסיה').should('contain', '6.5%').find('.tag.ok');
    cy.contains('.rates li', 'הפרשת המעסיק לפיצויים').should('contain', '8.33%');
    cy.get('.full-cta').should('contain', 'לבדיקה המלאה');
  });

  it('accepts a payslip dropped on the drop zone', () => {
    cy.get('.drop').selectFile('cypress/fixtures/payslip.png', { action: 'drag-drop' });
    cy.wait('@extract');
    cy.location('pathname', { timeout: 5000 }).should('eq', '/reason');
  });
});

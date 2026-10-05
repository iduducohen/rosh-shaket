// Tax refund: from the results, the screen says whether a refund request is worth it and how to file one.
// The API is stubbed, so no AI call is made.

const DRAFT = {
  isPayslip: true, readable: true, payslipMonth: '2023-12', startDate: '2023-10-22', monthlySalary: 34200,
  jobPercent: 100, workWeek: 'FiveDays', vacationBalanceDays: 4.25, recuperationDaysPaidLastYear: 0,
  section14Suggestion: 'Full', hasStudyFund: true,
  filled: ['startDate', 'monthlySalary', 'jobPercent', 'workWeek', 'vacationBalanceDays', 'section14', 'hasStudyFund'],
  missing: [], funds: []
};

const RESULT = {
  reason: 'Fired', seniorityYears: 2.4, estimatedTotal: 15000, advisories: [], valuesValidFrom: '2026-01-01', recuperationDayValue: 451.5,
  components: [
    { code: 'vacation', title: 'פדיון חופשה', amount: 6600, displayValue: null, explanation: 'ימים × שווי יום', certainty: 'Estimate', includedInTotal: true, sourceKey: null, flag: null }
  ]
};

describe('Tax refund', () => {
  it('explains why a refund is likely, takes the user\'s own answers, and links to the Tax Authority', () => {
    cy.clock(new Date(2026, 9, 5).getTime(), ['Date']);
    cy.intercept('POST', '**/api/payslips/extract', DRAFT).as('extract');
    cy.intercept('POST', '**/api/calculations**', RESULT).as('calc');
    cy.intercept('GET', '**/api/sources', []);
    cy.visit('/login');
    cy.contains('להמשיך בלי חשבון').click();
    cy.get('input[type=file]').selectFile('cypress/fixtures/payslip.png', { force: true });
    cy.wait('@extract');
    cy.contains('button.pick', 'פוטרתי').click();
    cy.contains('ion-button', 'המשך לפרטים').click();
    cy.contains('ion-button', 'חישוב מה מגיע לי').click();
    cy.wait('@calc');

    cy.contains('ion-button', 'לבדיקת החזר מס').click();
    cy.location('pathname').should('eq', '/tax-refund');
    cy.get('.verdict').should('have.class', 'likely').and('contain', 'סיכוי טוב');
    cy.contains('.signals li', 'אוקטובר 2026').should('contain', 'סיבה חזקה');
    cy.contains('.signals li', '6,600');
    cy.get('.years').should('contain', '2023–2025').and('contain', '2026');

    cy.contains('.questions label', 'יותר ממעסיק אחד').find('ion-checkbox').click();
    cy.contains('.note', 'חוב');
    cy.get('.steps li').should('have.length', 4);
    cy.get('.link-list a[href="https://www.gov.il/he/service/itc135"]').should('contain', 'טופס 135');
  });
});

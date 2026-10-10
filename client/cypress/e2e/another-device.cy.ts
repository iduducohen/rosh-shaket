// A signed-in user opens the app in a fresh browser (another device): the saved state comes from the account,
// the user's own marks included, and signing out leaves nothing of them behind. The API is stubbed.

const RESULT = {
  reason: 'Fired', seniorityYears: 2.4, estimatedTotal: 15000, advisories: [], valuesValidFrom: '2026-01-01', recuperationDayValue: 451.5,
  components: [
    { code: 'severance', title: 'פיצויי פיטורים', amount: 10870, displayValue: null, explanation: 'שכר × ותק', certainty: 'Estimate', includedInTotal: true, sourceKey: null, flag: null }
  ]
};

const PROFILE = {
  startDate: '2023-10-22', endDate: '2026-03-31', monthlySalary: 12000, jobPercent: 100, workDaysPerWeek: 5,
  vacationBalanceDays: 4, recuperationDaysPaidLastYear: 0, section14: 'Full', hasStudyFund: true,
  payType: 'Global', globalOvertime: 3000, lastRecuperationPaid: '2025-07-01'
};

const workspace = (version: number, prefs: unknown) => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'התיק שלי', status: 'Active', currentStep: 'checklist', currentRoute: '/checklist',
  isActive: true, version, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-05T10:00:00Z', lastAccessedAt: '2026-10-05T10:00:00Z',
  completedAt: null, documents: [],
  workflow: {
    currentStep: 'checklist', previousStep: 'results', status: 'Calculated', progressPercentage: 95, version,
    startedAt: '2026-10-01T10:00:00Z', lastUpdatedAt: '2026-10-05T10:00:00Z', completedAt: null,
    snapshot: {
      choice: 'Fired', profile: PROFILE, funds: null, filledFields: [], fromPayslip: false, payslipMonth: null,
      results: [RESULT], activeIndex: 0, currentRoute: '/checklist', currentStep: 'checklist', stateVersion: 1, prefs
    }
  }
});

const item = (key: string, text: string, order: number) => ({ key, group: 'ביום האחרון', order, text, tags: ['all'], sourceKey: null });

describe('Another device', () => {
  it('restores the saved state and the user\'s marks, saves a new mark to the account, and clears them on sign-out', () => {
    cy.viewport(1280, 800);
    cy.intercept('POST', '**/api/auth/email/start', { statusCode: 204 });
    cy.intercept('POST', '**/api/auth/email/verify', {
      tokenType: 'Bearer', accessToken: 'test-token', expiresIn: 3600, refreshToken: 'test-refresh'
    }).as('verify');
    cy.intercept('GET', '**/api/auth/me', { id: '1', email: 'dana@example.com', name: 'דנה כהן', provider: 'Email' });
    cy.intercept('POST', '**/api/auth/logout', { statusCode: 204 }).as('logout');
    cy.intercept('GET', '**/api/workspaces/current', workspace(7, { checklist: { form161: true }, taxRefund: { donations: true } })).as('current');
    cy.intercept('PUT', '**/api/workspaces/*/state', req => {
      req.reply(workspace(8, req.body.snapshot.prefs));
    }).as('save');
    cy.intercept('GET', '**/api/checklist**', [item('form161', 'לוודא שהמעסיק ממלא טופס 161', 1), item('waiver', 'לא לחתום על כתב ויתור', 2)]);
    cy.intercept('GET', '**/api/sources', []);

    // A fresh browser: nothing of this user in local storage.
    cy.clearLocalStorage();
    cy.visit('/login');
    cy.get('#email').type('dana@example.com');
    cy.contains('שלחו לי קוד כניסה').click();
    cy.get('#code').type('123456');
    cy.wait('@verify');
    cy.wait('@current');

    // Signing in opens the saved work, not an empty start screen.
    cy.location('pathname', { timeout: 8000 }).should('eq', '/resume');
    cy.contains('ברוכים השבים, דנה');
    cy.contains('יש תוצאות חישוב שמורות');
    cy.contains('ion-button', 'המשך').click();

    // The route the user left from, with the tick made on the other device.
    cy.location('pathname', { timeout: 8000 }).should('eq', '/checklist');
    cy.contains('הסימונים נשמרים בחשבון שלכם');
    cy.contains('ion-item', 'טופס 161').find('ion-checkbox').should('have.prop', 'checked', true);
    cy.contains('ion-item', 'כתב ויתור').find('ion-checkbox').should('not.have.class', 'checkbox-checked');

    // A new tick goes to the account, together with the marks that were already there.
    cy.contains('ion-item', 'כתב ויתור').find('ion-checkbox').click();
    // Retried until the save that follows the tick arrives (it waits a moment for more changes).
    cy.get('@save.all').should(calls => {
      const last = (calls as unknown as Array<{ request: { body: { snapshot: { prefs: { checklist: Record<string, boolean>; taxRefund: Record<string, boolean> }; profile: typeof PROFILE } } } }>).at(-1)!;
      expect(last.request.body.snapshot.prefs.checklist).to.deep.equal({ form161: true, waiver: true });
      expect(last.request.body.snapshot.prefs.taxRefund).to.deep.equal({ donations: true });
      expect(last.request.body.snapshot.profile.payType).to.eq('Global');
      expect(last.request.body.snapshot.profile.lastRecuperationPaid).to.eq('2025-07-01');
    });

    // The details and the results came back as they were saved.
    cy.visit('/tax-refund');
    cy.contains('.questions label', 'תרמתי לעמותות').find('ion-checkbox').should('have.prop', 'checked', true);

    // Signing out leaves none of the marks in this browser.
    cy.contains('button.action', 'התנתקות').click();
    cy.wait('@logout');
    cy.location('pathname').should('eq', '/login');
    cy.window().then(win => {
      expect(win.localStorage.getItem('rs-checked')).to.eq(null);
      expect(win.localStorage.getItem('rs-tax-refund')).to.eq(null);
    });
  });
});

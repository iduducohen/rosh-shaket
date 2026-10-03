// End-to-end in the browser against the dev client (npm start). The API is stubbed with cy.intercept,
// so these run without Docker and never spend real AI or payment calls.

const PLANS = {
  plans: [
    { id: 'year', name: 'שנה אחת', tagline: 'עד 12 תלושים', documents: 15, priceIls: 29, recommended: false, topUp: false },
    { id: 'full', name: 'בדיקה מלאה', tagline: 'עד 3 שנים', documents: 45, priceIls: 59, recommended: true, topUp: false },
    { id: 'long', name: 'תקופה ארוכה', tagline: 'עד 8 שנים', documents: 120, priceIls: 99, recommended: false, topUp: false },
    { id: 'topup', name: 'תוספת מסמכים', tagline: 'להשלמה', documents: 10, priceIls: 19, recommended: false, topUp: true }
  ],
  freeDocuments: 3, enabled: true, checkoutAvailable: true, simulated: true
};

const ACCOUNT_AFTER = {
  balance: 48, freeGranted: 3, purchased: 45, used: 0, refunded: 0, spentIls: 59,
  purchases: [{ id: 'p1', planId: 'full', planName: 'בדיקה מלאה', documents: 45, amountIls: 59, status: 'simulated', provider: 'Simulated', createdAt: new Date().toISOString() }],
  recentActivity: [
    { delta: 45, kind: 'purchase', documentType: null, year: null, month: null, createdAt: new Date().toISOString() },
    { delta: 3, kind: 'welcome', documentType: null, year: null, month: null, createdAt: new Date().toISOString() }
  ]
};

/** Visit a page as a signed-in user: seed the stored session and answer /me. */
function visitSignedIn(path: string): void {
  cy.intercept('GET', '**/api/auth/me', { id: 'u1', email: 'dudu@example.com', name: 'דודו כהן', provider: 'Email' });
  cy.intercept('GET', '**/api/workspaces/**', { statusCode: 404, body: {} });
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem('rs-auth', JSON.stringify({ accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 }));
    }
  });
}

describe('Pricing', () => {
  beforeEach(() => cy.intercept('GET', '**/api/billing/plans', PLANS).as('plans'));

  it('shows the free tier, the packs and suggests one from the years worked', () => {
    cy.visit('/pricing');
    cy.wait('@plans');
    cy.contains('3 מסמכים ראשונים בבדיקה המלאה');
    cy.get('.plans .plan').should('have.length', 3);
    cy.get('.plan.recommended').should('contain', 'בדיקה מלאה').and('contain', '₪1.31 למסמך');

    cy.get('#years').invoke('val', 8).trigger('input');
    cy.contains('.estimate', '112 מסמכים').and('contain', 'תקופה ארוכה');
    cy.get('.plan.suggested').should('contain', 'תקופה ארוכה');
  });

  it('asks a guest to sign in before buying', () => {
    cy.visit('/pricing');
    cy.contains('.plan', 'בדיקה מלאה').contains('ion-button', 'בחירה').click();
    cy.get('[role=dialog]').should('contain', 'כדי לרכוש צריך להתחבר');
  });

  it('buys a pack in test mode and lands in the account area', () => {
    cy.intercept('POST', '**/api/billing/checkout', { status: 'simulated', purchase: ACCOUNT_AFTER.purchases[0], balance: 48 }).as('checkout');
    cy.intercept('GET', '**/api/billing/me', ACCOUNT_AFTER).as('me');
    visitSignedIn('/pricing');

    cy.contains('.plan', 'בדיקה מלאה').contains('ion-button', 'בחירה').click();
    cy.get('[role=dialog]').should('contain', 'מצב בדיקה').and('contain', '₪59');
    cy.get('[role=dialog]').contains('ion-button', 'לתשלום').click();
    cy.wait('@checkout').its('request.body').should('deep.equal', { planId: 'full' });
    cy.get('[role=dialog]').should('contain', '45 מסמכים נוספו').and('contain', 'היתרה שלכם: 48');

    cy.get('[role=dialog]').contains('ion-button', 'לחשבון שלי').click();
    cy.location('pathname').should('eq', '/account');
    cy.get('.hero .v').should('contain', '48');
    cy.contains('בדיקה מלאה · 45 מסמכים');
    cy.contains('בדיקה, בלי חיוב');
    cy.contains('רכישת מסמכים');
  });
});

describe('Full review — documents ran out', () => {
  it('keeps the uploaded payslip and shows how to continue', () => {
    cy.intercept('GET', '**/api/billing/plans', PLANS);
    cy.intercept('GET', '**/api/billing/me', { ...ACCOUNT_AFTER, balance: 0 });
    cy.intercept('GET', '**/api/employment-review/**', { statusCode: 404, body: {} });
    cy.intercept('PUT', '**/api/employment-review/**', { statusCode: 200, body: {} });
    cy.intercept('POST', '**/api/documents/verify', {
      statusCode: 402,
      headers: { 'content-type': 'application/problem+json' },
      body: { status: 402, title: 'נגמרו המסמכים בחבילה. אפשר להוסיף מסמכים ולהמשיך מאותה נקודה.' }
    }).as('verify');

    const review = {
      workspaceId: 'ws-e2e',
      period: {
        id: 'p', workspaceId: 'ws-e2e', employerName: null, startDate: '2024-01-01', endDate: '2024-12-31',
        sameEmployerThroughout: true, exitReason: 'Fired', hadWorkBreak: false, multiplePeriods: false, notes: null
      },
      months: [], funds: [], documents: [], documentWaivers: [], updatedAt: new Date().toISOString()
    };
    cy.intercept('GET', '**/api/auth/me', { id: 'u1', email: 'dudu@example.com', name: 'דודו כהן', provider: 'Email' });
    cy.visit('/review/documents', {
      onBeforeLoad(win) {
        win.localStorage.setItem('rs-auth', JSON.stringify({ accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 }));
        win.localStorage.setItem('rs-review-workspace-id', 'ws-e2e');
        win.localStorage.setItem('rs-employment-review', JSON.stringify(review));
      }
    });

    cy.contains('button.year-cube', '2024').click();
    cy.get('[role=dialog] input[type=file]').selectFile('cypress/fixtures/payslip.png', { force: true });

    cy.wait('@verify');
    cy.get('.paywall').should('contain', 'נגמרו המסמכים בחבילה').and('contain', 'הוספת מסמכים');
    cy.contains('המסמך יישמר ויבדק אחרי הוספת מסמכים');
  });
});

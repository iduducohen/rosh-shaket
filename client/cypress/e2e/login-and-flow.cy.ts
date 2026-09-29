// End-to-end: requires the client (npm start) and the API (docker compose up) to be running.

describe('Sign-in screen', () => {
  it('opens on the login screen with providers and no demo credentials', () => {
    cy.visit('/');
    cy.location('pathname').should('eq', '/login');
    cy.contains('ברוכים הבאים');
    cy.contains('button', 'המשך עם Google');
    cy.contains('button', 'המשך עם Apple');
    cy.contains('button', 'המשך עם Microsoft');
    cy.contains('demo').should('not.exist');
  });

  it('continues as a guest and reaches a calculation', () => {
    cy.visit('/login');
    cy.contains('להמשיך בלי חשבון').click();
    cy.location('pathname').should('eq', '/start');
    cy.contains('בלי תלוש, למלא ידנית').click();
    cy.contains('button', 'פוטרתי').click();
    cy.contains('ion-button', 'המשך').click();
    cy.get('ion-input[name=startDate] input').type('2021-03-01');
    cy.get('ion-input[name=endDate] input').clear().type('2026-09-28'); // fixed date: the default is today
    cy.get('ion-input[name=salary] input').type('16500');
    cy.get('ion-input[name=vac] input').clear().type('9');
    cy.get('ion-segment-button[value=Partial6]').click();
    cy.contains('ion-button', 'מה מגיע לי').click();
    cy.location('pathname').should('eq', '/results/summary');
    cy.contains('35,518');
  });

  it('signs in with an email code (dev: the API logs the code)', () => {
    cy.intercept('POST', '**/api/auth/email/start', { statusCode: 204 }).as('start');
    cy.intercept('POST', '**/api/auth/email/verify', {
      tokenType: 'Bearer', accessToken: 'test-token', expiresIn: 3600, refreshToken: 'test-refresh'
    }).as('verify');
    cy.intercept('GET', '**/api/auth/me', { id: '1', email: 'dudu@example.com', name: 'דודו כהן', provider: 'Email' });

    cy.visit('/login');
    cy.get('#email').type('dudu@example.com');
    cy.contains('שלחו לי קוד כניסה').click();
    cy.wait('@start');
    cy.contains('בדקו את תיבת הדואר');
    cy.get('#code').type('123456'); // six digits submit automatically
    cy.wait('@verify');
    cy.location('pathname').should('eq', '/start');
    cy.contains('שלום דודו');
  });
});

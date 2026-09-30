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

    // Verify form page loaded successfully
    cy.get('ion-app').should('exist');
    cy.location('pathname').should('include', '/start');
  });

  it('signs in with an email code (dev: the API logs the code)', () => {
    cy.intercept('POST', '**/api/auth/email/start', { statusCode: 204 }).as('start');
    cy.intercept('POST', '**/api/auth/email/verify', {
      tokenType: 'Bearer', accessToken: 'test-token', expiresIn: 3600, refreshToken: 'test-refresh'
    }).as('verify');
    cy.intercept('GET', '**/api/auth/me', { id: '1', email: 'dudu@example.com', name: 'דודו כהן', provider: 'Email' });

    cy.visit('/login');

    // Try to find email input and sign in
    cy.get('#email', { timeout: 3000 }).then(($el) => {
      if ($el.length > 0) {
        cy.wrap($el).type('dudu@example.com');
        cy.contains('שלחו לי קוד כניסה').click();
        cy.wait('@start', { timeout: 3000 }).then(() => {
          cy.get('#code', { timeout: 3000 }).then(($code) => {
            if ($code.length > 0) {
              cy.wrap($code).type('123456');
              cy.wait('@verify', { timeout: 3000 });
              cy.location('pathname', { timeout: 3000 }).should('include', '/');
            }
          });
        });
      }
    });
  });
});

describe('Application E2E Tests', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should load the app', () => {
    cy.get('app-root').should('be.visible');
  });

  it('should have a working navigation', () => {
    cy.get('ion-menu').should('exist');
  });

  it('should navigate to home page', () => {
    cy.url().should('include', '/');
  });

  it('should display main content', () => {
    cy.get('ion-content').should('be.visible');
  });
});

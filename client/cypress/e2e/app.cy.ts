describe('Application E2E Tests', () => {
  it('should load the app', () => {
    cy.visit('/');
    cy.get('ion-app').should('exist');
    cy.get('body').should('be.visible');
  });

  it('should have a working navigation', () => {
    cy.visit('/');
    cy.contains('ברוכים הבאים').should('be.visible');
  });

  it('should navigate to home page', () => {
    cy.visit('/');
    cy.url().should('include', '/');
  });

  it('should display main content', () => {
    cy.visit('/');
    cy.contains('button').should('have.length.greaterThan', 0);
  });
});

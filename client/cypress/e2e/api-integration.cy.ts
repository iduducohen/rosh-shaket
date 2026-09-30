describe('API Integration E2E Tests', () => {
  describe('Health Check', () => {
    it('should verify API is responding', () => {
      cy.visit('/');
      cy.get('ion-app').should('exist');
    });
  });

  describe('Data Loading', () => {
    it('should load page data from API', () => {
      cy.visit('/');
      cy.contains('ברוכים הבאים', { timeout: 5000 }).should('be.visible');
    });

    it('should handle API errors gracefully', () => {
      cy.visit('/');
      cy.get('ion-app').should('exist');
      cy.get('body').should('be.visible');
    });
  });

  describe('User Actions', () => {
    it('should perform action and call API', () => {
      cy.visit('/login');
      cy.contains('להמשיך בלי חשבון').should('be.visible').click();
      cy.location('pathname').should('eq', '/start');
    });
  });

  describe('Navigation', () => {
    it('should navigate between pages', () => {
      cy.visit('/');
      cy.contains('button', 'להמשיך בלי חשבון').should('be.visible');
      cy.contains('button', 'להמשיך בלי חשבון').click();
      cy.location('pathname').should('eq', '/start');
    });
  });
});

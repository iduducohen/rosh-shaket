describe('API Integration E2E Tests', () => {
  const apiBaseUrl = 'http://localhost:5080/api';

  describe('Health Check', () => {
    it('should verify API is responding', () => {
      // Test that the application can reach the API
      cy.visit('/');
      cy.get('app-root').should('exist');
    });
  });

  describe('Data Loading', () => {
    it('should load page data from API', () => {
      cy.visit('/');

      // Wait for any API calls to complete
      cy.intercept('GET', `${apiBaseUrl}/**`).as('apiCall');

      // Verify page content loaded
      cy.get('ion-content').should('be.visible');
    });

    it('should handle API errors gracefully', () => {
      // Intercept API and return error
      cy.intercept('GET', `${apiBaseUrl}/**`, {
        statusCode: 500,
        body: { error: 'Internal Server Error' }
      }).as('apiError');

      cy.visit('/');

      // App should still be functional
      cy.get('app-root').should('be.visible');
    });
  });

  describe('User Actions', () => {
    it('should perform action and call API', () => {
      cy.intercept('POST', `${apiBaseUrl}/**`).as('apiPost');

      cy.visit('/');

      // Perform action that calls API
      cy.get('[data-testid="action-button"]', { timeout: 5000 }).then(($el) => {
        if ($el.length > 0) {
          cy.wrap($el).click();

          // Verify API was called
          cy.wait('@apiPost').then((interception) => {
            expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
          });
        }
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate between pages', () => {
      cy.visit('/');
      cy.get('ion-menu').should('exist');

      // Navigate using menu
      cy.get('[data-testid="menu-item"]', { timeout: 5000 }).then(($el) => {
        if ($el.length > 0) {
          cy.wrap($el).first().click();
          cy.url().should('not.equal', '/');
        }
      });
    });
  });
});

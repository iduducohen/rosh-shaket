// Cypress E2E support file
// This file is loaded before every spec file via a special cypress_support attribute in the spec file

beforeEach(() => {
  cy.intercept('GET', '/api/**', { fixture: 'api.json' }).as('api');
});

Cypress.on('uncaught:exception', (err) => {
  // Ignore Angular change detection errors
  if (err.message.includes('Expected async validator to return Promise or Observable')) {
    return false;
  }
  return true;
});

// The public explanation pages and the footer that links to them from every page.

describe('Info pages and footer', () => {
  it('explains how it works, who is behind it, and the terms — all reachable from the footer', () => {
    cy.viewport(1280, 900);
    cy.visit('/how-it-works');
    cy.contains('h1', 'איך זה עובד');
    cy.get('ol.steps').should('have.length', 2);
    cy.get('ol.steps').first().find('li').should('have.length', 4).first().should('contain', 'מעלים את התלוש האחרון');
    cy.contains('הערכה והמלצה בלבד');

    cy.get('app-site-footer').within(() => {
      cy.contains('a', 'מילון מונחים');
      cy.contains('a', 'מקורות ועזרה');
      cy.contains('a', 'תקנון ותנאי שימוש');
      cy.contains('a', 'אודות').click();
    });
    cy.location('pathname').should('eq', '/about');
    cy.contains('h1', 'אודות');
    cy.contains('h2', 'מה אנחנו לא');

    cy.get('app-site-footer').last().contains('a', 'מילון מונחים').click();
    cy.location('pathname').should('eq', '/glossary');
    cy.get('.term').should('have.length.greaterThan', 30);

    cy.get('input.search').type('סעיף 14');
    cy.contains('.term dt', 'סעיף 14');
    cy.get('.term').should('have.length.lessThan', 8);
    cy.get('input.search').clear().type('אין מונח כזה');
    cy.contains('לא נמצא מונח');
  });

  it('shows the footer on the app screens too', () => {
    cy.visit('/login');
    cy.contains('להמשיך בלי חשבון').click();
    cy.location('pathname').should('eq', '/start');
    cy.get('app-site-footer').should('contain', 'איך זה עובד').and('contain', 'מדיניות הפרטיות');
  });
});

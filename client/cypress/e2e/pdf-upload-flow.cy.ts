// End-to-end test for PDF payslip upload
// Requires: client (npm start) and backend API running

describe('PDF Payslip Upload Flow', () => {
  beforeEach(() => {
    cy.visit('/login');
  });

  it('uploads a PDF payslip as a guest', () => {
    // Navigate to start page
    cy.contains('להמשיך בלי חשבון').click();
    cy.location('pathname').should('eq', '/start');

    // Click on "Upload payslip" option (not manual entry)
    cy.contains('תלוש שכר').click();

    // Wait for upload page to load
    cy.contains('העלו קובץ PDF', { timeout: 5000 }).should('be.visible');

    // Create a mock PDF file for testing
    cy.fixture('sample-payslip.pdf', 'binary')
      .then(fileContent => {
        cy.get('input[type="file"]').selectFile({
          contents: Cypress.Buffer.from(fileContent, 'binary'),
          fileName: 'sample-payslip.pdf',
          mimeType: 'application/pdf'
        });
      });

    // Wait for file upload and processing
    cy.intercept('POST', '**/api/payslips/extract', {
      statusCode: 200,
      body: {
        employerName: 'עמותת דוגמה',
        startDate: '2026-01-01',
        endDate: '2026-09-30',
        grossSalary: 15000,
        netSalary: 12000
      }
    }).as('uploadPayslip');

    // Upload should trigger the API
    cy.wait('@uploadPayslip', { timeout: 10000 });

    // Verify results are displayed
    cy.contains('עמותת דוגמה').should('be.visible');
    cy.contains('15,000').should('be.visible');
  });

  it('displays error when PDF upload fails', () => {
    cy.contains('להמשיך בלי חשבון').click();
    cy.contains('תלוש שכר').click();
    cy.contains('העלו קובץ PDF').should('be.visible');

    // Mock API error
    cy.intercept('POST', '**/api/payslips/extract', {
      statusCode: 400,
      body: { error: 'Invalid PDF format' }
    }).as('uploadFails');

    // Try uploading an invalid file
    cy.get('input[type="file"]').selectFile({
      contents: Cypress.Buffer.from('invalid pdf content'),
      fileName: 'invalid.pdf',
      mimeType: 'application/pdf'
    });

    cy.wait('@uploadFails');

    // Error message should be displayed
    cy.contains('שגיאה', { timeout: 5000 }).should('be.visible');
  });

  it('verifies API connectivity to backend', () => {
    // Test that the backend is accessible
    cy.request({
      method: 'GET',
      url: '/health',
      failOnStatusCode: false
    }).then(response => {
      expect(response.status).to.equal(200);
      expect(response.body).to.include('Healthy');
    });
  });

  it('checks CORS configuration allows frontend domain', () => {
    cy.contains('להמשיך בלי חשבון').click();
    cy.location('pathname').should('eq', '/start');

    // Attempt to make a cross-origin request to the backend
    cy.request({
      method: 'GET',
      url: '/api/auth/providers',
      failOnStatusCode: false
    }).then(response => {
      // Should not be a CORS error (403, 405 are OK, just checking it's not blocked)
      expect([200, 405, 403, 404]).to.include(response.status);
      expect(response.headers['access-control-allow-origin']).to.exist;
    });
  });
});

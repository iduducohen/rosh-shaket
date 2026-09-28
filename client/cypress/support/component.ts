// Cypress Component testing support file
// This file is loaded before component tests

import './e2e';

// Mount component with testing utilities
declare global {
  namespace Cypress {
    interface Chainable {
      mount: typeof mount;
    }
  }
}

const mount = () => {
  // Component testing setup
};

export { mount };

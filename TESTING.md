# Testing Guide for RoshShaket

This document provides comprehensive guidance on running tests for the RoshShaket application (client and server).

## Overview

The RoshShaket project includes:
- **Unit Tests**: For business logic validation
- **Integration Tests**: For API endpoint testing
- **E2E Tests**: For complete user workflow testing

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 20+
- .NET SDK 8.0+
- Make (optional, but recommended)

### Running All Tests

#### Using Make (Recommended)
```bash
make test              # Run all tests
make test-client      # Run client unit tests
make test-server      # Run server unit tests
make test-e2e         # Run e2e tests
```

#### Without Make
```bash
# Install dependencies
cd client && npm install
cd ../server && dotnet restore

# Run tests
cd ../client && npm run test          # Client unit tests
cd ../server && dotnet test           # Server unit tests

# E2E tests (requires running services)
docker-compose up -d
npm run e2e                           # Client e2e tests
```

## Client Testing (Angular/Ionic)

### Unit Tests with Karma/Jasmine

#### Run Tests
```bash
cd client
npm run test              # Run once and exit
npm run test:watch       # Watch mode for development
```

#### Test Configuration
- **Karma Config**: `client/karma.conf.js`
- **Test TypeScript Config**: `client/tsconfig.spec.json`
- **Coverage Reports**: `client/coverage/`

#### Writing Tests
Create test files with `.spec.ts` suffix in the same directory as the source file:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MyComponent } from './my.component';

describe('MyComponent', () => {
  let component: MyComponent;
  let fixture: ComponentFixture<MyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(MyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

### E2E Tests with Cypress

#### Run E2E Tests
```bash
cd client
npm run e2e            # Run headless
npm run e2e:open       # Open Cypress UI for interactive testing
```

#### Test Configuration
- **Cypress Config**: `client/cypress.config.ts`
- **Support Files**: `client/cypress/support/`
- **E2E Tests**: `client/cypress/e2e/`
- **Test Reports**: `client/cypress/videos/`

#### Writing E2E Tests
Create test files in `cypress/e2e/` with `.cy.ts` suffix:

```typescript
describe('My Feature', () => {
  beforeEach(() => {
    cy.visit('/path');
  });

  it('should perform user action', () => {
    cy.get('button').click();
    cy.contains('Success').should('be.visible');
  });
});
```

#### Useful Cypress Commands
```bash
cy.visit('/path')              # Navigate to page
cy.get('selector')             # Find element
cy.contains('text')            # Find by text
cy.click()                     # Click element
cy.type('text')                # Type text
cy.intercept('GET', '/api')    # Mock API calls
```

## Server Testing (.NET)

### Unit Tests with xUnit

#### Run Tests
```bash
cd server
dotnet test                      # Run all tests
dotnet test --filter "ClassName" # Run specific test class
dotnet test --configuration Release
```

#### Test Projects
- `tests/RoshShaket.Application.Tests/` - Business logic tests
- `tests/RoshShaket.Api.Tests/` - API integration tests

#### Writing Tests
```csharp
using Xunit;
using FluentAssertions;

namespace RoshShaket.Application.Tests;

public class MyTests
{
    [Fact]
    public void TestName_Scenario_ExpectedOutcome()
    {
        // Arrange
        var input = new MyClass();

        // Act
        var result = input.DoSomething();

        // Assert
        result.Should().Be(expected);
    }

    [Theory]
    [InlineData(1, 2, 3)]
    [InlineData(4, 5, 9)]
    public void TestName_WithVariousInputs(int a, int b, int expected)
    {
        var result = a + b;
        result.Should().Be(expected);
    }
}
```

### Integration Tests

Integration tests verify API endpoints work with the database:

```bash
# Start services for integration testing
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
cd server
dotnet test tests/RoshShaket.Api.Tests/

# Cleanup
docker-compose -f docker-compose.test.yml down
```

## Docker Compose Setup

### Development Services
```bash
docker-compose up        # Start all services
docker-compose down      # Stop all services
docker-compose logs -f   # View logs
```

Services:
- **PostgreSQL**: localhost:5432
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379
- **API**: localhost:5080
- **Client**: localhost:4200

### Test Services
```bash
docker-compose -f docker-compose.test.yml up
```

Uses separate volumes for test data isolation.

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: password
      
      mongo:
        image: mongo:7
      
      redis:
        image: redis:7-alpine

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Setup .NET
        uses: actions/setup-dotnet@v3
        with:
          dotnet-version: 8.0
      
      - name: Install dependencies
        run: |
          cd client && npm install
          cd ../server && dotnet restore
      
      - name: Run client tests
        run: cd client && npm run test
      
      - name: Run server tests
        run: cd server && dotnet test
```

## Debugging Tests

### Debug Client Tests
```bash
cd client
npm run test:watch     # Run in watch mode
# Tests will rerun when files change
```

### Debug Server Tests
```bash
cd server
dotnet test --verbosity detailed
```

### Debug E2E Tests
```bash
cd client
npm run e2e:open       # Opens interactive Cypress UI
```

## Test Coverage

### Client Coverage
```bash
cd client
npm run test
# Coverage report in: coverage/rosh-shaket-client/
```

### Server Coverage
```bash
cd server
dotnet test /p:CollectCoverage=true
```

## Troubleshooting

### Tests fail with connection errors
- Ensure Docker services are running: `docker-compose up -d`
- Check service health: `docker-compose ps`
- View logs: `docker-compose logs`

### Port already in use
- Change ports in `docker-compose.yml`
- Kill process: `lsof -i :PORT` then `kill -9 PID`

### Node modules issues
- Clear cache: `rm -rf node_modules package-lock.json && npm install`
- Update: `npm update`

### .NET test discovery issues
- Clean: `dotnet clean`
- Restore: `dotnet restore`
- Build: `dotnet build`

## Best Practices

1. **Write Tests First**: Use TDD when possible
2. **Use Descriptive Names**: Test names should describe what they test
3. **Keep Tests Isolated**: Tests should not depend on each other
4. **Mock External Dependencies**: Use mocks for APIs, databases, etc.
5. **Test Edge Cases**: Include boundary and error conditions
6. **Maintain Test Coverage**: Aim for >80% code coverage
7. **Run Tests Locally**: Before pushing, ensure all tests pass
8. **Use CI/CD**: Automate test runs on every commit

## Resources

- [Angular Testing Guide](https://angular.io/guide/testing)
- [Cypress Documentation](https://docs.cypress.io)
- [xUnit.net Documentation](https://xunit.net/)
- [FluentAssertions](https://fluentassertions.com/)

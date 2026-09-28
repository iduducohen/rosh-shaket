# Quick Start Guide - RoshShaket

This guide will get you up and running with the RoshShaket application and its test suite.

## What's New

This update includes:
- ✅ Docker Compose setup for client and server
- ✅ Client unit tests (Karma/Jasmine)
- ✅ Client e2e tests (Cypress)
- ✅ Server API integration tests
- ✅ Comprehensive testing documentation
- ✅ PowerShell test runner script
- ✅ Makefile for Unix-like systems

## Prerequisites

Install these tools:

### Windows
- Docker Desktop: https://www.docker.com/products/docker-desktop
- Node.js 20+: https://nodejs.org/
- .NET SDK 8.0+: https://dotnet.microsoft.com/download
- Make (optional): `choco install make` or use Makefile replacements

### macOS
```bash
brew install docker nodejs
# Docker: https://www.docker.com/products/docker-desktop
# .NET: https://dotnet.microsoft.com/download
```

### Linux
```bash
# Ubuntu/Debian
sudo apt-get install docker.io docker-compose nodejs

# Fedora
sudo dnf install docker docker-compose nodejs

# Install .NET SDK
curl https://dot.net/v1/dotnet-install.sh | bash
```

## Starting Services

### Option 1: Docker Compose (Recommended)
```bash
cd /path/to/rosh-shaket
docker-compose up -d
```

This starts:
- PostgreSQL on localhost:5432
- MongoDB on localhost:27017
- Redis on localhost:6379
- API on localhost:5080
- Client on localhost:4200

### Option 2: Manual Setup
```bash
# Terminal 1: Start server
cd server
dotnet run --project src/RoshShaket.Api

# Terminal 2: Start client
cd client
npm install
npm start
```

## Running Tests

### All Tests Together (Recommended)
```bash
# Windows PowerShell
.\run-tests.ps1 -All

# macOS/Linux (requires Make)
make test
```

### Individual Test Suites

#### Client Unit Tests
```bash
cd client
npm run test              # Run once
npm run test:watch       # Watch mode
```

#### Server Unit Tests
```bash
cd server
dotnet test
```

#### E2E Tests
```bash
# Ensure services are running first!
cd client
npm run e2e              # Run headless
npm run e2e:open         # Interactive UI (recommended)
```

## Project Structure

```
rosh-shaket/
├── client/                          # Angular/Ionic web app
│   ├── src/
│   │   ├── app/
│   │   │   ├── app.component.spec.ts
│   │   │   ├── core/api.service.spec.ts
│   │   │   └── pages/
│   │   └── ...
│   ├── cypress/
│   │   ├── e2e/app.cy.ts           # E2E tests
│   │   ├── support/e2e.ts          # E2E configuration
│   ├── karma.conf.js               # Unit test configuration
│   ├── cypress.config.ts           # E2E test configuration
│   ├── angular.json
│   ├── package.json
│   └── Dockerfile
│
├── server/                          # .NET backend
│   ├── src/
│   │   ├── RoshShaket.Api/         # API endpoints
│   │   ├── RoshShaket.Application/ # Business logic
│   │   ├── RoshShaket.Domain/      # Domain models
│   │   └── RoshShaket.Infrastructure/ # Data access
│   ├── tests/
│   │   ├── RoshShaket.Application.Tests/  # Unit tests
│   │   └── RoshShaket.Api.Tests/          # Integration tests
│   ├── RoshShaket.sln
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── docker-compose.yml               # Development services
├── docker-compose.test.yml          # Test services
├── TESTING.md                       # Detailed testing guide
├── QUICKSTART.md                    # This file
├── Makefile                         # Unix-like test commands
├── run-tests.ps1                    # Windows test runner
└── .gitignore
```

## Common Tasks

### View Logs
```bash
docker-compose logs -f              # All services
docker-compose logs api             # Just API
docker-compose logs client          # Just client
```

### Stop Services
```bash
docker-compose down
```

### Clean Everything
```bash
docker-compose down -v              # Remove volumes too
rm -rf client/node_modules
rm -rf server/src/*/bin server/src/*/obj
rm -rf server/tests/*/bin server/tests/*/obj
```

### Database Access
```bash
# PostgreSQL
docker-compose exec postgres psql -U rosh -d rosh_shaket

# MongoDB
docker-compose exec mongo mongosh

# Redis
docker-compose exec redis redis-cli
```

## Writing Tests

### Angular Component Test
```typescript
// src/app/my/my.component.spec.ts
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

  it('should have title', () => {
    expect(component.title).toBe('Expected Title');
  });
});
```

### Cypress E2E Test
```typescript
// cypress/e2e/myfeature.cy.ts
describe('My Feature', () => {
  beforeEach(() => {
    cy.visit('/feature-path');
  });

  it('should display feature', () => {
    cy.get('[data-testid="feature-title"]').should('contain', 'Feature Name');
  });

  it('should handle user interaction', () => {
    cy.get('button').click();
    cy.contains('Success').should('be.visible');
  });
});
```

### .NET xUnit Test
```csharp
// tests/RoshShaket.Application.Tests/MyTests.cs
using Xunit;
using FluentAssertions;

namespace RoshShaket.Application.Tests;

public class MyTests
{
    [Fact]
    public void MyMethod_WhenCondition_ShouldResult()
    {
        // Arrange
        var input = new MyClass();

        // Act
        var result = input.DoSomething();

        // Assert
        result.Should().Be(expected);
    }
}
```

## Debugging

### Debug Client Tests
```bash
cd client
npm run test:watch
# Tests rerun on file changes
```

### Debug E2E Tests
```bash
cd client
npm run e2e:open
# Opens interactive Cypress debugger
```

### Debug Server Tests
```bash
cd server
dotnet test --verbosity detailed
```

### Debug API (with debugger)
```bash
cd server
dotnet run --project src/RoshShaket.Api
# Now attach debugger from Visual Studio/VS Code
```

## Troubleshooting

### Ports Already in Use
```bash
# Find what's using port 4200
netstat -ano | findstr :4200    # Windows
lsof -i :4200                   # macOS/Linux

# Kill process
taskkill /PID <PID> /F          # Windows
kill -9 <PID>                   # macOS/Linux
```

### Docker Daemon Not Running
```bash
# Windows: Start Docker Desktop
# macOS/Linux:
sudo systemctl start docker     # Linux
open /Applications/Docker.app   # macOS
```

### npm Module Issues
```bash
cd client
rm -rf node_modules package-lock.json
npm install
```

### .NET Build Issues
```bash
cd server
dotnet clean
dotnet restore
dotnet build
```

## Next Steps

1. **Read the Tests**: Look at existing tests to understand patterns
2. **Write Tests**: Create tests for new features
3. **Run Tests**: Verify tests pass before committing
4. **Check Coverage**: Aim for >80% code coverage
5. **Review TESTING.md**: For detailed testing documentation

## Resources

- **Angular Testing**: https://angular.io/guide/testing
- **Cypress Documentation**: https://docs.cypress.io/
- **xUnit.net**: https://xunit.net/
- **FluentAssertions**: https://fluentassertions.com/
- **Docker Compose**: https://docs.docker.com/compose/

## Getting Help

- Check TESTING.md for detailed guidance
- Review existing tests in the codebase
- Check service logs: `docker-compose logs <service>`
- Search GitHub Issues: https://github.com/rosh-shaket/rosh-shaket/issues

---

**Happy Testing! 🧪**

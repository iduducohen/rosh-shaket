.PHONY: help install build start stop clean test test-client test-server test-e2e logs

help:
	@echo "Available commands:"
	@echo "  make install           - Install dependencies for both client and server"
	@echo "  make build             - Build both client and server"
	@echo "  make start             - Start all services with docker-compose"
	@echo "  make stop              - Stop all services"
	@echo "  make clean             - Clean up containers and volumes"
	@echo "  make test              - Run all tests (client, server, e2e)"
	@echo "  make test-client       - Run client unit tests"
	@echo "  make test-client-watch - Run client tests in watch mode"
	@echo "  make test-server       - Run server unit tests"
	@echo "  make test-e2e          - Run e2e tests"
	@echo "  make test-e2e-open     - Open e2e test UI"
	@echo "  make logs              - Show logs from all services"

install:
	cd client && npm install
	cd server && dotnet restore

build:
	cd client && npm run build:prod
	cd server && dotnet build

start:
	docker-compose up -d
	@echo "Services starting. API will be available at http://localhost:5080"
	@echo "Client will be available at http://localhost:4200"

stop:
	docker-compose down

clean:
	docker-compose down -v
	rm -rf client/coverage
	rm -rf client/node_modules
	rm -rf server/src/*/bin server/src/*/obj
	rm -rf server/tests/*/bin server/tests/*/obj

test: test-server test-client test-e2e
	@echo "All tests completed!"

test-client:
	cd client && npm run test

test-client-watch:
	cd client && npm run test:watch

test-server:
	cd server && dotnet test

test-e2e: start
	sleep 10
	cd client && npm run e2e

test-e2e-open:
	cd client && npm run e2e:open

logs:
	docker-compose logs -f

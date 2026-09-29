# Development container for the client (ng serve with live reload).
FROM node:20-alpine

WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci

COPY . .

EXPOSE 8100

# --host 0.0.0.0 so the dev server is reachable from outside the container
CMD ["npm", "start", "--", "--host", "0.0.0.0"]

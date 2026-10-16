FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci

# Copy app source
COPY . .

# Build the frontend and backend
RUN npm run build

# Expose the port the app runs on (default in server.ts is 3000)
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]

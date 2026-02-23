FROM node:20-slim

WORKDIR /app

# Install root dependencies
COPY package*.json ./
RUN npm install --production

# Install client dependencies and build
COPY client/package*.json ./client/
RUN cd client && npm install

# Copy all source code
COPY . .

# Build React client
RUN cd client && npm run build

# Expose port
EXPOSE 3001

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Start server
CMD ["node", "server/index.js"]

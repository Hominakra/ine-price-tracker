FROM mcr.microsoft.com/playwright:v1.63.0-jammy
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV HEADLESS=true
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
EXPOSE 4000
CMD ["npm", "start"]

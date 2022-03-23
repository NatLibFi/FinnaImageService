FROM node:14.19.1

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm ci --only=production
# If you are building your code for production
# 

# Bundle app source
COPY . .

EXPOSE 80
CMD [ "node", "index.js" ]

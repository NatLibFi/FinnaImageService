FROM node:14.19.1

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# If you are building your code for production
RUN npm ci --only=production

# Bundle app source
COPY . .

EXPOSE 80

RUN apt-get update
RUN apt-get install -y ghostscript
RUN apt-get install -y less

CMD [ "node", "index.js" ]

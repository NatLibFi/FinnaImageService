FROM node:14.19.1
RUN apt-get update
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

RUN apt-get install -y ghostscript
RUN apt-get install -y less
RUN apt-get install -y cron
RUN apt-get install -y curl

RUN echo "0 0 * * 0 curl --silent http://127.0.0.1/clearall" | crontab -

CMD [ "node", "index.js" ]

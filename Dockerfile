FROM node:20-bullseye
# Note: If you upgrade node, ensure that any security policy doesn't prevent conversion
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

RUN apt-get install -y less curl nano

# Install ghostscript v10, latest release
WORKDIR /usr/bin

RUN wget https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs1000/ghostscript-10.0.0-linux-x86_64.tgz

RUN tar -zxvf ghostscript-10.0.0-linux-x86_64.tgz && rm ghostscript-10.0.0-linux-x86_64.tgz

RUN cp ghostscript-10.0.0-linux-x86_64/gs-1000-linux-x86_64 /usr/bin/gs
# Add rights to use ghostscript
RUN chmod +rwx /usr/bin/gs

WORKDIR /usr/src/app

# Copy sample policy file with edits for imagemagick
RUN cp policy.xml.sample /etc/ImageMagick-6/policy.xml
 
RUN chmod +x start.sh

CMD [ "./start.sh" ]

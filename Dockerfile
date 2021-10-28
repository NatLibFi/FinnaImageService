FROM php:8.0-fpm

# Install cron and nginx
RUN apt-get -y update \
    && apt-get -y install cron nginx libzip-dev

# Install opcache and zip extensions
RUN docker-php-ext-install opcache
RUN docker-php-ext-install zip

# Download Ghostscript
WORKDIR /tmp
RUN curl -L https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs9550/ghostscript-9.55.0-linux-x86_64.tgz --output gs.tgz
RUN tar zxvf gs.tgz
RUN mv ghostscript-*-linux-x86_64/gs-*-linux-x86_64 /usr/bin/gs

# Copy files to www-root
COPY index.php composer.json composer.lock /var/www/html/
COPY src /var/www/html/src

# Composer
RUN curl -sS https://getcomposer.org/installer | php \
    && mv composer.phar /usr/local/bin/composer \
    && chmod a+x /usr/local/bin/composer

RUN mkdir -p /var/www/html
RUN chmod u+w /var/www/html
RUN chown -R www-data:www-data /var/www/html/

COPY nginx-default.conf /etc/nginx/sites-enabled/default

# Create directories for images and status files
RUN mkdir /tmp/pdf2jpg
RUN mkdir /tmp/pdf2jpg/in
RUN mkdir /tmp/pdf2jpg/out
RUN mkdir /tmp/pdf2jpg/status
RUN chown -R www-data:www-data /tmp/pdf2jpg

WORKDIR /var/www/html
USER www-data
RUN composer --no-cache install

USER root

# Install crontab to prune cache
RUN echo "0 4 * * 0 find /tmp/pdf2jpg/ -mtime +7 -type f -exec rm {} +" | crontab -

# Start cron, php-fpm and nginx
CMD service cron start \
    && service nginx start \
    && php-fpm -F

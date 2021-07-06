FROM beveradb/docker-apache-php7-fpm

# Install cron
RUN apt-get update && apt-get -y install cron

# Download Ghostscript
WORKDIR /tmp
RUN curl -L https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs927/ghostscript-9.27-linux-x86_64.tgz --output gs.tgz
RUN tar zxvf gs.tgz
RUN mv ghostscript-9.27-linux-x86_64/gs-927-linux-x86_64 /usr/bin/gs

# Copy files to www-root
COPY index.php composer.json /var/www/html/
COPY src /var/www/html/src

# Composer
RUN curl -sS https://getcomposer.org/installer | php \
    && mv composer.phar /usr/local/bin/composer \
    && chmod a+x /usr/local/bin/composer

RUN chmod u+w /var/www/html
RUN chown -R www-data:www-data /var/www/html/
RUN rm /var/www/html/index.html

# Create directories for images and status files
RUN mkdir /tmp/pdf2jpg
RUN mkdir /tmp/pdf2jpg/in
RUN mkdir /tmp/pdf2jpg/out
RUN mkdir /tmp/pdf2jpg/status
RUN chown -R www-data:www-data /tmp/pdf2jpg


WORKDIR /var/www/html
USER www-data
RUN composer --no-cache update

USER root

# Install crontab to prune cache
RUN echo "0 4 * * 0 find /tmp/pdf2jpg/ -mtime +7 -type f -exec rm {} +" | crontab -

# Start cron, php-fpm and Apache
CMD service cron start \
    # entry point from beveradb/docker-apache-php7-fpm
    && service php7.1-fpm start \
    && /usr/sbin/apache2ctl -D FOREGROUND

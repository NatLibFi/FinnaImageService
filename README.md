# FinnaImageService

HTTP service for generating a preview image from a PDF cover page using Ghostscript.
See ImageService.php for Ghostscript command line parameters.

# Installation

This example uses pdf2jpg as the image and container name and tcp port 36000 as the published port for the service.

- Install Docker
- Build Docker image:

      cd <dir>
      docker build -t pdf2jpg .

  Use e.g. pdf2jpg as the service name.

- Start service:

      docker run -p 36000:80 pdf2jpg

- Or just create the container e.g. for starting via systemd (see accompanying pdf2jpg.service for systemd configuration):

      docker create -p 36000:80 --name pdf2jpg pdf2jpg

# Recreating the service

- To recreate the service, first stop the service:

      docker stop pdf2jpg

   or if running with systemd:

      systemctl stop pdf2jpg

   then remove the old container and image:

      docker rm pdf2jpg
      docker rmi pdf2jpg

  Then create the service just like when doing an initial installation.

- All in one:

      systemctl stop pdf2jpg && docker rm pdf2jpg && docker rmi pdf2jpg && docker build -t pdf2jpg . && docker create -p 36000:80 --name pdf2jpg pdf2jpg && systemctl start pdf2jpg

# Troubleshooting

If the service fails to start, you may need to stop Docker, remove `/var/lib/docker/network/files/local-kv.db` (or wherever Docker stores its files, e.g. `/data/docker/network/files/local-kv.db`) and try again.

# Usage

    curl http://127.0.0.1:36000?url=<PDF url>

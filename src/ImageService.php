<?php
/**
 * HTTP-service for converting first page of a PDF document to a JPG image
 * using Ghostscript.
 *
 * PHP version 8
 *
 * Copyright (C) The National Library of Finland 2019-2021.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 2,
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * @category VuFind
 * @package  PDF
 * @author   Samuli Sillanpää <samuli.sillanpaa@helsinki.fi>
 * @author   Ere Maijala <ere.maijala@helsinki.fi>
 * @license  http://opensource.org/licenses/gpl-2.0.php GNU General Public License
 * @link     https://vufind.org/wiki/configuration:external_content Wiki
 */
class ImageService
{
    /**
     * Base directory for downloaded images and host status files.
     *
     * @var string
     */
    protected $baseDir;

    /**
     * Service for handling host blocking.
     *
     * @var \HostStatus
     */
    protected $hostStatus;

    /**
     * Constructor
     */
    public function __construct()
    {
        $this->baseDir = sys_get_temp_dir() . '/pdf2jpg';
        $this->hostStatus = new \HostStatus("{$this->baseDir}/status");
    }

    /**
     * Handle request.
     *
     * @return void
     */
    public function handleRequest()
    {
        $get = $_GET;
        if (!($url = $get['url'] ?? null)) {
            return;
        }

        $fileName = md5($url);
        $outputPath = "{$this->baseDir}/out/${fileName}";
        if (file_exists($outputPath) && $this->outputImage($outputPath)) {
            return;
        }

        $host = parse_url($url, PHP_URL_HOST);
        if ($this->hostStatus->isHostBlocked($host)) {
            return false;
        }

        // Download PDF
        $inputPath = "{$this->baseDir}/in/${fileName}";

        $client = new \Laminas\Http\Client();
        $client->setOptions(['strictredirects' => false, 'timeout' => 20]);
        $client->setStream($inputPath);
        $client->setUri($url);

        try {
            $result = $client->send();
        } catch (\Exception $e) {
            error_log("Failed to download pdf, url: $url");
            error_log($e->getMessage());
            if (file_exists($inputPath)) {
                unlink($inputPath);
            }
            $this->hostStatus->addHostFailure($host);
            return;
        }

        if (!$result->isSuccess()) {
            error_log(
                "Error downloading pdf, content length: "
                . strlen($result->getBody()) . ", url: $url"
            );
            unlink($inputPath);
            $this->hostStatus->addHostFailure($host);
            return;
        }

        $this->hostStatus->addHostSuccess($host);

        // Run Ghostscript
        $gs = sprintf(
            '/usr/bin/timeout 60s /usr/bin/gs -dQUIET -dSAFER -dBATCH -dNOPAUSE'
            . ' -dNOPROMPT -dMaxBitmap=500000000 -dAlignToPixels=0 -dGridFitTT=2'
            . ' -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r150 -dFirstPage=1'
            . ' -dUseCropBox -dLastPage=1 -sDEVICE=jpeg -o %s %s',
            $outputPath, $inputPath
        );
        exec($gs, $output, $returnVar);

        unlink($inputPath);

        if ($returnVar !== 0) {
            error_log(
                'Error executing Ghostscript, return status: '
                . "{$returnVar}, url: {$url}"
            );
            unlink($outputPath);
            return;
        }

        // Output converted image
        if (!$this->outputImage($outputPath)) {
            error_log("Failed to read converted image: {$outputPath}, url: {$url}");
            error_log($e->getMessage());
        }
    }

    /**
     * Output headers and image.
     *
     * @param string $path File path
     *
     * @return bool Success
     */
    protected function outputImage(string $path) : bool
    {
        try {
            $img = file_get_contents($path);
            header('Content-Type: image/jpeg');
            header('Content-Length: ' . strlen($img));
            echo $img;
            return true;
        } catch (\Exception $e) {
            error_log("Failed to read converted image: {$path}");
            error_log($e->getMessage());
            return false;
        }
    }
}
?>

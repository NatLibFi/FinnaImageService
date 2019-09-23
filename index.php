<?php
/**
 * HTTP-service for converting first page of a PDF document to a JPG image
 * using Ghostscript.
 *
 * PHP version 7
 *
 * Copyright (C) The National Library of Finland 2019.
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
 * @license  http://opensource.org/licenses/gpl-2.0.php GNU General Public License
 * @link     https://vufind.org/wiki/configuration:external_content Wiki
 */
require __DIR__ . '/vendor/autoload.php';

$get = $_GET;
$url = $get['url'] ?? null;

if (!$url) {
    return;
}

if (!$inputPath = tempnam(sys_get_temp_dir(), 'pdf2jpg-input')) {
    error_log("Failed to create temporary input file.");
    return;
}

// Download PDF to a temporary file
$client = new \Zend\Http\Client();
$client->setOptions(['strictredirects' => false, 'timeout' => 20]);
$client->setStream($inputPath);
$client->setUri($url);
$client->setAdapter('Zend\Http\Client\Adapter\Curl');

try {
    $result = $client->send();
} catch (\Exception $e) {
    error_log("Failed to download pdf, url: $url");
    error_log($e->getMessage());
    unlink($inputPath);
    return;
}

if (!$result->isSuccess() || !$result->getContentLength()) {
    error_log(
        "Error in downloaded pdf, content length: "
        . $result->getContentLength() . ", url: $url"
    );
    unlink($inputPath);
    return;
}

if (!$outputPath = tempnam(sys_get_temp_dir(), 'pdf2jpg-output')) {
    unlink($inputPath);
    error_log("Failed to create temporary output file.");
    return;
}

// Run Ghostscript
$gs = sprintf(
    '/usr/bin/gs -dQUIET -dSAFER -dBATCH -dNOPAUSE -dNOPROMPT -dMaxBitmap=500000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r150 -dFirstPage=1 -dLastPage=1 -sDEVICE=jpeg -o %s %s',
    $outputPath, $inputPath
);
exec($gs, $output, $returnVar);

unlink($inputPath);

if ($returnVar !== 0) {
    error_log(
        "Error executing Ghostscript, return status: {$returnVar}, url: {$url}"
    );
    unlink($outputPath);
    return;
}

// Output converted image
try {
    $img = file_get_contents($outputPath);
} catch (\Exception $e) {
    error_log("Failed to read converted image: {$outputPath}, url: {$url}");
    error_log($e->getMessage());

    unlink($outputPath);
    return;
}

header('Content-Type: image/jpeg');
header('Content-Length: ' . strlen($img));

echo $img;
unlink($outputPath);

return;
?>

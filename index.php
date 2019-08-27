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

$inputPath = tempnam(sys_get_temp_dir(), 'pdf2jpg-input');
$outputPath = tempnam(sys_get_temp_dir(), 'pdf2jpg-output');

// Download PDF to a temporary file
$client = new \Zend\Http\Client();
$client->setOptions(array('strictredirects' => false));
$client->setStream($inputPath);
$client->setUri($url);
$result = $client->send();

if (!$result->isSuccess() || !$result->getContentLength()) {
    return;
}

// Run Ghostscript
$gs = sprintf('/usr/bin/gs -dQUIET -dSAFER -dBATCH -dNOPAUSE -dNOPROMPT -dMaxBitmap=500000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r150 -dFirstPage=1 -dLastPage=1 -sDEVICE=jpeg -o %s %s', $outputPath, $inputPath);
exec($gs, $output, $returnVar);

if ($returnVar !== 0) {
    return;
}

// Output converted image
header("Content-Type: image/jpeg");
echo file_get_contents($outputPath);

return;
?>

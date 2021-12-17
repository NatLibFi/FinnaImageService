#!/usr/bin/php
<?php
/**
 * Script for testing PDF-file converting fast without docker setup.
 * Give input and output paths defined in the echo statement below.
 */
if (count($argv) < 3) {
    echo "Usage: TestConvert.php [PDF file path] [Image file output path]\r\n";
    exit();
}
$inputPath = $argv[1];
$outputPath = $argv[2];

$gs = sprintf(
    '/usr/bin/timeout 60s /usr/bin/gs -dQUIET -dSAFER -dBATCH -dNOPAUSE'
    . ' -dNOPROMPT -dMaxBitmap=500000000 -dAlignToPixels=0 -dGridFitTT=2'
    . ' -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r150 -dFirstPage=1 -dUseCropBox'
    . ' -dLastPage=1 -sDEVICE=jpeg -o %s %s',
    $outputPath, $inputPath
);
exec($gs, $output, $returnVar);
?>
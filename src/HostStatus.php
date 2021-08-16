<?php
/**
 * Utility for handling host failures.
 *
 * PHP version 7
 *
 * Copyright (C) The National Library of Finland 2015-2021.
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
 * @author   Ere Maijala <ere.maijala@helsinki.fi>
 * @author   Samuli Sillanpää <samuli.sillanpaa@helsinki.fi>
 * @license  http://opensource.org/licenses/gpl-2.0.php GNU General Public License
 * @link     https://vufind.org/wiki/configuration:external_content Wiki
 */
class HostStatus
{
    /**
     * Number of failed download attempts before blocking host.
     *
     * @var int
     */
    const FAILURE_BLOCK_THRESHOLD = 10;

    /**
     * Maximum duration for keeping a failed host blocked.
     *
     * @var int
     */
    const FAILURE_BLOCK_DURATION = 3600;

    /**
     * Duration after which a blocked host is re-checked.
     *
     * @var int
     */
    const FAILURE_RECHECK_TIME = 60;

    /**
     * Directory for status files.
     *
     * @var string
     */
    protected $baseDir = '';

    /**
     * Constructor.
     *
     * @param string $baseDir Directory for status files
     */
    public function __construct(string $baseDir)
    {
        $this->baseDir = $baseDir;
    }

    /**
     * Check if a server has been temporarily blocked due to failures
     *
     * @param string $host Host name
     *
     * @return bool
     */
    public function isHostBlocked(string $host) : bool
    {
        $statusFile = $this->getStatusFilePath($host);
        if (!file_exists($statusFile)) {
            return false;
        }
        $blockDuration = self::FAILURE_BLOCK_DURATION;
        if (filemtime($statusFile) + $blockDuration < time()) {
            unlink($statusFile);
            $this->logWarning("Host $host has been unblocked");
            return false;
        }
        $tries = file_get_contents($statusFile);
        $blockThreshold = self::FAILURE_BLOCK_THRESHOLD;
        if ($tries >= $blockThreshold) {
            $reCheckTime = self::FAILURE_RECHECK_TIME;
            if (filemtime($statusFile) + $reCheckTime < time()) {
                $this->logWarning("Host $host has been tentatively unblocked");
                return false;
            }
            return true;
        }
        return false;
    }

    /**
     * Record a failure for a server
     *
     * @param string $host Host name
     *
     * @return void
     */
    public function addHostFailure(string $host) : void
    {
        $statusFile = $this->getStatusFilePath($host);
        $failures = 0;
        $blockDuration = self::FAILURE_BLOCK_DURATION;
        if (file_exists($statusFile)
            && filemtime($statusFile) + $blockDuration >= time()
        ) {
            $failures = file_get_contents($statusFile);
        }
        ++$failures;
        file_put_contents($statusFile, $failures, LOCK_EX);
        $this->logWarning("Host $host has $failures recorded failures");
    }

    /**
     * Record a success for a server
     *
     * @param string $host Host name
     *
     * @return void
     */
    public function addHostSuccess(string $host) : void
    {
        $statusFile = $this->getStatusFilePath($host);
        if (file_exists($statusFile)) {
            $this->logWarning("Host $host success, failure count cleared");
            unlink($statusFile);
        }
    }

    /**
     * Get status tracking file path for a host
     *
     * @param string $host Host name
     *
     * @return string
     */
    protected function getStatusFilePath(string $host) : string
    {
        return $this->baseDir . '/' . urlencode($host) . '.status';
    }

    /**
     * Log warning.
     *
     * @param string $message Message
     *
     * @return void
     */
    protected function logWarning(string $message) : void
    {
        error_log($message);
    }
}

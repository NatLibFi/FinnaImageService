#!/bin/bash

echo "Starting cron"
service cron start

echo "Starting image service"
node index.js

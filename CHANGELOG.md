# Okanjo ShipIt Change Log

When stuff changes, it's described here.

## 2015-06-09
 * Added Raven (Sentry) error reporting mechanism for keeping track of error events
 * Added report function to ShipIt object
 * Added new 400 response "Invalid destination|shipping address" so API can inform customer of bad information
 * Added reference to shipit service on shipping provider to access report function
 * Added reporting to verifying addresses, parcels and creating shipments
 * Added bad address test JSON request to test.php
 * Added warning if EasyPost key is not configured

## 2015-02-26
 * Use a description if already given, or concat carrier and service together

## 2015-02-24
 * Added missing variant string from item quote

## 2015-02-17
 * Cleanup / misc fixes

## 2015-01-08
 * Moved shipping provider to config so it can be easily changed
 * PHP test uses the port from the config file

## 2015-01-07
 * Refactored logic into separate prototype functions to make it easier to extend
 * Added php test (e.g. php test/test.php) to show how to communicate with the service via php

## 2015-01-06
 * Changed the EasyPost rate to return as-is, and we just set some additional minimum properties (id, price, description)

## 2015-01-05
 * Added request logging
 * Added code docs / comments / cleanup

## 2014-12-31
 * Initial 0.1.0 version
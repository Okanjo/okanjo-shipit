# Okanjo ShipIt Change Log

When stuff changes, it's described here.

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
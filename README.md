# Okanjo Shipping Service Provider

This service takes order information and returns quotes for shipping rates.

## Prerequisites

In order to use this service out-of-the-box, you will need an [EasyPost](http://easypost.com) api key.

## Setup

1. Fork or clone this project.
2. Install dependencies with `npm install`
3. Run `node .` to generate a new `config.js` file. This will generate new encryption and hmac keys. `Control+C` to stop.
4. Update the `config.js` file with your EasyPost api key (test or production)
5. Run `node .` to run the service.
6. Contact support@okanjo.com to register your shipping provider with your Okanjo store or marketplace.

> Note: You may also choose to have Okanjo host your custom shipping provider.
/**
 * Date: 12/18/14 9:10 AM
 *
 * ----
 *
 * (c) Okanjo Partners Inc
 * https://okanjo.com
 * support@okanjo.com
 *
 * https://github.com/okanjo/okanjo-shipit
 *
 * ----
 *
 * TL;DR? see: http://www.tldrlegal.com/license/mit-license
 *
 * The MIT License (MIT)
 * Copyright (c) 2013 Okanjo Partners Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

var express = require('express'),
    morgan = require('morgan'),
    fs = require('fs'),
    util = require('util'),
    raven = require('raven'),
    pkg = require('./../package.json'),
    Cipher = require('./cipher'),

    ShipIt = function(config) {

        this.config = config;
        this.cipher = new Cipher(this.config.cipher.key, this.config.cipher.hmac_key);

        // Setup error reporting
        this._initReporting();

        // Instantiate and link the shipping provider
        this.provider = new config.provider(config);
        this.provider.shipit = this;
    };


ShipIt.prototype = {

    constructor: ShipIt,

    /**
     * Starts the server
     */
    run: function run() {

        var app = express(),
            server;

        // Log to a file if desired
        var loggingOptions = {};
        if (this.config.access_log) {
            loggingOptions.stream = fs.createWriteStream(this.config.access_log, {flags: 'a'});
        }
        app.use(morgan('combined', loggingOptions));

        // Bind the routes
        this._bindRoutes(app);

        // Get going
        server = app.listen(this.config.port, function() {
            console.log('%s version %s listening at http://%s:%s', pkg.description, pkg.version, server.address().address, server.address().port);
        });

    },


    /**
     * Initializes error and event reporting, if configured
     * @private
     */
    _initReporting: function() {
        if (typeof this.config.raven_url === "string" && this.config.raven_url.length > 0) {
            this.ravenClient = new raven.Client(this.config.raven_url);
        } else {
            this.ravenClient = null;
        }
    },


    /**
     * Reports an error to the console and via Raven
     */
    report: function() {

        var agg = { err: undefined, meta: { }},
            self = this;

        // Pick the error out and add the rest to the meta array
        for(var i = 0; i < arguments.length; i++) {

            if (typeof arguments[i] === "object" && arguments[i] instanceof Error) {
                console.log(arguments[i].stack);
                agg.err = arguments[i];
            } else {
                console.log(util.inspect(arguments[i], { colors: true }));
                agg.meta['arg'+i] = arguments[i];
            }
        }

        // Report as exception so we always know who was responsible for this
        if (this.ravenClient) {

            // Always get a stack trace
            if (agg.err === undefined) {
                agg.err = new Error('Report: ' + (agg.meta.length > 0 ? agg.meta[0] : "???"));
            }

            this.ravenClient.captureError(agg.err, { extra: agg.meta }, function (res) {
                console.log(' >> Reported as ', self.ravenClient.getIdent(res))
            });
        }
    },


    /**
     * Binds the application routes
     * @param app
     * @private
     */
    _bindRoutes: function(app) {
        var self = this;


        // Pull the raw body out of the request stream
        // so we don't have to use random middle-ware
        app.use(function(req, res, next) {
            var data = '';
            req.setEncoding('utf8');
            req.on('data', function(chunk) {
                data += chunk;
            });
            req.on('end', function() {
                req.rawBody = data;
                next();
            });
        });


        // Show that the service is working and what version
        /**
         * Return the service information. Used for determining whether the service is active and the encryption keys are correct.
         * @param req
         * @param res
         * @private
         */
        app.get('/', function _getAppInfo(req, res) {
            res.setHeader('Content-Type', 'text/plain');
            res.send(self.cipher.encrypt(util.format('%s version %s. Ask your doctor. Use as directed.', pkg.description, pkg.version)));
        });


        // Get the shipping rates
        /**
         * Calculates shipping rates for the given order
         * @param req
         * @param res
         * @private
         */
        app.post('/calculate/rates', function _getShippingRates(req, res) {
            var json = self.cipher.decrypt(req.rawBody);
            if (json) {
                var data = JSON.parse(json);

                //
                // Verify that we have the necessary decision info
                //

                if (!data) {
                    res.status(400).send(self.cipher.encrypt('Bad request'));
                }

                // Verify buyer shipping address is present
                if (!data.hasOwnProperty('shipping_destination')) {
                    res.status(400).send(self.cipher.encrypt('Missing field: shipping_destination'));
                }

                // Verify store shipping addresses are present
                if (!data.hasOwnProperty('shipping_origins') || !data['shipping_origins'].length) {
                    res.status(400).send(self.cipher.encrypt('Missing field: shipping_origins'));
                }

                // Verify there are items to process
                if (!data.hasOwnProperty('items') || !data['items'].length) {
                    res.status(400).send(self.cipher.encrypt('Missing field: items'));
                }

                // Order is good, let's get an estimate on it
                self.provider.calculate(data, function(err, quote) {
                    if (err) {
                        // Allow address errors to funnel back to the API,
                        // so the API can choose to tell the customer about the error in their ways
                        if (typeof err === "string" && err.match(/^Invalid\s([^\s]+)\saddress$/) !== null) {
                            res.status(400).send(self.cipher.encrypt(err));
                        } else {
                            res.status(500).send(self.cipher.encrypt('Service failure'));
                        }
                    } else {
                        res.send(self.cipher.encrypt(JSON.stringify(quote)));
                    }
                });

            } else {
                res.status(400).send(self.cipher.encrypt('Really bad request'));
            }
        });

    }

};


module.exports = exports = ShipIt;
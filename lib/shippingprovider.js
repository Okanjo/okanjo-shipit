/**
 * Date: 12/19/14 11:28 AM
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

var util = require('util'),
    async = require('async'),

    /**
     * Default shipping provider. Uses EasyPost for shipping calculations
     * @param {*} config - App configuration
     * @constructor
     */
    ShippingProvider = function(config) {
        this.config = config;
        this.easypost = require('node-easypost')(this.config.easypost_key);
    };


ShippingProvider.prototype = {

    constructor: ShippingProvider,

    /**
     * Process an order and get shipping quotes
     * @param {{ shipping_destination: { first_name: string, last_name: string, address_1: string, address_2: *, city: string, state: string, zip: string, country: string, phone: string }, shipping_origins:[{ first_name: string, last_name: string, address_1: string, address_2: *, city: string, state: string, zip: string, country: string, phone: string }], items: []}} order - Order information to estimate
     * @param {function(err:Error, quote:*)} callback - Called when finished
     */
    calculate: function(order, callback) {

        // Customizations here could include:
        // * Aggregation: Ability to package multiple items or multiple quantities into a single parcel and split shipping cost across items
        // * Origins: Ability to determine nearest facility to ship from
        // * Custom business logic, like freight approximation

        // This is a very simple calculator. The first shipping origin will be used, regardless of number given
        // and each item will get it's own parcel / quote. No aggregation or product "fitting".

        var self = this,
            origin = order.shipping_origins[0],
            sourceAddress = {
                name: origin.first_name + ' ' + origin.last_name,
                street1: origin.address_1,
                city: origin.city,
                state: origin.state,
                zip: origin.zip,
                country: origin.country,
                phone: origin.phone
            },
            targetAddress = {
                name: order.shipping_destination.first_name + ' ' + order.shipping_destination.last_name,
                street1: order.shipping_destination.address_1,
                city: order.shipping_destination.city,
                state: order.shipping_destination.state,
                zip: order.shipping_destination.zip,
                country: order.shipping_destination.country,
                phone: order.shipping_destination.phone
            };

        // Add optional line 2 if needed
        if (origin.address_2 && origin.address_2.length > 0) {
            sourceAddress.street2 = origin.address_2;
        }

        // Add optional line 2 if needed
        if (order.shipping_destination.address_2 && order.shipping_destination.address_2.length > 0) {
            targetAddress.street2 = order.shipping_destination.address_2;
        }

        async.parallel({

            /**
             * Make sure the source address is a legit shipping address
             * @param cb
             */
            verifySourceAddress: function(cb) {
                // verify address
                self.easypost.Address.create(sourceAddress, function(err, address) {
                    address.verify(function(err, response) {
                        if (err) {
                            console.error('Source address is invalid.', sourceAddress);
                            cb('Invalid source address', null);
                        } else if (response.message !== undefined && response.message !== null) {
                            console.warn('Address is valid but has an issue: ', response.message);
                            cb(null, address);
                        } else {
                            cb(null, response);
                        }
                    });
                });
            },

            /**
             * Make sure the destination address is a legit shipping address
             * @param cb
             */
            verifyTargetAddress: function(cb) {
                // verify address
                self.easypost.Address.create(targetAddress, function(err, address) {
                    address.verify(function(err, response) {
                        if (err) {
                            console.error('Target address is invalid.', targetAddress);
                            cb('Invalid source address', null);
                        } else if (response.message !== undefined && response.message !== null) {
                            console.warn('Address is valid but has an issue: ', response.message);
                            cb(null, address);
                        } else {
                            cb(null, response);
                        }
                    });
                });
            }

        }, function(err, data) {
            if (err) {

                // Address validation failed, bail out
                callback(err, null);
            } else {

                //
                // PROCESS ALL_THE_ITEMS!
                //

                var quote = [];

                async.each(order.items, function(item, cb_item) {

                    async.series({

                        /**
                         * Verify the parcel by creating it
                         * @param cb
                         */
                        verifyParcel: function(cb) {

                            self.easypost.Parcel.create(item.product_parcel, function(err, response) {
                                if (err) {
                                    console.error('bad parcel', item.product_parcel, err);
                                    cb('Invalid item package: ' + item.product_id, null);
                                } else {
                                    cb(null, response);
                                }
                            });

                        },

                        /**
                         * Create the shipment with EasyPost to get the rates
                         * @param cb
                         */
                        createShipment: function(cb) {

                            self.easypost.Shipment.create({
                                to_address: targetAddress,
                                from_address: sourceAddress,
                                parcel: item.product_parcel
                                // customs_info: {},
                                // options: {}
                            }, function(err, shipment) {

                                if (err) {
                                    console.error('Bad shipment!', err);
                                    cb('Unable to retrieve shipment rates', null)
                                } else {
                                    cb(null, shipment)
                                }

                            });
                        }

                    }, function(err, data) {

                        if (err) {
                            // Bail if the parcel or shipment failed to quote
                            callback(err, null);
                        } else {

                            //
                            // Attach the item quote to the final quote object
                            //

                            var q = {
                                product_id: item.product_id,
                                origin_address: sourceAddress,
                                destination_address: targetAddress,
                                parcel: item.product_parcel,
                                rates: []
                            };

                            // Process each rate
                            for(var i = 0; i < data.createShipment.rates.length; i++) {
                                var rate = data.createShipment.rates[i];
                                q.rates.push({
                                    id: rate.id,
                                    description: util.format('%s %s', rate.carrier, rate.service),
                                    price: rate.rate
                                });
                            }

                            // Add the item quote to the pool
                            quote.push(q);
                            cb_item();
                        }
                    });

                }, function(err) {

                    if (err) {
                        callback(err, null);
                    } else {

                        //
                        // Return the final quote
                        //

                        console.log('quote', quote);
                        callback(null, quote);
                    }
                });
            }
        });
    }
};

module.exports = exports = ShippingProvider;
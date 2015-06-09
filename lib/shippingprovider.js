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
        if (typeof this.config.easypost_key !== "string" || this.config.easypost_key.length === 0) {
            console.warn(' *** Warning *** : No EasyPost key configured, provider will crash and burn when looking up rates...')
        }
    };


ShippingProvider.prototype = {

    /**
     * Obviously, the constructor
     */
    constructor: ShippingProvider,

    /**
     * The easypost client after being initialized
     */
    easypost: {},


    /**
     * Holds a reference to the core ShipIt service running this shipping provider
     */
    shipit: null,


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
            addresses = self._extractAddressesFromOrder(order);

        // Verify the addresses and process the order
        self._verifyOrderAddresses(addresses.source, addresses.target, function(err) {
            if (err) {
                // Address validation failed, bail out
                callback(err, null);
            } else {
                // Process the order
                self._processOrder(addresses.source, addresses.target, order, callback);
            }
        });
    },


    /**
     * Pulls the shipping origin and destination addresses from the order and puts it in a format for EasyPost
     * @param order - The order object
     * @returns {{source: {name: string, street1: *, city: (*|city|city|city|city), state: (*|state|state|state|state|Object), zip: (*|zip|zip|zip|zip), country: (*|country|country|country|country), phone: (*|phone|phone|phone)}, target: {name: string, street1: *, city: (*|city|city|city|city), state: (*|state|state|state|state|Object), zip: (*|zip|zip|zip|zip), country: (*|country|country|country|country), phone: (*|phone|phone|phone)}}}
     * @protected
     */
    _extractAddressesFromOrder: function(order) {
        var origin = order.shipping_origins[0],
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

        return {
            source: sourceAddress,
            target: targetAddress
        };
    },


    /**
     * Verifies a shipment address
     * @param address - Address to verify
     * @param type - The type of address
     * @param callback - Promise function returning the verified address
     * @protected
     */
    _verifyAddress: function(address, type, callback) {
        var self = this;
        self.easypost.Address.create(address, function(err, address) {
            address.verify(function(err, response) {
                if (err) {
                    self.shipit.report(new Error(type + ' address is invalid.'), err, address);
                    callback('Invalid '+type+' address', null);
                } else if (response.message !== undefined && response.message !== null) {
                    self.shipit.report(new Error("Address warning ("+type+"): " + response.message), address);
                    callback(null, address);
                } else {
                    callback(null, response);
                }
            });
        });
    },


    /**
     * Verify the source and destination addresses
     * @param sourceAddress - Shipment origin
     * @param targetAddress - Shipment destination
     * @param callback - Promise function returning the addresses created by EasyPost
     * @protected
     */
    _verifyOrderAddresses: function(sourceAddress, targetAddress, callback) {
        var self = this;
        //noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
        async.parallel({

            /**
             * Make sure the source address is a legit shipping address
             * @param cb
             */
            verifySourceAddress: function(cb) {
                self._verifyAddress(sourceAddress, 'source', cb);
            },

            /**
             * Make sure the destination address is a legit shipping address
             * @param cb
             */
            verifyTargetAddress: function(cb) {
                self._verifyAddress(targetAddress, 'destination', cb);
            }

        }, function(err, data) {
            callback(err, data);
        });
    },


    /**
     * Process the order
     * @param sourceAddress - Shipment origin
     * @param targetAddress - Shipment destination
     * @param order - The order to process
     * @param callback - Promise function returning the order quote
     * @protected
     */
    _processOrder: function(sourceAddress, targetAddress, order, callback) {
        var self = this,
            quote = [];

        async.each(order.items, function(item, cb_item) {

            self._processOrderItem(item, sourceAddress, targetAddress, function(err, q) {
                if (err) { callback(err, null); return }
                quote.push(q);
                cb_item();
            });

        }, function(err) {

            if (err) {
                callback(err, null);
            } else {

                // Return the final quote
                console.log('quote', util.inspect(quote, true, 10));
                callback(null, quote);
            }
        });
    },


    /**
     * Processes an order item and returns the item shipping quote
     * @param {{product_parcel:*, product_id:string}} item - The item being shipped
     * @param sourceAddress - Shipment origin
     * @param targetAddress - Shipment destination
     * @param callback - Promise function returning the item quote
     * @protected
     */
    _processOrderItem: function(item, sourceAddress, targetAddress, callback) {

        var self = this;

        //noinspection JSUnusedGlobalSymbols
        async.series({

            /**
             * Verify the parcel by creating it
             * @param cb
             */
            verifyParcel: function(cb) {
                self._verifyParcel(item.product_parcel, item.product_id, cb);
            },

            /**
             * Create the shipment with EasyPost to get the rates
             * @param cb
             */
            createShipment: function(cb) {
                self._createShipment(sourceAddress, targetAddress, item.product_parcel, cb);
            }

        }, function(err, data) {
            if (err) {
                // Bail if the parcel or shipment failed to quote
                callback(err, null);
            } else {
                // Add the item quote to the pool
                callback(null, self._processItemRates(item, sourceAddress, targetAddress, item.product_parcel, data.createShipment));
            }
        });
    },


    /**
     * Verifies a parcel by creating it on the EasyPost API
     * @param parcel - Item parcel information
     * @param id - The ID of the product
     * @param callback - Promise function with the EasyPost parcel
     * @protected
     */
    _verifyParcel: function(parcel, id, callback) {
        var self = this;
        self.easypost.Parcel.create(parcel, function(err, response) {
            if (err) {
                self.shipit.report(new Error('Could not create parcel'), err, parcel, id);
                callback('Invalid item package: ' + id, null);
            } else {
                callback(null, response);
            }
        });
    },


    /**
     * Creates an EasyPost shipment to get the available shipping rates
     * @param sourceAddress - Shipment origin
     * @param targetAddress - Shipment destination
     * @param parcel - The package to get shipped
     * @param callback - Promise function fired when completed
     * @protected
     */
    _createShipment: function(sourceAddress, targetAddress, parcel, callback) {
        var self = this;
        self.easypost.Shipment.create({
            to_address: targetAddress,
            from_address: sourceAddress,
            parcel: parcel
            // customs_info: {},
            // options: {}
        }, function(err, shipment) {
            if (err) {
                self.shipit.report(new Error('Could not create shipment'), err, shipment, sourceAddress, targetAddress, parcel);
                callback('Unable to retrieve shipment rates', null)
            } else {
                callback(null, shipment)
            }

        });
    },


    /**
     * Builds an item quote
     * @param item - The order item to quote
     * @param sourceAddress - The shipping source address
     * @param targetAddress - The shipping destination address
     * @param parcel - The package the item gets shipped in
     * @param shipment - The EasyPost shipment information for the item
     * @protected
     */
    _processItemRates: function(item, sourceAddress, targetAddress, parcel, shipment) {
        var q = {
            product_id: item.product_id,
            variant: item.variant,
            origin_address: sourceAddress,
            destination_address: targetAddress,
            parcel: parcel,
            rates: []
        };

        // Process each rate
        for(var i = 0; i < shipment.rates.length; i++) {
            var rate = shipment.rates[i];

            // Ensure the minimum fields here
            rate.description = rate.description || util.format('%s %s', rate.carrier, rate.service);
            rate.price = rate.rate;

            // Enqueue the rate to the quote
            q.rates.push(rate);
        }
        return q;
    }
};

module.exports = exports = ShippingProvider;
/**
 * Date: 12/17/14 4:26 PM
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

var fs = require('fs'),
    Cipher = require('./lib/cipher');

// If config file exists, use it generate create a new one
if (!fs.existsSync(__dirname+'/config.js')) {

    //
    // GENERATE A NEW CONFIG AND SAVE IT
    //

    // Randomly craete a new cipher key and sig
    var randomCipher = new Cipher(),
        template = "module.exports = exports = {\n"+
        "\n"+
        "    /**\n"+
        "     * Encryption protocol\n"+
        "     */\n"+
        "    cipher: {\n"+
        "        key: '"+randomCipher.key.toString('base64')+"',\n"+
        "        hmac_key: '"+randomCipher.hmacKey.toString('base64')+"'\n"+
        "    },\n"+
        "\n"+
        "    /**\n"+
        "     * Port to accept connections on\n"+
        "     */\n"+
        "    port: 54917\n"+
        "\n"+
        "    /**\n"+
        "     * Easypost API key (http://easypost.com)\n"+
        "     */\n"+
        "    easypost_key: ''\n"+
        "\n"+
        "};";

    console.log('generated a new config file!');

    fs.writeFileSync(__dirname+'/config.js', template);
}

var config = require('./config'),
    ShipIt = require('./lib/shipit');

var app = new ShipIt(config);
app.run();
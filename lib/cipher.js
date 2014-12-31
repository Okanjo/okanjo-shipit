/**
 * Date: 12/18/14 2:51 PM
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

var crypto = require('crypto');

module.exports = exports = Cipher;

/**
 * Provider for securely encrypting and decrypting data
 * @param key - Encryption key
 * @param hmacKey - Checksum signature key
 * @constructor
 */
function Cipher(key, hmacKey) {

    this.algorithm = 'AES-128-CBC';
    this.hmacAlgorithm = 'SHA256';
    this.clearEncoding = 'utf8';
    this.cipherEncoding = 'base64';

    this.keyLength = 16;
    this.hmacKeyLength = 16;
    this.ivLength = 16;

    this.key = key ? new Buffer(key, this.cipherEncoding) : crypto.randomBytes(this.keyLength);
    this.hmacKey = hmacKey ? new Buffer(hmacKey, this.cipherEncoding) : crypto.randomBytes(this.hmacKeyLength);
}


//noinspection JSUnusedGlobalSymbols
/**
 * Encrypts the given text
 * @param {string} plain_text - The text to encrypt
 * @param {string|null} iv - Optional, if you want to use a specific iv, then provide the base64 encoded string
 * @returns {string} - the cipher text, which is the complete encrypted string (includes data, iv and signature)
 */
Cipher.prototype.encrypt = function (plain_text, iv) {

    var IV = iv ? new Buffer(iv, this.cipherEncoding) : new Buffer(crypto.randomBytes(this.ivLength)), // ensure that the IV (initialization vector) is random
        cipher_text,
        hmac,
        encryptor = crypto.createCipheriv(this.algorithm, this.key, IV);

    encryptor.setEncoding(this.cipherEncoding);
    encryptor.write(plain_text);
    encryptor.end();

    cipher_text = encryptor.read();

    hmac = crypto.createHmac(this.hmacAlgorithm, this.hmacKey);
    hmac.update(cipher_text);
    hmac.update(IV.toString(this.cipherEncoding)); // ensure that both the IV and the cipher-text is protected by the HMAC

    // The IV isn't a secret so it can be stored along side everything else
    return cipher_text + "$" + IV.toString(this.cipherEncoding) + "$" + hmac.digest(this.cipherEncoding)

};


//noinspection JSUnusedGlobalSymbols
/**
 * Decrypts the given encrypted string
 * @param {string} cipher_text – The complete encrypted string (includes data, iv and signature)
 * @returns {string|null} - Returns the decrypted string or null if the checksum failed
 */
Cipher.prototype.decrypt = function (cipher_text) {
    var cipher_blob = cipher_text.split("$"),
        ct = cipher_blob[0],
        IV = new Buffer(cipher_blob[1], this.cipherEncoding),
        hmac = cipher_blob[2],
        decryptor,
        decryptParts = [];

    chmac = crypto.createHmac(this.hmacAlgorithm, this.hmacKey);
    chmac.update(ct);
    chmac.update(IV.toString(this.cipherEncoding));


    if (!this.constant_time_compare(chmac.digest(this.cipherEncoding), hmac)) {
        console.log("Encrypted Blob has been tampered with...");
        return null;
    }

    decryptor = crypto.createDecipheriv(this.algorithm, this.key, IV);

    decryptParts.push(decryptor.update(ct, this.cipherEncoding, this.clearEncoding));
    decryptParts.push(decryptor.final('utf-8'));
    return decryptParts.join('');

};


/**
 * Literally checks a string to make sure they're exactly the same. Overkill?
 * @param val1
 * @param val2
 * @returns {boolean}
 */
Cipher.prototype.constant_time_compare = function (val1, val2) {
    var sentinel;

    if (val1.length !== val2.length) {
        return false;
    }

    for (var i = 0; i <= (val1.length - 1); i++) {
        //noinspection JSUnusedAssignment
        sentinel |= val1.charCodeAt(i) ^ val2.charCodeAt(i);
    }

    return sentinel === 0
};
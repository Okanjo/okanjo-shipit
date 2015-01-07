<?php



class Cipher {
    private $key, $hmac_key;
    function __construct($key, $hmacKey) {
        $this->key = base64_decode($key);
        $this->hmac_key = base64_decode($hmacKey);
    }

    function secure_random_bytes($len = 16) {

        /*
         * Our primary choice for a cryptographic strong randomness function is
         * openssl_random_pseudo_bytes.
         */
        $SSLstr = '4'; // http://xkcd.com/221/
        if (function_exists('openssl_random_pseudo_bytes') &&
            (version_compare(PHP_VERSION, '5.3.4') >= 0 ||
                substr(PHP_OS, 0, 3) !== 'WIN')
        ) {
            $SSLstr = openssl_random_pseudo_bytes($len, $strong);
            if ($strong) {
                return $SSLstr;
            }
        }

        /*
         * If mcrypt extension is available then we use it to gather entropy from
         * the operating system's PRNG. This is better than reading /dev/urandom
         * directly since it avoids reading larger blocks of data than needed.
         * Older versions of mcrypt_create_iv may be broken or take too much time
         * to finish so we only use this function with PHP 5.3.7 and above.
         * @see https://bugs.php.net/bug.php?id=55169
         */
        if (function_exists('mcrypt_create_iv') &&
            (version_compare(PHP_VERSION, '5.3.7') >= 0 ||
                substr(PHP_OS, 0, 3) !== 'WIN')
        ) {
            $str = mcrypt_create_iv($len, MCRYPT_DEV_URANDOM);
            if ($str !== false) {
                return $str;
            }
        }


        /*
         * No build-in crypto randomness function found. We collect any entropy
         * available in the PHP core PRNGs along with some filesystem info and memory
         * stats. To make this data cryptographically strong we add data either from
         * /dev/urandom or if its unavailable, we gather entropy by measuring the
         * time needed to compute a number of SHA-1 hashes.
         */
        $str = '';
        $bits_per_round = 2; // bits of entropy collected in each clock drift round
        $msec_per_round = 400; // expected running time of each round in microseconds
        $hash_len = 20; // SHA-1 Hash length
        $total = $len; // total bytes of entropy to collect

        $handle = @fopen('/dev/urandom', 'rb');
        if ($handle && function_exists('stream_set_read_buffer')) {
            @stream_set_read_buffer($handle, 0);
        }

        do {
            $bytes = ($total > $hash_len) ? $hash_len : $total;
            $total -= $bytes;

            //collect any entropy available from the PHP system and filesystem
            $entropy = rand() . uniqid(mt_rand(), true) . $SSLstr;
            $entropy .= implode('', @fstat(@fopen(__FILE__, 'r')));
            $entropy .= memory_get_usage() . getmypid();
            $entropy .= serialize($_ENV) . serialize($_SERVER);
            if (function_exists('posix_times')) {
                $entropy .= serialize(posix_times());
            }
            if (function_exists('zend_thread_id')) {
                $entropy .= zend_thread_id();
            }
            if ($handle) {
                $entropy .= @fread($handle, $bytes);
            } else {
                // Measure the time that the operations will take on average
                $c2 = 0;
                $c1 = 0;
                for ($i = 0; $i < 3; $i++) {
                    $c1 = microtime(true);
                    $var = sha1(mt_rand());
                    for ($j = 0; $j < 50; $j++) {
                        $var = sha1($var);
                    }
                    $c2 = microtime(true);
                    $entropy .= $c1 . $c2;
                }

                // Based on the above measurement determine the total rounds
                // in order to bound the total running time.
                $rounds = (int)($msec_per_round * 50 / (int)(($c2 - $c1) * 1000000));

                // Take the additional measurements. On average we can expect
                // at least $bits_per_round bits of entropy from each measurement.
                $iter = $bytes * (int)(ceil(8 / $bits_per_round));
                for ($i = 0; $i < $iter; $i++) {
                    $c1 = microtime();
                    $var = sha1(mt_rand());
                    for ($j = 0; $j < $rounds; $j++) {
                        $var = sha1($var);
                    }
                    $c2 = microtime();
                    $entropy .= $c1 . $c2;
                }

            }
            // We assume sha1 is a deterministic extractor for the $entropy variable.
            $str .= sha1($entropy, true);
        } while ($len > strlen($str));

        if ($handle) {
            @fclose($handle);
        }
        return substr($str, 0, $len);
    }

    function encrypt($text, $iv = null) {

        if (empty($iv)) {
            $iv = function_exists("secure_random_bytes") ? secure_random_bytes(16) : $this->secure_random_bytes(16);
        } else {
            $iv = base64_decode($iv);
        }

        $block = mcrypt_get_block_size(MCRYPT_RIJNDAEL_128, MCRYPT_MODE_CBC);
        $padding = $block - (strlen($text) % $block);
        $text .= str_repeat(chr($padding), $padding);
        $crypttext = mcrypt_encrypt(MCRYPT_RIJNDAEL_128, $this->key, $text, MCRYPT_MODE_CBC, $iv);

        $crypttextenc = base64_encode($crypttext);

        $check = base64_encode(hash_hmac('sha256', $crypttextenc . base64_encode($iv), $this->hmac_key, true));
        $output = $crypttextenc.'$'.base64_encode($iv).'$'.$check;

        return $output;
    }

    function decrypt($encodedString) {

        $parts = explode('$', $encodedString);

        $input = base64_decode($parts[0]);
        $iv = base64_decode($parts[1]);
        $sig = $parts[2];

        $check = base64_encode(hash_hmac('sha256', $parts[0].$parts[1], $this->hmac_key, true));

        if ($check != $sig) {
            error_log('Encrypted Blob has been tampered with...');
            return null;
        }

        $dectext = trim(mcrypt_decrypt(MCRYPT_RIJNDAEL_128, $this->key, $input, MCRYPT_MODE_CBC, $iv), "\0..\32");
        return $dectext;
    }
}


//
// TEST - send the local service a test item blob
//

// Pull the key and hmac_key from the config file
$config = file_get_contents(__DIR__.'/../config.js');

preg_match('/key:\s*(?:\'|")(.+)(?:\'|")/m', $config, $matches);
$key = $matches[1];

preg_match('/hmac_key:\s*(?:\'|")(.+)(?:\'|")/m', $config, $matches);
$hmacKey = $matches[1];


//
// Test the basic informational route
//

$cipher = new Cipher($key, $hmacKey);
$encData = file_get_contents('http://localhost:54917/');
$data = $cipher->decrypt($encData);
echo "$data\n";


//
// Test the calculate route
//

$json = '{"shipping_destination":{"first_name":"John","last_name":"Smith","address_1":"220 E Buffalo St","address_2":"STE 405","city":"Milwaukee","state":"WI","zip":"53202","country":"US","phone":"4148101760"},"shipping_origins":[{"id":"7521","type":"shipping","first_name":"John","last_name":"Smith","address_1":"220 E. Buffalo St","address_2":"Suite 405","city":"Milwaukee","state":"WI","zip":"53210","country":"US","phone":"4148101760"}],"items":[{"product_id":141843,"shipping_methods":[],"get_rates":true,"tax":{"rate":0,"freight_taxable":false,"tax_source":null,"location":null},"quantity":1,"variant":"Model=AOHM-15-FB","product_type":0,"product_donation_perc":null,"product_seller_store_id":5433,"product_brand_id":29,"product_cause_id":null,"product_location_zip":"53406","product_is_local_pickup":0,"product_is_free_shipping":0,"product_use_dynamic_shipping":1,"product_thumbnail_media_id":289507,"product_price":1287,"product_title":"AOHM Series","product_description":"asdf","product_condition":"New","product_parcel":{"length":"16.7","width":"22.5","height":"13.12","weight":"800"},"product_dimensions":{"Model":{"AOHM-10":{"price_modifier":"0"},"AOHM-15":{"price_modifier":"16"},"AOHM-15-FB":{"price_modifier":"60"},"AOHM-15-S":{"price_modifier":"40"},"AOHM-15-S-FB":{"price_modifier":"116"},"AOHM-20":{"price_modifier":"102"},"AOHM-20-FB":{"price_modifier":"178"},"AOHM-20-S-FB":{"price_modifier":"252"},"AOHM-25":{"price_modifier":"315"},"AOHM-25-FB":{"price_modifier":"391"},"AOHM-25-S":{"price_modifier":"389"},"AOHM-25-S-FB":{"price_modifier":"465"},"AOHM-30":{"price_modifier":"584"},"AOHM-30-FB":{"price_modifier":"660"},"AOHM-30-S":{"price_modifier":"658"},"AOHM-30-S-FB":{"price_modifier":"734"},"AOHM-35":{"price_modifier":"811"},"AOHM-35-FB":{"price_modifier":"887"},"AOHM-35-S":{"price_modifier":"885"},"AOHM-35-S-FB":{"price_modifier":"961"},"AOHM-40":{"price_modifier":"1132"},"AOHM-40-FB":{"price_modifier":"1208"},"AOHM-40-S-FB":{"price_modifier":"1282"},"AOHM-5":{"price_modifier":"20"},"AOHM-5-FB":{"price_modifier":"56"},"AOHM-5-S":{"price_modifier":"36"}}},"product_variants":{"Model=AOHM-10":{"stock":"","parcel":{"length":"16.7","width":"22.5","height":"13.12","weight":"800"}},"Model=AOHM-15":{"stock":"","parcel":{"length":"17.09","width":"23.88","height":"15.75","weight":"960"}},"Model=AOHM-15-FB":{"stock":"","parcel":{"length":"17.09","width":"23.88","height":"15.75","weight":"960"}},"Model=AOHM-15-S":{"stock":"","parcel":{"length":"17.09","width":"23.88","height":"15.75","weight":"960"}},"Model=AOHM-15-S-FB":{"stock":"","parcel":{"length":"17.09","width":"23.88","height":"15.75","weight":"960"}},"Model=AOHM-20":{"stock":"","parcel":{"length":"17.09","width":"27.31","height":"18.38","weight":"1200"}},"Model=AOHM-20-FB":{"stock":"","parcel":{"length":"17.09","width":"27.31","height":"18.38","weight":"1200"}},"Model=AOHM-20-S-FB":{"stock":"","parcel":{"length":"17.09","width":"27.31","height":"18.38","weight":"1200"}},"Model=AOHM-25":{"stock":"","parcel":{"length":"17.09","width":"30.18","height":"23.62","weight":"1760"}},"Model=AOHM-25-FB":{"stock":"","parcel":{"length":"17.09","width":"30.18","height":"23.62","weight":"1760"}},"Model=AOHM-25-S":{"stock":"","parcel":{"length":"17.09","width":"30.18","height":"23.62","weight":"1760"}},"Model=AOHM-25-S-FB":{"stock":"","parcel":{"length":"17.09","width":"30.18","height":"23.62","weight":"1760"}},"Model=AOHM-30":{"stock":"","parcel":{"length":"16.7","width":"35.12","height":"27.56","weight":"1920"}},"Model=AOHM-30-FB":{"stock":"","parcel":{"length":"16.7","width":"35.12","height":"27.56","weight":"1920"}},"Model=AOHM-30-S":{"stock":"","parcel":{"length":"16.7","width":"35.12","height":"27.56","weight":"1920"}},"Model=AOHM-30-S-FB":{"stock":"","parcel":{"length":"16.7","width":"35.12","height":"27.56","weight":"1920"}},"Model=AOHM-35":{"stock":"","parcel":{"length":"16.7","width":"37.31","height":"30.19","weight":"2160"}},"Model=AOHM-35-FB":{"stock":"","parcel":{"length":"16.7","width":"37.31","height":"30.19","weight":"2160"}},"Model=AOHM-35-S":{"stock":"","parcel":{"length":"16.7","width":"37.31","height":"30.19","weight":"2160"}},"Model=AOHM-35-S-FB":{"stock":"","parcel":{"length":"16.7","width":"37.31","height":"30.19","weight":"2160"}},"Model=AOHM-40":{"stock":"","parcel":{"length":"16.7","width":"45.12","height":"36.75","weight":"2560"}},"Model=AOHM-40-FB":{"stock":"","parcel":{"length":"16.7","width":"45.12","height":"36.75","weight":"2560"}},"Model=AOHM-40-S-FB":{"stock":"","parcel":{"length":"16.7","width":"45.12","height":"36.75","weight":"2560"}},"Model=AOHM-5":{"stock":"","parcel":{"length":"16.7","width":"18.31","height":"11.81","weight":"560"}},"Model=AOHM-5-FB":{"stock":"","parcel":{"length":"16.7","width":"18.31","height":"11.81","weight":"560"}},"Model=AOHM-5-S":{"stock":"","parcel":{"length":"16.7","width":"18.31","height":"11.81","weight":"560"}}},"product_meta":null,"product_deal_start":null,"product_deal_end":null,"product_promo_start":null,"product_promo_end":null,"product_deal_value":null,"product_media_id_csv":"289507"}]}';

$uri = 'http://localhost:54917/calculate/rates';
$content = $cipher->encrypt($json);
echo $cipher->decrypt($content)."\n";
$http = array('method' => "POST", 'ignore_errors' => true, 'content' => $content);
$headers = array('Content-Type' => "text/plain");
if (!empty($headers)) {

    $headerLines = array();
    foreach($headers as $key => $val) {
        $headerLines[] = "$key: $val";
    }

    $http['header'] = implode("\r\n", $headerLines);
}

$stream_context = stream_context_create(array('http' => $http));
$stream_handle = fopen($uri, 'rb', false, $stream_context);
$stream_metadata = stream_get_meta_data($stream_handle);
$stream_response = @stream_get_contents($stream_handle);
$http_response = $stream_metadata['wrapper_data'][0];
$http_response_array = explode(' ', $http_response);

$response = array("headers" => [], 'contentType' => '', 'data' => $stream_response, "status" => intval($http_response_array[1]));

$arrHeaders = array_splice($stream_metadata['wrapper_data'], 1);
foreach ($arrHeaders as $header) {

    // Add response headers to an associative collection
    $parts = explode(':', $header, 2);
    if (count($parts) == 2) {
        $response['headers'][strtoupper(trim($parts[0]))] = trim($parts[1]);

        // Try to grab the content type
        if (trim(strtolower($parts[0])) == 'content-type')
            $response['contentType'] = trim($parts[1]);
    }
}

$response['data'] = $cipher->decrypt($response['data']);

print_r($response);
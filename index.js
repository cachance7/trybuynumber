/** @module Twiliode */

// Allow for later instantiation despite singleton
Twiliode.prototype.Twiliode = Twiliode;
module.exports = exports = new Twiliode();

var fs = require('fs'),
    path = require('path'),
    phone = require('node-phonenumber'),
    e164 = require('e164'),
    when = require('when'),
    winston = require('winston'),
    twilio = require('twilio');

var logger = new(winston.Logger)({
    transports: [
        new(winston.transports.Console)({
            level: 'warn'
        }),
        new(winston.transports.File)({
            filename: 'twiliode.log',
            level: 'info'
        })
    ]
});

// Squelch console output when used as a module
if (require.main != module) {
    logger.transports.console.silent = true;
}

var phoneUtil = phone.PhoneNumberUtil.getInstance();

var area_codes;
// Need these before we begin
require('csv').parse(fs.readFileSync(__dirname + '/area-codes.csv').toString(), {
    columns: ['area_code', 'state'],
    objname: 'area_code'
}, function(err, output) {
    area_codes = output;
});

/**
 * @class
 * Interacts with the Twilio API to acquire a specified US phone number (E.164)
 * or a suitable alternative should the desired number not be available.
 * Engages in lazy initialization if a config is provided.
 * @param {Object} config - Will be passed to {@link init} before calls are made.
 */
function Twiliode(config) {
    if (!(this instanceof Twiliode)) {
        return new Twiliode(config);
    }

    this.config = config;
    if((typeof this.config) === 'string'){
        this.config = path.resolve(this.config);
    }
    this.isInitialized = false;  // We'll initialize later
}

/**
 * Initializes the Twiliode instance for use.
 * @param {Object|string} config Either a config object or path to a config
 * json file with the data structure below.
 * <pre><code>
 *  {
 *      "creds": {
 *          "query": {
 *              "sid": "&lt;my_query_sid&gt;",
 *              "token": "&lt;my_query_token&gt;"
 *          },
 *          "buy": {
 *              "sid": "&lt;my_buy_sid&gt;",
 *              "token": "&lt;my_buy_token&gt;"
 *          }
 *      }
 *  }</code></pre>
 * @param {Object} config.creds - Configurable Twilio credentials
 * @param {Object} config.creds.query - Credentials for check available phone number requests
 * @param {string} config.creds.query.sid - Twilio Sid
 * @param {string} config.creds.query.token - Twilio Auth Token
 * @param {Object} config.creds.buy - Credentials for purchase phone number requests
 * @param {string} config.creds.buy.sid - Twilio Sid
 * @param {string} config.creds.buy.token - Twilio Auth Token
 */
Twiliode.prototype.init = function(config){
    if ((typeof config) === 'string') {
        this.config = require(path.resolve(config));
        config = this.config;
    } else {
        this.config        = config = config    || {};
        config.creds       = config.creds       || {};
        config.creds.query = config.creds.query || {};
        config.creds.buy   = config.creds.buy   || {};
    }

    console.log(config);
    logger.info("Twiliode created with config");
    logger.info(config);

    // If these credentials aren't provided, Twilio API will default to env vars:
    // TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
    this.queryClient = new twilio.RestClient(config.creds.query.sid, config.creds.query.token);
    this.buyClient   = new twilio.RestClient(config.creds.buy.sid,   config.creds.buy.token);
    this.isInitialized = true;
};

Twiliode.prototype._ensureInit = function(){
    console.log(this);
    if(!this.isInitialized){
        this.init(this.config);
    }
};

/**
 * Ensures that constraints object is acceptable.
 * @param {Object} constraints - Information about the number
 * @param {string} constraints.nearPhoneNumber - The number to check
 * @returns {Promise} - Fulfills to
 *      <pre><code>
 *      {
 *          number: &lt;normalized_phone_number&gt;,
 *          code: &lt;country_code&gt;
 *      }</code></pre>
 *      if succcess; rejects with Error if constraints are unacceptable.
 */
Twiliode.prototype.validateConstraints = function(constraints) {
    this._ensureInit();

    var err;

    // Fast fail for falsy input
    if (!constraints || !constraints.nearPhoneNumber) {
        return when.reject(new Error("No number provided"));
    }

    // Normalize the input for further processing
    var normalized;
    try {
        normalized = phoneUtil.parse(constraints.nearPhoneNumber);
    } catch (ex) {
        err = "Provided number was invalid: " + constraints.nearPhoneNumber;
        logger.error(err);
        return when.reject(new Error(err));
    }

    // Make sure the number resolves to a country
    var numberE164 = phoneUtil.format(normalized, phone.PhoneNumberFormat.E164)
    var country = e164.lookup(numberE164.substring(1)); //e164 doesn't like '+'
    if (!country) {
        err = "No country code for number: " + constraints.nearPhoneNumber;
        logger.error(err);
        return when.reject(new Error(err));
    }

    // Enforce the US assumption
    if (country.code !== 'US') {
        err = "Configured to only handle US numbers; number: " + constraints.nearPhoneNumber + ", code: " + country.code;
        logger.error(err);
        return when.reject(new Error(err));
    }
    var area_code = phoneUtil.format(normalized).split('-')[0];

    return when({
        number: numberE164,
        code: country.code,
        area_code: area_code,
        state: area_codes[area_code].state
    });
};

/**
 * Uses the Twilio helper library to check a phone number.
 * @param {Object} constraints - Information about the number
 * @param {string} constraints.nearPhoneNumber - The number to check
 * @returns {Promise} - Fulfills to an available number {string} if successful;
 * rejects with Error otherwise.
 */
Twiliode.prototype.queryPhoneNumberAsync = function(constraints) {
    this._ensureInit();

    var self = this;
    return this.validateConstraints(constraints)
        .then(function(numberAndCode) {
            //logger.info(numberAndCode);
            logger.info("Trying phone number " + numberAndCode.number);
            return self.queryClient.availablePhoneNumbers(numberAndCode.code).local.get({
                    contains: numberAndCode.number,
                    excludeAllAddressRequired: "false",
                    excludeLocalAddressRequired: "false",
                    excludeForeignAddressRequired: "false"
                })
                .then(maybeUseAreaCode.bind(null, self.queryClient, numberAndCode.code, numberAndCode.area_code))
                .then(maybeUseState.bind(null, self.queryClient, numberAndCode.code, numberAndCode.state))
                .then(maybeExtractNumber)
        })
        .catch(function(e) {
            err = "Error querying Twilio: " + e.message;
            logger.error(err);
            return when.reject(new Error(err, e));
        });
};

/**
 * Uses the Twilio helper library to purchase a phone number.
 * @param {Object} constraints - Information about the number
 * @param {string} constraints.nearPhoneNumber - The number to buy if available
 * @returns {Promise} Fulfills to purchased number {string} if successful;
 * rejects with Error otherwise.
 */
Twiliode.prototype.purchasePhoneNumberAsync = function(constraints) {
    this._ensureInit();

    var self = this;
    return this.queryPhoneNumberAsync(constraints)
        .then(function(number) {
            // There's a race condition here. If the number we want
            // gets snatched up before buying, then this next call
            // will fail.
            return self.buyClient.incomingPhoneNumbers.create({
                phoneNumber: number
            });
        })
        .catch(function(e) {
            err = "purchasePhoneNumberAsync failed with rejected promise from queryPhoneNumberAsync";
            logger.error(err);
            return when.reject(new Error(err, e));
        });
};

function maybeUseAreaCode(client, country, area_code, data) {
    //logger.info(data);
    if (data && data.available_phone_numbers && data.available_phone_numbers.length > 0) {
        // Desired number was available; return it
        logger.info("Skipping area code");
        return when(data); //.available_phone_numbers[0].phone_number);
    } else if (!client) {
        err = "maybeUseAreaCode requires 'client' argument";
        logger.error(err);
        return when.reject(new Error(err));
    } else if (!country) {
        err = "maybeUseAreaCode requires 'country' argument";
        logger.error(err);
        return when.reject(new Error(err));
    } else {
        if (area_code) {
            logger.info("Trying area code " + area_code);
            //logger.info("Number not available: " + numberAndCode.number);
            // Desired number was not available; try for same area code
            return client.availablePhoneNumbers(country).local.get({
                areaCode: area_code,
                excludeAllAddressRequired: "false",
                excludeLocalAddressRequired: "false",
                excludeForeignAddressRequired: "false"
            });
        } else {
            err = "maybeUseAreaCode requires 'area_code' argument";
            logger.error(err);
            return when.reject(new Error(err));
        }
    }
}

function maybeUseState(client, country, state, data) {
    if (data && data.available_phone_numbers && data.available_phone_numbers.length > 0) {
        logger.info("Skipping state");
        //logger.info("Suitable number found for area code " + area_code + "; " + data.available_phone_numbers[0].phone_number);
        return when(data); //.available_phone_numbers[0].phone_number);
    } else if (!client) {
        err = "maybeUseState requires 'client' argument";
        logger.error(err);
        return when.reject(new Error(err));
    } else if (!country) {
        err = "maybeUseState requires 'country' argument";
        logger.error(err);
        return when.reject(new Error(err));
    } else {
        //logger.info("No numbers available for area code " + area_code);
        logger.info("Trying state " + state);
        if (state) {
            return client.availablePhoneNumbers(country).local.get({
                inRegion: state,
                excludeAllAddressRequired: "false",
                excludeLocalAddressRequired: "false",
                excludeForeignAddressRequired: "false"
            });
        } else {
            err = "maybeUseState requires 'state' argument";
            logger.error(err);
            return when.reject(new Error(err));
        }
    }
}

function maybeExtractNumber(data) {
    logger.info(data);
    if (data && data.available_phone_numbers && data.available_phone_numbers.length > 0) {
        logger.info("Suitable number found: " + data.available_phone_numbers[0].phone_number);
        return when(data.available_phone_numbers[0]);
    } else {
        err = "No suitable number available";
        logger.error(err);
        return when.reject(new Error(err));
    }
}


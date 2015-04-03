/** @module trybuynumber */

"use strict";

// Allow for later instantiation despite singleton
TryBuyNumber.prototype.TryBuyNumber = TryBuyNumber;
module.exports = exports = new TryBuyNumber();

var fs = require("fs"),
    path = require("path"),
    phone = require("node-phonenumber"),
    e164 = require("e164"),
    when = require("when"),
    nodefn = require("when/node"),
    winston = require("winston"),
    twilio = require("twilio");

var logger = new(winston.Logger)({
    transports: [
        new(winston.transports.Console)({
            level: "warn"
        }),
        new(winston.transports.File)({
            filename: "TryBuyNumber.log",
            level: "info"
        })
    ]
});

// Squelch console output when used as a module
if (require.main !== module) {
    logger.transports.console.silent = true;
}

var phoneUtil = phone.PhoneNumberUtil.getInstance();

var areaCodes;
// Need these before we begin
require("csv").parse(fs.readFileSync(__dirname + "/area-codes.csv").toString(), {
    columns: ["areaCode", "state"],
    objname: "areaCode"
}, function(err, output) {
    areaCodes = output;
});

/**
 * @class
 * Interacts with the Twilio API to acquire a US phone number (E.164)
 * similar to one provided.
 * Engages in lazy initialization if a config is provided.
 * @param {Object|string} config - Will be passed to {@link init} before calls are made.
 */
function TryBuyNumber(config) {
    if (!(this instanceof TryBuyNumber)) {
        return new TryBuyNumber(config);
    }

    this.config = config;
    if((typeof this.config) === "string"){
        this.config = path.resolve(this.config);
    }
    this.isInitialized = false;  // We"ll initialize later
}

/**
 * Initializes the TryBuyNumber instance for use.
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
TryBuyNumber.prototype.init = function(config){
    var self = this;
    if ((typeof config) === "string") {
        return nodefn.call(fs.readFile, path.resolve(config))
            .then(function(cfg){
                return when(initInternal(cfg));
            })
            .catch(function(err) {
                return when.reject(err);
            });
    } else {
        return when(initInternal(config));
    }

    function initInternal(cfg){
        cfg             = cfg             || {};
        cfg.creds       = cfg.creds       || {};
        cfg.creds.query = cfg.creds.query || {};
        cfg.creds.buy   = cfg.creds.buy   || {};

        logger.info("TryBuyNumber created with config");
        logger.info(cfg);

        // If these credentials aren't provided, Twilio API will default to env vars:
        // TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
        self.queryClient = new twilio.RestClient(cfg.creds.query.sid, cfg.creds.query.token);

        // TWILIO_TEST_ACCOUNT_SID, TWILIO_TEST_AUTH_TOKEN
        self.buyClient   = new twilio.RestClient(
                cfg.creds.buy.sid || process.env.TWILIO_TEST_ACCOUNT_SID,
                cfg.creds.buy.token || process.env.TWILIO_TEST_AUTH_TOKEN);

        self.isInitialized = true;
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
TryBuyNumber.prototype.validateConstraints = function(constraints) {
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
        return when.reject(ex);
    }

    // Make sure the number resolves to a country
    var numberE164 = phoneUtil.format(normalized, phone.PhoneNumberFormat.E164);
    var country = e164.lookup(numberE164.substring(1)); //e164 doesn"t like "+"
    if (!country) {
        err = "No country code for number: " + constraints.nearPhoneNumber;
        logger.error(err);
        return when.reject(new Error(err));
    }

    // Enforce the US assumption
    if (country.code !== "US") {
        err = "Configured to only handle US numbers; number: " + constraints.nearPhoneNumber +
            ", code: " + country.code;
        logger.error(err);
        return when.reject(new Error(err));
    }
    var areaCode = phoneUtil.format(normalized).split("-")[0];

    return when({
        number: numberE164,
        code: country.code,
        areaCode: areaCode,
        state: areaCodes[areaCode].state
    });
};

/**
 * Uses the Twilio helper library to check a phone number.
 * @param {Object} constraints - Information about the number
 * @param {string} constraints.nearPhoneNumber - The number to check
 * @returns {Promise} - Fulfills to an available number {string} if successful;
 * rejects with Error otherwise.
 */
TryBuyNumber.prototype.queryPhoneNumberAsync = function(constraints, skipAreaCode) {
    var self = this;
    if(!this.isInitialized){
        return this.init(this.config)
            .then(function(){
                return self.queryPhoneNumberAsync.apply(self, arguments);
            })
            .catch(function(err) {
                return when.reject(err);
            });
    }

    return this.validateConstraints(constraints)
        .then(function(numberAndCode) {
            //logger.info(numberAndCode);
            logger.info("Looking for  phone number similar to " + numberAndCode.number);
            if(skipAreaCode){
                return requestNumberUsingState(self.queryClient, numberAndCode.code, numberAndCode.state)
                    .then(getNumberFromData);
            } else {
                return requestNumberUsingAreaCode(self.queryClient, numberAndCode.code, numberAndCode.areaCode)
                    .then(requestNumberUsingState.bind(null, self.queryClient, numberAndCode.code, numberAndCode.state))
                    .then(getNumberFromData);
            }
        })
        .catch(function(e) {
            logger.error(e);
            return when.reject(e);
        });
};

/**
 * Uses the Twilio helper library to purchase a phone number.
 * @param {Object} constraints - Information about the number
 * @param {string} constraints.nearPhoneNumber - The number to buy if available
 * @returns {Promise} Fulfills to purchased number {string} if successful;
 * rejects with Error otherwise.
 */
TryBuyNumber.prototype.purchasePhoneNumberAsync = function(constraints) {
    var self = this;
    if(!this.isInitialized){
        return this.init(this.config)
            .then(function(){
                return self.purchasePhoneNumberAsync.apply(self, arguments);
            })
            .catch(function(err) {
                return when.reject(err);
            });
    }

    if(constraints.exactPhoneNumber){
        return self.buyClient.incomingPhoneNumbers.create({
            phoneNumber: constraints.exactPhoneNumber
        })
        .then(function(number){
            logger.info(number);
            return when(number.phone_number);
        })
        .catch(function(e){  // Twilio does not reject Promises with Error
            logger.error(e.message);
            return when.reject(new Error(e.message));
        });
    } else {
        // First step: get area code
        return this.validateConstraints(constraints)
            .then(function(numberAndCode){
                // Next: attempt to buy in same area code
                return self.buyClient.incomingPhoneNumbers.create({
                    areaCode: numberAndCode.areaCode
                })
                .then(function(number){
                    return when(number.phone_number);
                })
                .catch(function(errStatus){ // Twilio doesn't reject promise with Error
                    if(errStatus.code === "21452") { // This is the 'No phone numbers found in area code' error
                        // If area code is full, query for one in same state
                        return self.queryPhoneNumberAsync(constraints, true)
                            .then(function(availableNumber){
                                // Now buy that available number
                                return self.buyClient.incomingPhoneNumbers.create({
                                    phoneNumber: availableNumber
                                })
                                .then(function(number){
                                    return when(number.phone_number);
                                });
                            });
                    } else {
                        // Twilio doesn't reject Promises with Error so wrap it up
                        return when.reject(new Error(errStatus.message));
                    }
                });
            })
            .catch(function(e) {
                logger.error(e.message);
                return when.reject(e);
            });
    }
};

function requestNumberUsingAreaCode(client, country, areaCode) {
    var err;
    if (!client) {
        err = "maybeUseAreaCode requires 'client' argument";
        logger.error(err);
        return when.reject(new Error(err));
    } else if (!country) {
        err = "maybeUseAreaCode requires 'country' argument";
        logger.error(err);
        return when.reject(new Error(err));
    } else {
        if (areaCode) {
            logger.info("Trying area code " + areaCode);
            //logger.info("Number not available: " + numberAndCode.number);
            // Desired number was not available; try for same area code
            return client.availablePhoneNumbers(country).local.get({
                areaCode: areaCode,
                excludeAllAddressRequired: "false",
                excludeLocalAddressRequired: "false",
                excludeForeignAddressRequired: "false"
            })
            .catch(function(errStatus){ // Twilio doesn't reject Promises with Error
                return when.reject(new Error(errStatus.message));
            });
        } else {
            err = "maybeUseAreaCode requires 'areaCode' argument";
            logger.error(err);
            return when.reject(new Error(err));
        }
    }
}

function requestNumberUsingState(client, country, state, data) {
    var err;
    if (data && data.available_phone_numbers && data.available_phone_numbers.length > 0) {
        logger.info("Skipping state");
        //logger.info("Suitable number found for area code " + areaCode + "; " +
        //  data.available_phone_numbers[0].phone_number);
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
        //logger.info("No numbers available for area code " + areaCode);
        logger.info("Trying state " + state);
        if (state) {
            return client.availablePhoneNumbers(country).local.get({
                inRegion: state,
                excludeAllAddressRequired: "false",
                excludeLocalAddressRequired: "false",
                excludeForeignAddressRequired: "false"
            })
            .catch(function(errStatus){ // Twilio doesn't reject Promises with Error
                return when.reject(new Error(errStatus.message));
            });
        } else {
            err = "maybeUseState requires 'state' argument";
            logger.error(err);
            return when.reject(new Error(err));
        }
    }
}

function getNumberFromData(data) {
    var err;
    logger.info(data);
    if (data && data.available_phone_numbers && data.available_phone_numbers.length > 0) {
        logger.info("Suitable number found: " + data.available_phone_numbers[0].phone_number);
        return when(data.available_phone_numbers[0].phone_number);
    } else {
        err = "No suitable number available";
        logger.error(err);
        return when.reject(new Error(err));
    }
}


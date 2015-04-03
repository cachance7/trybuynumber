"use strict";

var VALID_TAKEN_MAGIC      = "+15005550000";         // Twilio magic number unavailable
var VALID_MAGIC            = "+15005550006";         // Twilio magic number
var VALID_UNTAKEN          = "+13027216874";         // DE phone number (as of 3/31/15)
var VALID_TAKEN_AREA_OPEN  = "+16175425942";         // FSF phone number
var VALID_TAKEN_AREA_FULL  = "+12128766737";         // White Castle in Manhattan
var VALID_TAKEN_STATE_FULL = "+19073330413";         // Alaska McDonalds
var INVALID_NUMBER         = "01189998819991197253"; // Emergency hotline
var INVALID_COUNTRY_NUMBER = "+44(0)1604230230";     // GB phone number

var tbn = require("../index.js");
var config, tn, skipApiTests;
try {
    var fs = require("fs");
    var assert = require("assert");
    var argv = require("optimist").argv;
    var configFilePath = argv.config;
    if(configFilePath){
        assert.ok(fs.existsSync(configFilePath), "config file not found at path: " + configFilePath);
    }
    var config = require("nconf").env().argv().file({file: configFilePath});
    tn = new tbn.TryBuyNumber(config.get());
} catch(ex) {
    // If a config file was specified but not found, fail immediately
    if(ex instanceof assert.AssertionError){
        throw ex;
    }

    if(!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)){
        console.warn("No config file found or Twilio environment variables set -- skipping API tests");
        skipApiTests = true;
    } else {
        console.log("Using Twilio environment variables in tests");
    }
    tn = tbn;
}


describe("TryBuyNumber", function(){
    describe("#validateConstraints", function(){
        it("accept constraints with valid nearPhoneNumber", function(){
            return tbn.validateConstraints({nearPhoneNumber: VALID_TAKEN_AREA_OPEN}).should.eventually.be.fulfilled;
        });
        it("reject no constraints", function(){
            return tbn.validateConstraints().should.eventually.be.rejected;
        });
        it("reject empty constraints", function(){
            return tbn.validateConstraints({}).should.eventually.be.rejected;
        });
        it("reject invalid number", function(){
            return tbn.validateConstraints({nearPhoneNumber: INVALID_NUMBER}).should.eventually.be.rejected;
        });
        it("reject non-US country code", function(){
            return tbn.validateConstraints({nearPhoneNumber: INVALID_COUNTRY_NUMBER}).should.eventually.be.rejected;
        });
    });

    describe("#queryPhoneNumberAsync", function(){
        it("reject invalid phone number", function(){
            if(skipApiTests) return this.skip();

            return tn.queryPhoneNumberAsync(INVALID_NUMBER).should.eventually.be.rejected;
        });

        it("check Twilio with # from open area code", function(){
            if(skipApiTests) return this.skip();

            this.timeout(15000);
            return tn.queryPhoneNumberAsync({nearPhoneNumber: VALID_TAKEN_AREA_OPEN}).should.eventually.be.fulfilled;
        });

        it("check Twilio with # from full area code", function(){
            if(skipApiTests) return this.skip();

            this.timeout(15000);
            return tn.queryPhoneNumberAsync({nearPhoneNumber: VALID_TAKEN_AREA_FULL}).should.eventually.be.fulfilled;
        });

        it("check Twilio with # from state not served (AK)", function(){
            if(skipApiTests) return this.skip();

            this.timeout(15000);
            return tn.queryPhoneNumberAsync({nearPhoneNumber: VALID_TAKEN_STATE_FULL}).should.eventually.be.rejected;
        });
    });

    describe("#purchasePhoneNumberAsync", function(){
        it("directly purchase using Twilio magic number", function(){
            if(skipApiTests) return this.skip();

            this.timeout(15000);
            return tn.purchasePhoneNumberAsync({exactPhoneNumber: VALID_MAGIC}).should.become(VALID_MAGIC);
        });

        it("purchase near using Twilio taken magic number ", function(){
            if(skipApiTests) return this.skip();

            this.timeout(15000);
            // NOTE: This will fail if using test credentials
            return tn.purchasePhoneNumberAsync({nearPhoneNumber: VALID_TAKEN_MAGIC}).should.eventually.be.fulfilled;
        });

        it("purchase near valid number using Twilio (will fail if using test credentials)", function(){
            if(skipApiTests) return this.skip();

            this.timeout(15000);
            // NOTE: This will fail if using test credentials
            return tn.purchasePhoneNumberAsync({nearPhoneNumber: VALID_UNTAKEN}).should.eventually.be.fulfilled;
        });
    });
});

var when = require('when');
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.should();
chai.use(chaiAsPromised);

var VALID_TAKEN_MAGIC      = "+15005550000";         // Twilio magic number unavailable
var VALID_MAGIC            = "+15005550006";         // Twilio magic number
var VALID_UNTAKEN          = "+13027216874";         // DE phone number (as of 3/31/15)
var VALID_TAKEN_AREA_OPEN  = "+16175425942";         // FSF phone number
var VALID_TAKEN_AREA_FULL  = "+12128766737";         // White Castle in Manhattan
var VALID_TAKEN_STATE_FULL = "+19073330413";         // Alaska McDonalds
var INVALID_NUMBER         = "01189998819991197253"; // Emergency hotline
var INVALID_COUNTRY_NUMBER = "+44(0)1604230230";     // GB phone number

var tbn = require("./");//('./config.json');
var tn = new tbn.TryBuyNumber("../../casey.json");

describe("TryBuyNumber", function(){
    describe("#validateConstraints", function(){
        it("accept constraints with valid nearPhoneNumber", function(){
            return tn.validateConstraints({nearPhoneNumber: VALID_TAKEN_AREA_OPEN}).should.eventually.be.fulfilled;
        });
        it("reject no constraints", function(){
            return tn.validateConstraints().should.eventually.be.rejected;
        });
        it("reject empty constraints", function(){
            return tn.validateConstraints({}).should.eventually.be.rejected;
        });
        it("reject invalid number", function(){
            return tn.validateConstraints({nearPhoneNumber: INVALID_NUMBER}).should.eventually.be.rejected;
        });
        it("reject non-US country code", function(){
            return tn.validateConstraints({nearPhoneNumber: INVALID_COUNTRY_NUMBER}).should.eventually.be.rejected;
        });
    });

    describe("#queryPhoneNumberAsync", function(){
        it("reject invalid phone number", function(){
            return tn.queryPhoneNumberAsync(INVALID_NUMBER).should.eventually.be.rejected;
        });

        it("check Twilio with # from open area code", function(){
            this.timeout(15000);
            return tn.queryPhoneNumberAsync({nearPhoneNumber: VALID_TAKEN_AREA_OPEN}).should.eventually.be.fulfilled;
        });

        it("check Twilio with # from full area code", function(){
            this.timeout(15000);
            return tn.queryPhoneNumberAsync({nearPhoneNumber: VALID_TAKEN_AREA_FULL}).should.eventually.be.fulfilled;
        });

        it("check Twilio with # from state not served (AK)", function(){
            this.timeout(15000);
            return tn.queryPhoneNumberAsync({nearPhoneNumber: VALID_TAKEN_STATE_FULL}).should.eventually.be.rejected;
        });
    });

    describe("#purchasePhoneNumberAsync", function(){
        it("directly purchase using Twilio magic number", function(){
            this.timeout(15000);
            return tn.purchasePhoneNumberAsync({exactPhoneNumber: VALID_MAGIC}).should.become(VALID_MAGIC);
        });

        it("purchase near using Twilio taken magic number ", function(){
            this.timeout(15000);
            // NOTE: This will fail if using test credentials
            return tn.purchasePhoneNumberAsync({nearPhoneNumber: VALID_TAKEN_MAGIC}).should.eventually.be.fulfilled;
        });

        it("purchase near valid number using Twilio (will fail if using test credentials)", function(){
            this.timeout(15000);
            // NOTE: This will fail if using test credentials
            return tn.purchasePhoneNumberAsync({nearPhoneNumber: VALID_UNTAKEN}).should.eventually.be.fulfilled;
        });
    });
});

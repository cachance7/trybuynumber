var when = require('when');
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.should();
chai.use(chaiAsPromised);

var VALID_UNTAKEN          = "+14105751920";         // MD phone number
var VALID_TAKEN_AREA_OPEN  = "+16175425942";         // FSF phone number
var VALID_TAKEN_AREA_FULL  = "+12128766737";         // White Castle in Manhattan
var VALID_TAKEN_STATE_FULL = "+19073330413";         // Alaska McDonalds
var INVALID_NUMBER         = "01189998819991197253"; // Emergency hotline
var INVALID_COUNTRY_NUMBER = "+44(0)1604230230";     // GB phone number

var tn = require("./index");//('./config.json');

describe("Twiliode", function(){
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

        //it("accept valid number and purchase", function(){
        //    this.timeout(5000);
        //    return tn.purchasePhoneNumberAsync({nearPhoneNumber: validNumber}).should.eventually.be.fulfilled;
        //});
    });
});

TryBuyNumber
===

Simple [Twilio](https://www.twilio.com)-backed US phone number acquisition module.

Attempts to acquire a phone number similar to one specfied according to the following rules:

1. The module accepts a phone number and tries to purchase another number in the same area code.
2. If no phone number is available in the same area code, it attempts to purchase a phone number which is in the same state as the input phone number.

Installation
---

```$ npm install trybuynumber```

Usage
---

This form assumes the Twilio environment variables (TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN) are appropriately set.
```
var tbn = require('trybuynumber');

tbn.purchasePhoneNumberAsync({nearPhoneNumber: '+16196210102'})
  .then(function(purchasedNumber) {
    console.log('Yeay - I am proud owner of ' + purchasedNumber);
  })
  .catch(function(error) {
    console.error(error);
  });

```

Alternatively, you can specify the path to a JSON config file which specifies multiple sets of credentials.

```
var trybuynumber = require('trybuynumber');
var tbn = new trybuynumber.TryBuyNumber('/path/to/config.json');

tbn.purchasePhoneNumberAsync({nearPhoneNumber: '+16196210102'})
  .then(function(purchasedNumber) {
    console.log('Yeay - I am proud owner of ' + purchasedNumber);
  })
  .catch(function(error) {
    console.error(error);
  });

```

Config file format below:
```
{
    "creds": {
        "query": {
            "sid": "my_query_sid",
            "token": "my_query_token"
        },
        "buy": {
            "sid": "my_purchasing_sid",
            "token": "my_purchasing_token"
        }
    }
}
```
